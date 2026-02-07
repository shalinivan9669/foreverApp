import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Like, type LikeType, type LikeStatus } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonForbidden } from '@/lib/auth/errors';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseQuery } from '@/lib/api/validate';

type Body = {
  userId?: string; // legacy client field, ignored
  likeId?: string;
  agreements: [true, true, true];
  answers: [string, string];
};

const querySchema = z
  .object({
    id: z.string().optional(),
  })
  .passthrough();

const bodySchema = z
  .object({
    userId: z.string().optional(),
    likeId: z.string().optional(),
    agreements: z.tuple([z.literal(true), z.literal(true), z.literal(true)]),
    answers: z.tuple([z.string(), z.string()]),
  })
  .strict();

const clamp = (s: string | null | undefined, max: number) =>
  String(s ?? '').trim().slice(0, max);

function buildInitiatorSnapshot(u: UserType | null): LikeType['fromCardSnapshot'] | undefined {
  const c = u?.profile?.matchCard;
  if (!c?.isActive) return undefined;
  if (!c.requirements?.length || !c.questions?.length) return undefined;
  return {
    requirements: [
      clamp(c.requirements[0], 80),
      clamp(c.requirements[1], 80),
      clamp(c.requirements[2], 80),
    ] as [string, string, string],
    questions: [
      clamp(c.questions[0], 120),
      clamp(c.questions[1], 120),
    ] as [string, string],
    updatedAt: c.updatedAt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const query = parseQuery(req, querySchema);
    if (!query.ok) return query.response;

    const auth = requireSession(req);
    if (!auth.ok) return auth.response;
    const currentUserId = auth.data.userId;

    const bodyResult = await parseJson(req, bodySchema);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data as Body;
    const likeId = body.likeId ?? query.data.id ?? '';

    if (!likeId) return jsonError(400, 'LIKE_ID_MISSING', 'missing id');

    const likeGuard = await requireLikeParticipant(likeId, currentUserId);
    if (!likeGuard.ok) return likeGuard.response;

    const { like, role } = likeGuard.data;
    if (role !== 'to') return jsonForbidden('AUTH_FORBIDDEN', 'forbidden');

    const allowed: LikeStatus[] = ['sent', 'viewed'];
    if (!allowed.includes(like.status)) return jsonError(409, 'LIKE_INVALID_STATE', 'invalid state');

    const initiator = await User.findOne({ id: like.fromId }).lean<UserType | null>();
    const initiatorCardSnapshot = buildInitiatorSnapshot(initiator) ?? like.fromCardSnapshot;
    if (!initiatorCardSnapshot) {
      return jsonError(400, 'INITIATOR_CARD_SNAPSHOT_MISSING', 'initiator card snapshot missing');
    }

    const updated = await Like.findOneAndUpdate(
      { _id: like._id, toId: currentUserId, status: { $in: allowed } },
      {
        $set: {
          recipientResponse: {
            agreements: [true, true, true] as [boolean, boolean, boolean],
            answers: [
              clamp(body.answers[0]!, 280),
              clamp(body.answers[1]!, 280),
            ] as [string, string],
            initiatorCardSnapshot,
            at: new Date(),
          },
          status: 'awaiting_initiator' as LikeStatus,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) return jsonError(409, 'LIKE_INVALID_STATE', 'invalid state');
    return jsonOk({ status: updated.status });
  } catch {
    return jsonError(500, 'INTERNAL_ERROR', 'internal');
  }
}
