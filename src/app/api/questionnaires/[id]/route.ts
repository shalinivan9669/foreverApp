import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
import { User } from '@/models/User';

// GET /api/questionnaires/[id]
export async function GET(_req: Request, ctx: any) {
  const { id } = ctx.params as { id: string };

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean();
  if (!qn) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(qn);
}

// POST /api/questionnaires/[id]
export async function POST(req: Request, ctx: any) {
  const { id } = ctx.params as { id: string };
  const { userId, qid, ui } = await req.json() as {
    userId: string; qid: string; ui: number;
  };

  await connectToDatabase();

  const qn = await Questionnaire.findById(id).lean();
  if (!qn) return NextResponse.json({ error: 'bad qn' }, { status: 404 });

  // поддержим и id, и _id
  const q = (qn.questions as any[]).find(x => (x.id ?? x._id) === qid);
  if (!q) return NextResponse.json({ error: 'bad q' }, { status: 400 });

  // безопасно берём значение из map
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  const num = q.map[idx];          // −3 … +3
  const axis = q.axis as string;
  const abs  = Math.abs(num) / 3;  // 0 … 1

  await User.updateOne(
    { id: userId },
    {
      $inc: { [`vectors.${axis}.level`]: abs * 0.25 },
      $addToSet: {
        [`vectors.${axis}.${num >= 2 ? 'positives' : 'negatives'}`]: q.facet
      }
    }
  );

  return NextResponse.json({ ok: true });
}
