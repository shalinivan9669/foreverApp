// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonForbidden } from '@/lib/auth/errors';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

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

  if (like.status !== 'awaiting_initiator')
    return jsonError(400, 'LIKE_INVALID_STATUS', `invalid status ${like.status}`);

  const now = new Date();
  like.initiatorDecision = { accepted: true, at: now };
  like.status = 'mutual_ready';
  like.updatedAt = now;
  await like.save();

  return jsonOk({});
}

