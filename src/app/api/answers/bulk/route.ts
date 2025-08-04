import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question, QuestionType }    from '@/models/Question';
import { User }                      from '@/models/User';

/* ─────────── типы и константы ───────────────────────────────── */

type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

const AXES: Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche'
];

interface Body {
  userId:  string;
  answers: { qid: string; ui: number }[];
}

/* ─────────── utils ──────────────────────────────────────────── */

function toNumeric(q: QuestionType, ui: number): number {
  // ui приходит 1..N
  const idx = Math.max(0, Math.min(ui - 1, q.map.length - 1));
  return q.map[idx];          // −3…+3
}

/* ─────────── handler ────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  /* ------- validate body -------- */
  const { userId, answers } = (await req.json()) as Body;
  if (!userId || !Array.isArray(answers) || !answers.length) {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  await connectToDatabase();

  /* ------- fetch questions in one call -------- */
  const qids = answers.map((a) => a.qid);
  const qs   = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();
  const qMap: Record<string, QuestionType> = {};
  qs.forEach((q) => { qMap[q._id] = q; });

  /* ------- accumulators -------- */
  const incLevels: Record<Axis, [number, number]> = {
    communication : [0, 0],
    domestic      : [0, 0],
    personalViews : [0, 0],
    finance       : [0, 0],
    sexuality     : [0, 0],
    psyche        : [0, 0]
  };

  const pushPos: Record<Axis, string[]> = {
    communication : [],
    domestic      : [],
    personalViews : [],
    finance       : [],
    sexuality     : [],
    psyche        : []
  };

  const pushNeg: Record<Axis, string[]> = {
    communication : [],
    domestic      : [],
    personalViews : [],
    finance       : [],
    sexuality     : [],
    psyche        : []
  };

  /* ------- iterate answers -------- */
  for (const { qid, ui } of answers) {
    const q = qMap[qid];
    if (!q) continue;

    const num  = toNumeric(q, ui);        // −3…+3
    const axis = q.axis as Axis;
    const abs  = Math.abs(num) / 3;       // 0…1

    // EMA weight 0.25
    incLevels[axis][0] += abs * 0.25;     // numerator
    incLevels[axis][1] += 0.25;           // denominator

    if (num >=  2) pushPos[axis].push(q.facet);
    if (num <= -2) pushNeg[axis].push(q.facet);
  }

  /* ------- build $set / $addToSet update -------- */
  const setLevels: Record<string, unknown> = {};
  AXES.forEach((axis) => {
    const [sum, w] = incLevels[axis];
    if (!w) return;
    setLevels[`vectors.${axis}.level`] = {
      $function: {
        body : '(prev, inc, w) => (prev * 0.75) + (inc / w)',
        args : [`$vectors.${axis}.level`, sum, w],
        lang : 'js'
      }
    };
  });

  const addToSet: Record<string, unknown> = {};

  AXES.forEach((axis) => {
    if (pushPos[axis].length) {
      addToSet[`vectors.${axis}.positives`] = { $each: pushPos[axis] };
    }
    if (pushNeg[axis].length) {
      addToSet[`vectors.${axis}.negatives`] = { $each: pushNeg[axis] };
    }
  });

  const update: Record<string, unknown> = { ...setLevels };
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  /* ------- write to DB -------- */
  await User.updateOne({ id: userId }, update);
  return NextResponse.json({ ok: true });
}
