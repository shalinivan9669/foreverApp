import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question, type QuestionType } from '@/models/Question';
import { Questionnaire, type QuestionnaireType } from '@/models/Questionnaire';
import { User, type UserType }         from '@/models/User';
import { buildVectorUpdate, type VectorQuestion } from '@/utils/vectorUpdates';

/* ── типы и константы ─────────────────────────────────────────────────────────────────── */
type AnswerItem = { qid: string; ui: number };
type Body =
  | { userId: string; answers: AnswerItem[] }
  | { userId: string; qid: string; ui: number };

/* ── utils ─────────────────────────────────────────────────────────────────────────────── */
type WithPossibleId = { id?: unknown };
function hasStringId(obj: unknown): obj is { id: string } {
  return typeof obj === 'object'
    && obj !== null
    && 'id' in (obj as Record<string, unknown>)
    && typeof (obj as WithPossibleId).id === 'string';
}

/* ── handler ───────────────────────────────────────────────────────────────────────────── */
export async function GET(_req: NextRequest, context: { params: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await context.params;
  const rawId = params?.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  if (!id) return NextResponse.json({ error: 'bad' }, { status: 400 });

  await connectToDatabase();
  const doc = await Questionnaire.findOne({ _id: id }).lean<QuestionnaireType | null>();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(doc);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const userId = 'userId' in body ? body.userId : '';
  const answers: AnswerItem[] =
    'answers' in body
      ? body.answers
      : 'qid' in body && typeof body.qid === 'string'
        ? [{ qid: body.qid, ui: body.ui }]
        : [];

  if (!userId || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  await connectToDatabase();

  /* fetch вопросы одной пачкой */
  const qids = answers.map(a => a.qid);
  const qs   = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();

  const qMap: Record<string, QuestionType> = {};
  for (const q of qs) {
    qMap[String((q as unknown as { _id: unknown })._id)] = q;
    if (hasStringId(q)) qMap[q.id] = q;
  }

  /* читаем текущего пользователя */
  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return NextResponse.json({ error: 'no user' }, { status: 404 });

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
  return NextResponse.json({ ok: true });
}
