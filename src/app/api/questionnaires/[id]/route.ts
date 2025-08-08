import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
import { User } from '@/models/User';

// Мини-тип для вопроса
type QItem = {
  id?: string;
  _id?: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
  map: number[];
  axis: string;
  facet: string;
};

type RouteCtx = { params: { id: string } };

// GET /api/questionnaires/[id]
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean();
  if (!qn) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(qn);
}

// POST /api/questionnaires/[id]
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const id = params?.id;
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

  // ui — 1..N, надёжно зажимаем в диапазон
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  const num = q.map[idx];            // −3 … +3
  const axis = q.axis;
  const abs = Math.abs(num) / 3;     // 0 … 1

  await User.updateOne(
    { id: userId }, // проверь, что у тебя действительно поле id, а не _id
    {
      $inc: { [`vectors.${axis}.level`]: abs * 0.25 },
      $addToSet: {
        [`vectors.${axis}.${num >= 2 ? 'positives' : 'negatives'}`]: q.facet,
      },
    }
  );

  return NextResponse.json({ ok: true });
}
