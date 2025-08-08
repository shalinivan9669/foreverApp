import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
import { User } from '@/models/User';

type Ctx = { params: { id: string } };

// минимальный тип вопроса внутри анкеты
type QItem = {
  id?: string;
  _id?: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
  map: number[];              // например [-3,-1,0,1,3]
  axis: string;               // communication | finance | ...
  facet: string;              // ключ признака
};

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = params;

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean();
  if (!qn) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(qn);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = params;

  const body = (await req.json()) as { userId: string; qid: string; ui: number };
  const { userId, qid, ui } = body;

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean<{ questions: QItem[] }>();
  if (!qn) return NextResponse.json({ error: 'bad qn' }, { status: 404 });

  const q = qn.questions.find(x => (x.id ?? String(x._id)) === qid);
  if (!q) return NextResponse.json({ error: 'bad q' }, { status: 400 });

  // надёжно берём число из карты
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  const num = q.map[idx];              // −3 … +3
  const axis = q.axis;
  const abs = Math.abs(num) / 3;       // 0 … 1

  await User.updateOne(
    { id: userId },
    {
      $inc: { [`vectors.${axis}.level`]: abs * 0.25 },
      $addToSet: {
        [`vectors.${axis}.${num >= 2 ? 'positives' : 'negatives'}`]: q.facet,
      },
    }
  );

  return NextResponse.json({ ok: true });
}
