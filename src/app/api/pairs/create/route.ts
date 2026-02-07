// src/app/api/pairs/create/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import { Like } from '@/models/Like';
import type { Axis } from '@/models/ActivityTemplate';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

const AXES: readonly Axis[] = ['communication','domestic','personalViews','finance','sexuality','psyche'] as const;
const HIGH = 2.0, LOW = 0.75, DELTA = 2.0;
const inter = (a: string[] = [], b: string[] = []) => a.filter(x => b.includes(x));

const bodySchema = z
  .object({
    userId: z.string().optional(),
    partnerId: z.string().optional(),
    likeId: z.string().optional(),
  })
  .strict();

function buildPassport(a: UserType, b: UserType): NonNullable<PairType['passport']> {
  const strongSides: { axis: Axis; facets: string[] }[] = [];
  const riskZones:   { axis: Axis; facets: string[]; severity: 1|2|3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta: { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const A = a.vectors[axis], B = b.vectors[axis];
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

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const { partnerId, likeId } = body || {};

  await connectToDatabase();

  const aId = currentUserId;
  let bId = partnerId ?? '';

  // поддержка старого контракта: пришёл likeId
  if (!partnerId && likeId) {
    const like = await Like.findById(likeId);
    if (!like) return jsonError(404, 'LIKE_NOT_FOUND', 'like not found');
    bId = like.fromId === aId ? like.toId : like.fromId;
  }

  if (!aId || !bId) {
    return jsonError(400, 'PARTNER_OR_LIKE_REQUIRED', 'partnerId or likeId is required');
  }

  const [u, v] = await Promise.all([
    User.findOne({ id: aId }).lean<UserType | null>(),
    User.findOne({ id: bId }).lean<UserType | null>(),
  ]);
  if (!u || !v) return jsonError(404, 'USER_NOT_FOUND', 'users not found');

  const members = [u.id, v.id].sort() as [string, string];
  const key = `${members[0]}|${members[1]}`;

  const exists = await Pair.findOne({ key, status: { $in: ['active', 'paused'] } }).lean();
  if (exists) return jsonError(409, 'PAIR_ALREADY_EXISTS', 'pair already exists');

  const passport = buildPassport(u, v);
  const pair = await Pair.create({
    members, key, status: 'active',
    passport,
    fatigue:   { score: 0, updatedAt: new Date() },
    readiness: { score: 0, updatedAt: new Date() },
  } as Partial<PairType>);

  return jsonOk({ pairId: String(pair._id) });
}
