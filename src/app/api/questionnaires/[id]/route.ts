import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Question, type QuestionType } from '@/models/Question';
import { Questionnaire, type QuestionnaireType } from '@/models/Questionnaire';
import { User, type UserType } from '@/models/User';
import { buildVectorUpdate, type VectorQuestion } from '@/utils/vectorUpdates';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';

type AnswerItem = { qid: string; ui: number };
type Body =
  | { userId?: string; answers: AnswerItem[] }
  | { userId?: string; qid: string; ui: number };

type WithPossibleId = { id?: unknown };
function hasStringId(obj: unknown): obj is { id: string } {
  return typeof obj === 'object'
    && obj !== null
    && 'id' in (obj as Record<string, unknown>)
    && typeof (obj as WithPossibleId).id === 'string';
}

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
  return jsonOk(doc);
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

  await connectToDatabase();

  const qids = answers.map((answer) => answer.qid);
  const qs = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();

  const qMap: Record<string, QuestionType> = {};
  for (const q of qs) {
    qMap[String((q as unknown as { _id: unknown })._id)] = q;
    if (hasStringId(q)) qMap[q.id] = q;
  }

  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'no user');

  const { setLevels, addToSet } = buildVectorUpdate(
    doc,
    answers,
    qMap as Record<string, VectorQuestion>
  );

  const update: {
    $set: Record<string, number>;
    $addToSet?: Record<string, { $each: string[] }>;
  } = { $set: setLevels };

  if (Object.keys(addToSet).length) {
    update.$addToSet = addToSet;
  }

  await User.updateOne({ id: userId }, update);
  return jsonOk({});
}
