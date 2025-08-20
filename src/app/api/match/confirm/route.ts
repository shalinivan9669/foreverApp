// src/app/api/match/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import type { Axis } from '@/models/ActivityTemplate';

const AXES: readonly Axis[] = ['communication','domestic','personalViews','finance','sexuality','psyche'] as const;
const HIGH = 2.0, LOW = 0.75, DELTA = 2.0;
const inter = (a: string[] = [], b: string[] = []) => a.filter(x => b.includes(x));

function buildPassport(a: UserType, b: UserType) {
  const strongSides:   { axis: Axis; facets: string[] }[] = [];
  const riskZones:     { axis: Axis; facets: string[]; severity: 1|2|3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta:    { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const A = a.vectors[axis]; const B = b.vectors[axis];
    const bothHigh = A.level >= HIGH && B.level >= HIGH;
    const bothLow  = A.level <= LOW  && B.level <= LOW;
    const delta    = Math.abs(A.level - B.level);

    const pp = inter(A.positives, B.positives);
    const nn = inter(A.negatives, B.negatives);
    const AcoversB = inter(A.positives, B.negatives);
    const BcoversA = inter(B.positives, A.negatives);

    if (pp.length || bothHigh) strongSides.push({ axis, facets: pp });
    if (nn.length || bothLow || delta > DELTA) {
      const severity: 1|2|3 = delta > DELTA + 1 ? 3 : (bothLow || nn.length >= 2 ? 2 : 1);
      riskZones.push({ axis, facets: nn.length ? nn : [], severity });
    }
    if (AcoversB.length || BcoversA.length) complementMap.push({ axis, A_covers_B: AcoversB, B_covers_A: BcoversA });
    if (delta > 0.01) levelDelta.push({ axis, delta });
  }
  return { strongSides, riskZones, complementMap, levelDelta };
}

type Body = { likeId: string; userId: string };

export async function POST(req: NextRequest) {
  const { likeId, userId } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();

  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // подтверждать пару может ТОЛЬКО инициатор
  if (like.fromId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // должны иметься ответы получателя
  if (!like.recipientResponse) return NextResponse.json({ error: 'not ready' }, { status: 400 });

  // разрешаем вызывать как из 'awaiting_initiator', так и из 'mutual_ready'
  if (like.status !== 'awaiting_initiator' && like.status !== 'mutual_ready') {
    return NextResponse.json({ error: `invalid status ${like.status}` }, { status: 400 });
  }

  const [u, v] = await Promise.all([
    User.findOne({ id: like.fromId }).lean<UserType | null>(),
    User.findOne({ id: like.toId   }).lean<UserType | null>(),
  ]);
  if (!u || !v) return NextResponse.json({ error: 'users missing' }, { status: 404 });

  const members = [u.id, v.id].sort() as [string, string];
  const key = `${members[0]}|${members[1]}`;

  // создаём/находим пару и при необходимости записываем паспорт
  const passport = buildPassport(u, v);

  const pair = await Pair.findOneAndUpdate(
    { key },
    {
      $setOnInsert: {
        key,
        members,
        status: 'active',
        progress: { streak: 0, completed: 0 },
        passport,
        fatigue:   { score: 0, updatedAt: new Date() },
        readiness: { score: 0, updatedAt: new Date() },
      },
      $set: { passport }, // если пары не было с паспортом — проставим
    },
    { new: true, upsert: true }
  ).lean();

  // помечаем лайк как принятый
  const now = new Date();
  await Like.updateOne(
    { _id: like._id },
    {
      $set: {
        status: 'accepted',
        initiatorDecision: { accepted: true, at: now },
        updatedAt: now,
      },
    }
  );

  // гасим конкурирующие лайки между этими пользователями
  await Like.updateMany(
    {
      _id: { $ne: like._id },
      $or: [{ fromId: like.fromId, toId: like.toId }, { fromId: like.toId, toId: like.fromId }],
      status: { $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready'] },
    },
    { $set: { status: 'expired' } }
  );

  // обновим статус отношений у пользователей (не критично, но полезно)
  await User.updateMany(
    { id: { $in: members } },
    { $set: { 'personal.relationshipStatus': 'in_relationship' } }
  );

  return NextResponse.json({ ok: true, pairId: String(pair?._id), members });
}
