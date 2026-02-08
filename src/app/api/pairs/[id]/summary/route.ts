// src/app/api/pairs/[id]/summary/route.ts
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { Like } from '@/models/Like';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { toLikeSummaryDTO, toPairActivityDTO, toPairDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) {
    let foundPairId: string | null = null;
    let membershipOk = false;

    if (Types.ObjectId.isValid(id)) {
      const pairDoc = await Pair.findById(id)
        .select({ _id: 1, members: 1 })
        .lean<{ _id: Types.ObjectId; members: string[] } | null>();

      if (pairDoc) {
        foundPairId = String(pairDoc._id);
        membershipOk = pairDoc.members.includes(currentUserId);
      }
    }

    console.warn('[pairs.summary] pair access check failed', {
      userId: currentUserId,
      requestedPairId: id,
      foundPairId,
      membershipOk,
    });
    return pairGuard.response;
  }

  await connectToDatabase();
  const pair = pairGuard.data.pair;
  const pairId = pair._id as Types.ObjectId;

  // текущая активность
  const current = await PairActivity.findOne({
    pairId,
    status: { $in: ['accepted', 'in_progress', 'awaiting_checkin'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  // количество предложенных
  const suggestedCount = await PairActivity.countDocuments({ pairId, status: 'offered' });

  // последний лайк, по которому пара образована
  const [a, b] = pair.members;
  const lastLike = await Like.findOne({
    status: 'paired',
    $or: [{ fromId: a, toId: b }, { fromId: b, toId: a }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  return jsonOk({
    pair: toPairDTO(pair, { includePassport: true, includeMetrics: true }),
    currentActivity: current
      ? toPairActivityDTO(current, { includeAnswers: false })
      : null,
    suggestedCount,
    lastLike: lastLike ? toLikeSummaryDTO(lastLike) : null,
  });
}
