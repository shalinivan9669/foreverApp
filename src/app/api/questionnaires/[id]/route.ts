import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Questionnaire }             from '@/models/Questionnaire';
import { Question }                  from '@/models/Question';
import { User }                      from '@/models/User';
import type { QuestionType }         from '@/models/Question';
import type { QuestionnaireType }    from '@/models/Questionnaire';

/* ---------- GET: отдать анкету + вопросы ---------- */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await connectToDatabase();

  const qn = await Questionnaire
    .findById(params.id)
    .lean<QuestionnaireType | null>();

  if (!qn) return NextResponse.json(null, { status: 404 });

  const questions = await Question
    .find({ _id: { $in: qn.qids } })
    .lean<QuestionType[]>();

  /* упорядочиваем как в qids */
  const ordered = qn.qids.map((id) => questions.find((q) => q?._id === id));

  return NextResponse.json({ ...qn, questions: ordered });
}

/* ---------- POST: принять один ответ ---------- */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, qid, ui } = (await req.json()) as {
    userId: string;
    qid: string;
    ui: number;
  };

  await connectToDatabase();

  /* 1) пересылаем в /answers/bulk, чтобы пересчитать vectors */
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/answers/bulk`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, answers: [{ qid, ui }] })
  });

  /* 2) фиксируем, что этот вопрос пройден */
  await User.updateOne(
    { id: userId },
    { $addToSet: { [`questionnairesProgress.${params.id}.answered`]: qid } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
