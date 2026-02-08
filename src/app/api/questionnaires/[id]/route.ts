import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire, type QuestionnaireType } from '@/models/Questionnaire';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { toQuestionnaireDTO } from '@/lib/dto';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

// DTO rule: return only DTO/view model (never raw DB model shape).

type AnswerItem = { qid: string; ui: number };
type Body =
  | { userId?: string; answers: AnswerItem[] }
  | { userId?: string; qid: string; ui: number };

const paramsSchema = z.object({
  id: z.string().min(1),
});

const answersSchema = z
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

const singleAnswerSchema = z
  .object({
    userId: z.string().optional(),
    qid: z.string().min(1),
    ui: z.number(),
  })
  .strict();

const bodySchema = z.union([answersSchema, singleAnswerSchema]);

export async function GET(
  _req: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const paramsInput = await context.params;
  const rawId = paramsInput.id;
  const normalizedId =
    typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  const params = parseParams({ id: normalizedId }, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  await connectToDatabase();
  const doc = await Questionnaire.findOne({ _id: id }).lean<QuestionnaireType | null>();
  if (!doc) return jsonError(404, 'QUESTIONNAIRE_NOT_FOUND', 'not found');
  return jsonOk(toQuestionnaireDTO(doc));
}

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Body;

  const answers: AnswerItem[] =
    'answers' in body
      ? body.answers
      : 'qid' in body && typeof body.qid === 'string'
        ? [{ qid: body.qid, ui: body.ui }]
        : [];
  const auditRequest = auditContextFromRequest(req, '/api/questionnaires/[id]');
  await questionnairesService.submitBulkAnswers({
    currentUserId: userId,
    answers,
    auditRequest,
  });
  return jsonOk({});
}
