import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire, QuestionnaireType, QuestionItem } from '@/models/Questionnaire';
import { User } from '@/models/User';

type Axis = QuestionItem['axis'];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await connectToDatabase();
  const qn = await Questionnaire.findById(params.id).lean<QuestionnaireType | null>();
  if (!qn) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(qn);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, qid, ui } = await req.json() as { userId:string; qid:string; ui:number };

  await connectToDatabase();

  const qn = await Questionnaire.findById(params.id).lean<QuestionnaireType | null>();
  if (!qn) return NextResponse.json({ error: 'bad qn' }, { status: 404 });

  const q = qn.questions.find((x) => x.id === qid) as QuestionItem | undefined;
  if (!q) return NextResponse.json({ error: 'bad q' }, { status: 400 });

  // нормируем индекс ответа 1..N -> 0..N-1
  const idx = Math.max(0, Math.min(ui - 1, q.map.length - 1));
  const num = q.map[idx];                 // -3..+3
  const axis: Axis = q.axis;
  const abs = Math.abs(num) / 3;          // 0..1

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
