// DTO rule: return only DTO/view model (never raw DB model shape).
// POST /api/pairs/[id]/questionnaires/[qid]/answer
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { Questionnaire, type QuestionItem, type QuestionnaireType } from '@/models/Questionnaire';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { buildVectorUpdate, type VectorQuestion, type VectorAnswer } from '@/utils/vectorUpdates';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string; qid: string }> }

type Body = {
  sessionId?: string;
  questionId: string;
  ui: number;
};

type QItem = QuestionItem & { _id?: string };

type WithPossibleId = { _id?: unknown };
const hasStringId = (obj: unknown): obj is { _id: string } =>
  typeof obj === 'object'
  && obj !== null
  && '_id' in (obj as Record<string, unknown>)
  && typeof (obj as WithPossibleId)._id === 'string';

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
  const userId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id, qid } = params.data;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const { sessionId, questionId, ui } = bodyResult.data as Body;

  const pairGuard = await requirePairMember(id, userId);
  if (!pairGuard.ok) return pairGuard.response;
  const by = pairGuard.data.by;

  await connectToDatabase();

  const sess = sessionId
    ? await PairQuestionnaireSession.findOne({
        _id: new Types.ObjectId(sessionId),
        pairId: new Types.ObjectId(id),
        questionnaireId: qid,
        status: 'in_progress',
      }).lean()
    : await PairQuestionnaireSession.findOne({
        pairId: new Types.ObjectId(id),
        questionnaireId: qid,
        status: 'in_progress',
      })
        .sort({ createdAt: -1 })
        .lean();

  if (!sess) return jsonError(404, 'PAIR_QUESTIONNAIRE_SESSION_NOT_FOUND', 'no active session');

  await PairQuestionnaireAnswer.updateOne(
    { sessionId: new Types.ObjectId(sess._id), questionId, by },
    { $set: { ui, at: new Date() } },
    { upsert: true }
  );

  const answers = await PairQuestionnaireAnswer.find({
    sessionId: new Types.ObjectId(sess._id),
    by,
  }).lean<{ questionId: string; ui: number }[]>();

  const questionnaire = await Questionnaire.findOne({ _id: qid }).lean<QuestionnaireType | null>();
  if (!questionnaire) {
    return jsonError(404, 'QUESTIONNAIRE_NOT_FOUND', 'questionnaire not found');
  }

  const qMap: Record<string, QItem> = {};
  for (const q of questionnaire.questions ?? []) {
    if (q.id) qMap[q.id] = q;
    if (hasStringId(q)) qMap[q._id] = q;
  }

  const user = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!user) return jsonError(404, 'USER_NOT_FOUND', 'user missing');

  const vectorAnswers: VectorAnswer[] = answers.map((answer) => ({ qid: answer.questionId, ui: answer.ui }));
  const { setLevels, addToSet } = buildVectorUpdate(
    user,
    vectorAnswers,
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

