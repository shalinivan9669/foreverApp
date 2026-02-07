// src/app/api/match/like/[id]/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { toLikeDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

interface Ctx {
  params: Promise<{ id: string }>;
}

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

  const likeGuard = await requireLikeParticipant(id, currentUserId);
  if (!likeGuard.ok) return likeGuard.response;
  const like = likeGuard.data.like;

  const users = await User.find({ id: { $in: [like.fromId, like.toId] } })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserType[]>();

  const byId = new Map(users.map((user) => [user.id, user]));

  const likeInput: Parameters<typeof toLikeDTO>[0] = {
    _id: like._id,
    fromId: like.fromId,
    toId: like.toId,
    matchScore: like.matchScore,
    status: like.status,
    createdAt: like.createdAt,
    updatedAt: like.updatedAt,
    fromCardSnapshot: like.fromCardSnapshot,
    recipientResponse: like.recipientResponse,
    recipientDecision: like.recipientDecision,
    initiatorDecision: like.initiatorDecision,
    agreements: like.agreements,
    answers: like.answers,
    cardSnapshot: like.cardSnapshot,
  };

  const dto = toLikeDTO(likeInput, {
    fromUser: byId.get(like.fromId) ?? null,
    toUser: byId.get(like.toId) ?? null,
    includeLegacy: true,
    avatarMode: 'url',
  });

  return jsonOk(dto);
}
