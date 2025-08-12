import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Pair } from '@/models/Pair';
import type { UserType } from '@/models/User';
import type { PairType } from '@/models/Pair';
import type { Axis } from '@/models/ActivityTemplate';

const AXES: readonly Axis[] = [
  'communication', 'domestic', 'personalViews', 'finance', 'sexuality', 'psyche'
] as const;

const HIGH  = 2.0;
const LOW   = 0.75;
const DELTA = 2.0;

const inter = (a: string[] = [], b: string[] = []) => a.filter(x => b.includes(x));

/** Строим «паспорт пары» по двум пользователям */
function buildPassport(a: UserType, b: UserType): NonNullable<PairType['passport']> {
  const strongSides:   { axis: Axis; facets: string[] }[] = [];
  const riskZones:     { axis: Axis; facets: string[]; severity: 1 | 2 | 3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta:    { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const A = a.vectors[axis];
    const B = b.vectors[axis];

    const bothHigh = A.level >= HIGH && B.level >= HIGH;
    const bothLow  = A.level <= LOW  && B.level <= LOW;
    const delta    = Math.abs(A.level - B.level);

    const pp       = inter(A.positives, B.positives);
    const nn       = inter(A.negatives, B.negatives);
    const AcoversB = inter(A.positives, B.negatives);
    const BcoversA = inter(B.positives, A.negatives);

    if (pp.length || bothHigh) {
      strongSides.push({ axis, facets: pp });
    }

    if (nn.length || bothLow || delta > DELTA) {
      const facets = nn.length ? nn : [];
      const severity: 1 | 2 | 3 =
        delta > DELTA + 1 ? 3 : (bothLow || nn.length >= 2 ? 2 : 1);
      riskZones.push({ axis, facets, severity });
    }

    if (AcoversB.length || BcoversA.length) {
      complementMap.push({ axis, A_covers_B: AcoversB, B_covers_A: BcoversA });
    }

    if (delta > 0.01) levelDelta.push({ axis, delta });
  }

  return { strongSides, riskZones, complementMap, levelDelta };
}

/** POST /api/pairs/create  { userId, partnerId } */
export async function POST(req: NextRequest) {
  const { userId, partnerId } = (await req.json()) as { userId?: string; partnerId?: string };
  if (!userId || !partnerId) {
    return NextResponse.json({ error: 'userId and partnerId are required' }, { status: 400 });
  }

  await connectToDatabase();

  const [u, v] = await Promise.all([
    User.findOne({ id: userId }).lean<UserType>(),
    User.findOne({ id: partnerId }).lean<UserType>(),
  ]);

  if (!u || !v) {
    return NextResponse.json({ error: 'users not found' }, { status: 404 });
  }

  // фиксированный порядок и ключ
  const members: [string, string] = [u.id, v.id].sort() as [string, string];
  const key = `${members[0]}|${members[1]}`;

  // не дублируем активную пару
  const exists = await Pair.findOne({ key, status: { $in: ['active', 'paused'] } }).lean();
  if (exists) {
    return NextResponse.json({ error: 'pair already exists' }, { status: 409 });
  }

  const passport = buildPassport(u, v);

  const pair = await Pair.create({
    members,
    key,
    status: 'active',
    passport,
    fatigue:   { score: 0, updatedAt: new Date() },
    readiness: { score: 0, updatedAt: new Date() },
  } as Partial<PairType>);

  return NextResponse.json({ ok: true, pairId: String(pair._id) });
}
