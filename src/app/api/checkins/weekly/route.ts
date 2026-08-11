// DTO rule: return only DTO/view model (never raw DB model shape).
// POST /api/checkins/weekly
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { weeklyCheckInService } from '@/domain/services/weeklyCheckIn.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';

const answersSchema = z
  .object({
    closeness: z.number().min(0).max(1),
    fatigue: z.number().min(0).max(1),
    irritation: z.number().min(0).max(1),
    readiness: z.number().min(0).max(1),
    unresolvedTopic: z.boolean(),
    note: z.string().max(500).optional(),
  })
  .strict();

const bodySchema = z
  .object({
    pairId: z.string().optional(),
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
    idempotencyKey: z.string().optional(),
    answers: answersSchema,
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.weeklyMutations,
    userId: currentUserId,
  });
  if (!rate.ok) return rate.response;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const route = '/api/checkins/weekly';

  return withIdempotency({
    req,
    route,
    userId: currentUserId,
    requestBody: {
      pairId: body.pairId ?? null,
      weekKey: body.weekKey ?? null,
      answers: body.answers,
    },
    execute: () =>
      weeklyCheckInService.submit({
        currentUserId,
        pairId: body.pairId,
        weekKey: body.weekKey,
        answers: body.answers,
        auditRequest: auditContextFromRequest(req, route),
      }),
  });
}
