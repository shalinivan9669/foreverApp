// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { ActivityTemplate, type Axis, type ActivityTemplateType } from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';
import { requireSession } from '@/lib/auth/guards';
import { jsonForbidden } from '@/lib/auth/errors';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

const AXES: readonly Axis[] = ['communication', 'domestic', 'personalViews', 'finance', 'sexuality', 'psyche'] as const;
const HIGH = 2.0;
const LOW = 0.75;
const DELTA = 2.0;
const inter = (a: string[] = [], b: string[] = []) => a.filter((x) => b.includes(x));

function buildPassport(a: UserType, b: UserType) {
  const strongSides: { axis: Axis; facets: string[] }[] = [];
  const riskZones: { axis: Axis; facets: string[]; severity: 1 | 2 | 3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta: { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const A = a.vectors[axis];
    const B = b.vectors[axis];
    const bothHigh = A.level >= HIGH && B.level >= HIGH;
    const bothLow = A.level <= LOW && B.level <= LOW;
    const delta = Math.abs(A.level - B.level);

    const pp = inter(A.positives, B.positives);
    const nn = inter(A.negatives, B.negatives);
    const AcoversB = inter(A.positives, B.negatives);
    const BcoversA = inter(B.positives, A.negatives);

    if (pp.length || bothHigh) strongSides.push({ axis, facets: pp });
    if (nn.length || bothLow || delta > DELTA) {
      const severity: 1 | 2 | 3 = delta > DELTA + 1 ? 3 : bothLow || nn.length >= 2 ? 2 : 1;
      riskZones.push({ axis, facets: nn.length ? nn : [], severity });
    }
    if (AcoversB.length || BcoversA.length) complementMap.push({ axis, A_covers_B: AcoversB, B_covers_A: BcoversA });
    if (delta > 0.01) levelDelta.push({ axis, delta });
  }
  return { strongSides, riskZones, complementMap, levelDelta };
}

async function seedSuggestionsForPair(pairId: Types.ObjectId) {
  const offeredExists = await PairActivity.exists({ pairId, status: 'offered' });
  if (offeredExists) return;

  const pair = await Pair.findById(pairId).lean();
  if (!pair?.passport?.riskZones?.length) return;

  const topRisk = pair.passport.riskZones
    .slice()
    .sort((a, b) => b.severity - a.severity)[0] as { axis: Axis; severity: 1 | 2 | 3 };
  const difficulty = topRisk.severity;

  const templates = await ActivityTemplate.aggregate<ActivityTemplateType>([
    {
      $match: {
        axis: topRisk.axis,
        difficulty: { $in: [difficulty, Math.max(1, difficulty - 1), Math.min(5, difficulty + 1)] },
      },
    },
    { $sample: { size: 3 } },
  ]);

  if (!templates.length) return;

  const users = await User.find({ id: { $in: pair.members } }).lean<(UserType & { _id: Types.ObjectId })[]>();
  const [uA, uB] = pair.members.map((did) => users.find((u) => u.id === did)!);
  const members: [Types.ObjectId, Types.ObjectId] = [uA._id, uB._id];

  const now = new Date();
  await Promise.all(
    templates.map((tpl) =>
      PairActivity.create({
        pairId,
        members,
        intent: tpl.intent,
        archetype: tpl.archetype,
        axis: tpl.axis,
        facetsTarget: tpl.facetsTarget ?? [],
        title: tpl.title,
        description: tpl.description,
        why: { ru: `Р Р°Р±РѕС‚Р° СЃ СЂРёСЃРєРѕРј РїРѕ РѕСЃРё ${topRisk.axis}`, en: `Work on ${topRisk.axis} risk` },
        mode: 'together',
        sync: 'sync',
        difficulty: tpl.difficulty,
        intensity: tpl.intensity,
        timeEstimateMin: tpl.timeEstimateMin,
        costEstimate: tpl.costEstimate,
        location: tpl.location ?? 'any',
        materials: tpl.materials ?? [],
        offeredAt: now,
        dueAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
        requiresConsent: tpl.requiresConsent,
        status: 'offered',
        checkIns: tpl.checkIns,
        effect: tpl.effect,
        createdBy: 'system',
      })
    )
  );
}

type Body = { likeId: string; userId?: string }; // userId legacy field is ignored

const bodySchema = z
  .object({
    likeId: z.string().min(1),
    userId: z.string().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const { likeId } = body.data as Body;

  const likeGuard = await requireLikeParticipant(likeId, currentUserId);
  if (!likeGuard.ok) return likeGuard.response;

  const { like, role } = likeGuard.data;
  if (role !== 'from') return jsonForbidden('AUTH_FORBIDDEN', 'forbidden');
  if (like.status !== 'mutual_ready' || !like.recipientResponse) {
    return jsonError(400, 'LIKE_NOT_READY', 'not ready');
  }

  const [u, v] = await Promise.all([
    User.findOne({ id: like.fromId }).lean<UserType | null>(),
    User.findOne({ id: like.toId }).lean<UserType | null>(),
  ]);
  if (!u || !v) return jsonError(404, 'USER_NOT_FOUND', 'users missing');

  const members = [u.id, v.id].sort() as [string, string];
  const key = `${members[0]}|${members[1]}`;

  const pair = await Pair.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, members, progress: { streak: 0, completed: 0 } }, $set: { status: 'active' } },
    { new: true, upsert: true }
  );

  const needPassport =
    !pair.passport ||
    !Array.isArray(pair.passport.riskZones) ||
    pair.passport.riskZones.length === 0;

  if (needPassport) {
    pair.passport = buildPassport(u, v);
    await pair.save();
  }

  await Like.updateOne({ _id: like._id }, { $set: { status: 'paired', updatedAt: new Date() } });

  await Like.updateMany(
    {
      _id: { $ne: like._id },
      $or: [{ fromId: like.fromId, toId: like.toId }, { fromId: like.toId, toId: like.fromId }],
      status: { $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready'] },
    },
    { $set: { status: 'expired' } }
  );

  await User.updateMany({ id: { $in: members } }, { $set: { 'personal.relationshipStatus': 'in_relationship' } });

  await seedSuggestionsForPair(pair._id as Types.ObjectId);

  return jsonOk({ pairId: String(pair._id), members });
}

