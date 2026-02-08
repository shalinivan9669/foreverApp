// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { matchService } from '@/domain/services/match.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

type Body = {
  likeId: string;
  userId?: string;
};

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

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: currentUserId,
    routeForAudit: '/api/match/confirm',
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  const payload = body.data as Body;
  const auditRequest = auditContextFromRequest(req, '/api/match/confirm');

  return withIdempotency({
    req,
    route: '/api/match/confirm',
    userId: currentUserId,
    requestBody: {
      likeId: payload.likeId,
    },
    execute: () =>
      matchService.confirmLike({
        currentUserId,
        likeId: payload.likeId,
        auditRequest,
      }),
  });
}
