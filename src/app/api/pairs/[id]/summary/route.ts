// src/app/api/pairs/[id]/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { Like } from '@/models/Like';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;

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

  return NextResponse.json({
    pair,
    currentActivity: current ?? null,
    suggestedCount,
    lastLike: lastLike
      ? {
          id: String(lastLike._id),
          matchScore: lastLike.matchScore,
          updatedAt: lastLike.updatedAt,
          fromId: lastLike.fromId,
          toId: lastLike.toId,
          agreements: lastLike.agreements ?? [],
          answers: lastLike.answers ?? [],
          recipientResponse: lastLike.recipientResponse ?? null,
        }
      : null,
  });
}
