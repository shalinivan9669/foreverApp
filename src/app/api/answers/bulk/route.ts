import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question, type QuestionType } from '@/models/Question';
import { User, type UserType }         from '@/models/User';

/* ── типы ───────────────────────────────────────────────────── */
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

interface Body { userId: string; answers: { qid: string; ui: number }[] }

/* ── utils ──────────────────────────────────────────────────── */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function toNumeric(q: QuestionType, ui: number) {
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  return q.map[idx]; // −3…+3
}

/* ── handler ────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const { userId, answers } = (await req.json()) as Body;
  if (!userId || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  await connectToDatabase();

  // вопросы одной пачкой
  const qids = answers.map(a => a.qid);
  const qs   = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();

  const qMap: Record<string, QuestionType> = {};
  for (const q of qs) {
    // подстрахуемся — ключами делаем и _id, и возможный q.id
    qMap[String(q._id)] = q;
    if ((q as any).id) qMap[String((q as any).id)] = q;
  }

  // аккумуляторы по осям
  const addSigned: Record<Axis, number> = {
    communication: 0, domestic: 0, personalViews: 0,
    finance: 0, sexuality: 0, psyche: 0
  };
  const cnt: Record<Axis, number> = { ...addSigned };

  const pos: Record<Axis, string[]> = {
    communication: [], domestic: [], personalViews: [],
    finance: [], sexuality: [], psyche: []
  };
  const neg: Record<Axis, string[]> = JSON.parse(JSON.stringify(pos));

  for (const { qid, ui } of answers) {
    const q = qMap[qid];
    if (!q || typeof ui !== 'number') continue;

    const num  = toNumeric(q, ui);     // −3…+3
    const axis = q.axis as Axis;

    addSigned[axis] += (num / 3);      // −1…1 (сумма)
    cnt[axis]       += 1;

    if (num >=  2) pos[axis].push(q.facet);
    if (num <= -2) neg[axis].push(q.facet);
  }

  // читаем пользователя
  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return NextResponse.json({ error: 'no user' }, { status: 404 });

  // считаем новые уровни (подписанный шаг, с зажимом 0..1)
  const setLevels: Record<string, number> = {};
  for (const axis of AXES) {
    if (!cnt[axis]) continue;

    const prev = Number(doc.vectors?.[axis]?.level ?? 0);   // ожидаем 0..1
    const avgSigned = addSigned[axis] / cnt[axis];          // −1..1
    const next = clamp01(prev + avgSigned * 0.25);          // шаг к ↑/↓
    setLevels[`vectors.${axis}.level`] = next;
  }

  // формируем update
  const update: Record<string, unknown> = { $set: setLevels };
  const addToSet: Record<string, unknown> = {};

  for (const axis of AXES) {
    if (pos[axis].length) addToSet[`vectors.${axis}.positives`] = { $each: pos[axis] };
    if (neg[axis].length) addToSet[`vectors.${axis}.negatives`] = { $each: neg[axis] };
  }
  if (Object.keys(addToSet).length) (update as any).$addToSet = addToSet;

  await User.updateOne({ id: userId }, update);
  return NextResponse.json({ ok: true });
}
