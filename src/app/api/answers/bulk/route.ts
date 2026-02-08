// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

type Body = {
  userId?: string;
  answers: { qid: string; ui: number }[];
};

const bodySchema = z
  .object({
    userId: z.string().optional(),
    answers: z
      .array(
        z.object({
          qid: z.string().min(1),
          ui: z.number(),
        })
      )
      .min(1),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  const payload = body.data as Body;
  const auditRequest = auditContextFromRequest(req, '/api/answers/bulk');

  return withIdempotency({
    req,
    route: '/api/answers/bulk',
    userId: currentUserId,
    requestBody: {
      answers: payload.answers,
    },
    execute: () =>
      questionnairesService.submitBulkAnswers({
        currentUserId,
        answers: payload.answers,
        auditRequest,
      }),
  });
}
