import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Questionnaire }             from '@/models/Questionnaire';
import { Question }                  from '@/models/Question';
import { User }                      from '@/models/User';
import type { QuestionType }         from '@/models/Question';
import type { QuestionnaireType }    from '@/models/Questionnaire';

/* ---------- GET: анкета + вопросы ---------- */
export async function GET(
  _req: NextRequest,
  { params }: { params: Record<string, string | string[]> }
) {
  const id = params.id as string;

  await connectToDatabase();

  const qn = await Questionnaire
    .findById(id)
    .lean<QuestionnaireType | null>();

  if (!qn)
    return NextResponse.json(null, { status: 404 });

  const questions = await Question
    .find({ _id: { $in: qn.qids } })
    .lean<QuestionType[]>();

  const ordered = qn.qids.map((qid) => questions.find((q) => q?._id === qid));
  return NextResponse.json({ ...qn, questions: ordered });
}

/* ---------- POST: один ответ ---------- */
export async function POST(
  req: NextRequest,
  { params }: { params: Record<string, string | string[]> }
) {
  const id = params.id as string;
  const { userId, qid, ui } = (await req.json()) as {
    userId: string;
    qid: string;
    ui: number;
  };

  await connectToDatabase();

  /* пересчитать vectors через существующий endpoint */
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/answers/bulk`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, answers: [{ qid, ui }] })
  });

  /* зафиксировать progress */
  await User.updateOne(
    { id: userId },
    { $addToSet: { [`questionnairesProgress.${id}.answered`]: qid } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
