// src/app/api/questionnaires/[id]/route.ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
import { User } from '@/models/User';

type QItem = {
  id?: string;
  _id?: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
  map: number[];
  axis: string;
  facet: string;
};

// GET /api/questionnaires/[id]
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.pathname.split('/').pop() || '';
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean();
  if (!qn) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(qn);
}

// POST /api/questionnaires/[id]
export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.pathname.split('/').pop() || '';
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const body = (await req.json()) as { userId: string; qid: string; ui: number };
  const { userId, qid, ui } = body || {};
  if (!userId || !qid || typeof ui !== 'number') {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean<{ questions: QItem[] }>();
  if (!qn) return NextResponse.json({ error: 'bad qn' }, { status: 404 });

  const q = qn.questions.find(x => (x.id ?? String(x._id)) === qid);
  if (!q) return NextResponse.json({ error: 'bad q' }, { status: 400 });

  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  const num = q.map[idx];                 // −3…+3
  const axis = q.axis;
 const step = (num / 3);           

  // level: EMA-инкремент небольшой
 const updates: Record<string, unknown> = {
  $inc: { [`vectors.${axis}.level`]: step * 0.25 } // ↓/↑ в зависимости от ответа
};
  // фасетки: добавляем только при явных ответах
  const add: Record<string, unknown> = {};
  if (num >=  2) add[`vectors.${axis}.positives`] = q.facet;
  if (num <= -2) add[`vectors.${axis}.negatives`] = q.facet;
  if (Object.keys(add).length) updates.$addToSet = add;

  await User.updateOne({ id: userId }, updates);

  return NextResponse.json({ ok: true });
}
