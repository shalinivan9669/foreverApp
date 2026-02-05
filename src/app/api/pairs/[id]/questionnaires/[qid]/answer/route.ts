// POST /api/pairs/[id]/questionnaires/[qid]/answer
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { Questionnaire, type QuestionItem, type QuestionnaireType } from '@/models/Questionnaire';
import { User, type UserType } from '@/models/User';
import { verifyJwt } from '@/lib/jwt';
import { buildVectorUpdate, type VectorQuestion, type VectorAnswer } from '@/utils/vectorUpdates';

interface Ctx { params: Promise<{ id: string; qid: string }> }

type Body = {
  sessionId?: string;
  questionId: string;
  ui: number;
  by?: 'A' | 'B';
};

type QItem = QuestionItem & { _id?: string };

const getSessionUserId = (req: NextRequest): string | null => {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const payload = verifyJwt(token, secret);
  return payload?.sub ?? null;
};

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, qid } = await ctx.params;
  if (!id || !qid) return NextResponse.json({ error: 'missing id/qid' }, { status: 400 });

  const userId = getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sessionId, questionId, ui } = (await req.json()) as Body;
  if (!questionId || typeof ui !== 'number') {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }

  await connectToDatabase();

  const pair = await Pair.findById(id).lean();
  if (!pair) return NextResponse.json({ error: 'pair not found' }, { status: 404 });

  const members = pair.members ?? [];
  const by: 'A' | 'B' | null = members[0] === userId ? 'A' : members[1] === userId ? 'B' : null;
  if (!by) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Find or ensure session exists and in progress
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

  if (!sess) return NextResponse.json({ error: 'no active session' }, { status: 404 });

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
  if (!questionnaire) return NextResponse.json({ error: 'questionnaire not found' }, { status: 404 });

  const qMap: Record<string, QItem> = {};
  for (const q of questionnaire.questions ?? []) {
    if (q.id) qMap[q.id] = q;
    if (q._id) qMap[q._id] = q;
  }

  const user = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!user) return NextResponse.json({ error: 'user missing' }, { status: 404 });

  const vectorAnswers: VectorAnswer[] = answers.map(a => ({ qid: a.questionId, ui: a.ui }));
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

  return NextResponse.json({ ok: true });
}
