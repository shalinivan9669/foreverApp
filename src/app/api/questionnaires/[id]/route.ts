import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { questionnaireCatalogService } from '@/domain/services/questionnaireCatalog.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

// DTO rule: return only DTO/view model (never raw DB model shape).

type AnswerItem = { qid: string; ui: number };

const paramsSchema = z.object({
  id: z.string().min(1),
});

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

const answerUiSchema = z.number().int().min(1);

const answersSchema = z
  .object({
    answers: z
      .array(
        z.object({
          qid: z.string().min(1),
          ui: answerUiSchema,
        })
      )
      .min(1)
      .max(100),
  })
  .strict();

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const paramsInput = await context.params;
  const rawId = paramsInput.id;
  const normalizedId =
    typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  const params = parseParams({ id: normalizedId }, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const questionnaire = await questionnaireCatalogService.getPublishedById(id, auth.data.userId);
  if (!questionnaire) {
    return jsonError(404, 'QUESTIONNAIRE_NOT_FOUND', 'not found');
  }
  return jsonOk(questionnaire);
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const paramsInput = await context.params;
  const rawId = paramsInput.id;
  const normalizedId =
    typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  const params = parseParams({ id: normalizedId }, paramsSchema);
  if (!params.ok) return params.response;
  const { id: questionnaireId } = params.data;

  const bodyResult = await parseJson(req, answersSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const answers: AnswerItem[] = bodyResult.data.answers;

  const route = `/api/questionnaires/${questionnaireId}`;
  const auditRequest = auditContextFromRequest(req, route);

  return withIdempotency({
    req,
    route,
    userId,
    requestBody: {
      questionnaireId,
      answers,
    },
    execute: () =>
      questionnairesService.submitBulkAnswers({
        currentUserId: userId,
        questionnaireId,
        answers,
        auditRequest,
      }),
  });
}
