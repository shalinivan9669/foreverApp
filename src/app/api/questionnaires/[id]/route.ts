import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question, type QuestionType } from '@/models/Question';
import { Questionnaire, type QuestionnaireType } from '@/models/Questionnaire';
import { User, type UserType }         from '@/models/User';

/* ───── типы и константы ────────────────────────────────────── */
type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

const AXES: Axis[] = [
  'communication', 'domestic', 'personalViews',
  'finance', 'sexuality', 'psyche'
];

type AnswerItem = { qid: string; ui: number };
type Body =
  | { userId: string; answers: AnswerItem[] }
  | { userId: string; qid: string; ui: number };

/* ───── utils ─────────────────────────────────────────────── */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function toNumeric(q: QuestionType, ui: number) {
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  return q.map[idx];                       // −3…+3
}

type WithPossibleId = { id?: unknown };
function hasStringId(obj: unknown): obj is { id: string } {
  return typeof obj === 'object'
    && obj !== null
    && 'id' in (obj as Record<string, unknown>)
    && typeof (obj as WithPossibleId).id === 'string';
}

/* ───── handler ───────────────────────────────────────────── */
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

  /* аккумуляторы */
  const addSigned : Record<Axis, number> = {
    communication:0, domestic:0, personalViews:0,
    finance:0, sexuality:0, psyche:0
  };
  const cnt    : Record<Axis, number> = { ...addSigned };

  const pos : Record<Axis, string[]> = {
    communication:[], domestic:[], personalViews:[],
    finance:[], sexuality:[], psyche:[]
  };
  const neg : Record<Axis, string[]> = JSON.parse(JSON.stringify(pos));

  for (const { qid, ui } of answers) {
    const q = qMap[qid]; if (!q || typeof ui !== 'number') continue;
    const num  = toNumeric(q, ui);   // −3…+3
    const axis = q.axis as Axis;

    addSigned[axis] += (num / 3);    // −1…1
    cnt[axis]       += 1;

    if (num >=  2) pos[axis].push(q.facet);
    if (num <= -2) neg[axis].push(q.facet);
  }

  /* читаем текущего пользователя */
  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return NextResponse.json({ error: 'no user' }, { status: 404 });

  /* считаем новые уровни (подписанный шаг; 0..1) */
  const setLevels: Record<string, number> = {};
  AXES.forEach(axis => {
    if (!cnt[axis]) return;
    const prev = Number(doc.vectors?.[axis]?.level ?? 0);
    const avgSigned = addSigned[axis] / cnt[axis]; // −1..1
    const next = clamp01(prev + avgSigned * 0.25);
    setLevels[`vectors.${axis}.level`] = next;
  });

  /* формируем update */
  const addToSet: Record<string, unknown> = {};
  AXES.forEach(axis => {
    if (pos[axis].length)
      addToSet[`vectors.${axis}.positives`] = { $each: pos[axis] };
    if (neg[axis].length)
      addToSet[`vectors.${axis}.negatives`] = { $each: neg[axis] };
  });

  const update: {
    $set: Record<string, unknown>;
    $addToSet?: Record<string, unknown>;
  } = { $set: setLevels };

  if (Object.keys(addToSet).length) {
    update.$addToSet = addToSet;
  }

  await User.updateOne({ id: userId }, update);
  return NextResponse.json({ ok: true });
}
