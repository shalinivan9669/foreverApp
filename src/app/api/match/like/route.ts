// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { matchService } from '@/domain/services/match.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

export const runtime = 'nodejs';

type Body = {
  userId?: string;
  fromId?: string;
  toId: string;
  agreements: [true, true, true];
  answers: [string, string];
};

const bodySchema = z
  .object({
    userId: z.string().optional(),
    fromId: z.string().optional(),
    toId: z.string().min(1),
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
    routeForAudit: '/api/match/like',
  });
  if (!rate.ok) return rate.response;

  const parsedBody = await parseJson(req, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Body;
  const auditRequest = auditContextFromRequest(req, '/api/match/like');

  return withIdempotency({
    req,
    route: '/api/match/like',
    userId: currentUserId,
    requestBody: {
      toId: body.toId,
      agreements: body.agreements,
      answers: body.answers,
    },
    execute: () =>
      matchService.createLike({
        currentUserId,
        toId: body.toId,
        agreements: body.agreements,
        answers: body.answers,
        auditRequest,
      }),
  });
}
