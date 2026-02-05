import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question, type QuestionType } from '@/models/Question';
import { User, type UserType }         from '@/models/User';
import { buildVectorUpdate, type VectorQuestion } from '@/utils/vectorUpdates';

interface Body { userId: string; answers: { qid: string; ui: number }[] }

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
    // safeguard by _id key only
    qMap[String(q._id)] = q;
  }

  // читаем пользователя
  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return NextResponse.json({ error: 'no user' }, { status: 404 });

  const { setLevels, addToSet } = buildVectorUpdate(
    doc,
    answers,
    qMap as Record<string, VectorQuestion>
  );

  type Update = { $set: Record<string, number>; $addToSet?: Record<string, { $each: string[] }> };
  const update: Update = { $set: setLevels };
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  await User.updateOne({ id: userId }, update);
  return NextResponse.json({ ok: true });
}
