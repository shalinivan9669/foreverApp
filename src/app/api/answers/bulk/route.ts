import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question, QuestionType }    from '@/models/Question';
import { User, UserType }            from '@/models/User';

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

interface Body { userId: string; answers: { qid: string; ui: number }[] }

/* ───── утилита ─────────────────────────────────────────────── */
function toNumeric(q: QuestionType, ui: number) {
  const idx = Math.max(0, Math.min(ui - 1, q.map.length - 1));
  return q.map[idx];                       // −3…+3
}

/* ───── handler ─────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const { userId, answers } = (await req.json()) as Body;
  if (!userId || !answers?.length)
    return NextResponse.json({ error: 'bad' }, { status: 400 });

  await connectToDatabase();

  /* fetch вопросы одной пачкой */
  const qids = answers.map(a => a.qid);
  const qs   = await Question.find({ _id: { $in: qids } })
                             .lean<QuestionType[]>();
  const qMap: Record<string, QuestionType> = {};
  qs.forEach(q => { qMap[q._id] = q; });

  /* аккумуляторы */
  const addAbs : Record<Axis, number> = {
    communication:0, domestic:0, personalViews:0,
    finance:0, sexuality:0, psyche:0
  };
  const cnt    : Record<Axis, number> = { ...addAbs };

  const pos : Record<Axis, string[]> = {
    communication:[], domestic:[], personalViews:[],
    finance:[], sexuality:[], psyche:[]
  };
  const neg : Record<Axis, string[]> = JSON.parse(JSON.stringify(pos));

  for (const { qid, ui } of answers) {
    const q = qMap[qid]; if (!q) continue;
    const num  = toNumeric(q, ui);
    const axis = q.axis as Axis;

    addAbs[axis] += Math.abs(num) / 3;   // 0‥1
    cnt[axis]    += 1;

    if (num >=  2) pos[axis].push(q.facet);
    if (num <= -2) neg[axis].push(q.facet);
  }

  /* читаем текущего пользователя */
  const doc = await User.findOne({ id: userId }).lean<UserType>();
  if (!doc) return NextResponse.json({ error: 'no user' }, { status: 404 });

  /* считаем новые уровни */
  const setLevels: Record<string, number> = {};
  AXES.forEach(axis => {
    if (!cnt[axis]) return;
    const old = doc.vectors[axis].level;
    const avg = addAbs[axis] / cnt[axis];      // 0‥1
    setLevels[`vectors.${axis}.level`] =
      old * 0.75 + avg * 0.25;                 // EMA
  });

  /* формируем update */
  const update: Record<string, unknown> = { $set: setLevels };
  const addToSet: Record<string, unknown> = {};

  AXES.forEach(axis => {
    if (pos[axis].length)
      addToSet[`vectors.${axis}.positives`] = { $each: pos[axis] };
    if (neg[axis].length)
      addToSet[`vectors.${axis}.negatives`] = { $each: neg[axis] };
  });
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  await User.updateOne({ id: userId }, update);
  return NextResponse.json({ ok: true });
}
