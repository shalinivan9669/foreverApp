// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { jsonError } from '@/lib/api/response';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { matchService } from '@/domain/services/match.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import {
  assertEntitlement,
  assertQuota,
  resolveEntitlements,
} from '@/lib/entitlements';

type Body = {
  userId?: string;
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

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: currentUserId,
    routeForAudit: '/api/match/respond',
  });
  if (!rate.ok) return rate.response;

  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Body;
  const auditRequest = auditContextFromRequest(req, '/api/match/respond');

  const likeId = body.likeId ?? query.data.id ?? '';
  if (!likeId) {
    return jsonError(400, 'VALIDATION_ERROR', 'likeId is required');
  }

  return withIdempotency({
    req,
    route: '/api/match/respond',
    userId: currentUserId,
    requestBody: {
      likeId,
      agreements: body.agreements,
      answers: body.answers,
    },
    execute: async () => {
      const snapshot = await resolveEntitlements({ currentUserId });
      await assertEntitlement({
        req,
        route: '/api/match/respond',
        snapshot,
        key: 'match.mutations',
      });
      await assertQuota({
        req,
        route: '/api/match/respond',
        snapshot,
        key: 'match.mutations.per_day',
      });

      return matchService.respondToLike({
        currentUserId,
        likeId,
        agreements: body.agreements,
        answers: body.answers,
        auditRequest,
      });
    },
  });
}
