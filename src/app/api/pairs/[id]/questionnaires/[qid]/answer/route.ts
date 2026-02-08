// DTO rule: return only DTO/view model (never raw DB model shape).
// POST /api/pairs/[id]/questionnaires/[qid]/answer
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Ctx {
  params: Promise<{ id: string; qid: string }>;
}

type Body = {
  sessionId?: string;
  questionId: string;
  ui: number;
};

const paramsSchema = z.object({
  id: z.string().min(1),
  qid: z.string().min(1),
});

const bodySchema = z
  .object({
    sessionId: z.string().optional(),
    questionId: z.string().min(1),
    ui: z.number(),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id, qid } = params.data;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Body;
  const auditRequest = auditContextFromRequest(
    req,
    `/api/pairs/${id}/questionnaires/${qid}/answer`
  );

  return withIdempotency({
    req,
    route: `/api/pairs/${id}/questionnaires/${qid}/answer`,
    userId: currentUserId,
    requestBody: {
      pairId: id,
      questionnaireId: qid,
      sessionId: body.sessionId ?? null,
      questionId: body.questionId,
      ui: body.ui,
    },
    execute: () =>
      questionnairesService.answerPairQuestionnaire({
        pairId: id,
        questionnaireId: qid,
        sessionId: body.sessionId,
        questionId: body.questionId,
        ui: body.ui,
        currentUserId,
        auditRequest,
      }),
  });
}
