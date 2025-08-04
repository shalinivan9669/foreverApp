import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire }     from '@/models/Questionnaire';
import { Question }          from '@/models/Question';
import { User }              from '@/models/User';
import type { QuestionType } from '@/models/Question';
import type { QuestionnaireType } from '@/models/Questionnaire';

interface Ctx { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  await connectToDatabase();
  const qn = await Questionnaire.findById(params.id).lean<QuestionnaireType | null>();
  if (!qn) return NextResponse.json(null,{ status:404 });

  const questions = await Question.find({ _id: { $in: qn.qids } })
                                  .lean<QuestionType[]>();

  // вернуть вопросы в том порядке, как в qn.qids
  const ordered = qn.qids.map(id => questions.find(q => q._id === id));
  return NextResponse.json({ ...qn, questions: ordered });
}

/* ---------- answer ---------- */
export async function POST(req:NextRequest, { params }:Ctx) {
  const { userId, qid, ui } = await req.json() as { userId:string; qid:string; ui:number };

  await connectToDatabase();
  // 1) проксируем единичный ответ через /answers/bulk
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/answers/bulk`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ userId, answers:[{ qid, ui }] })
  });

  // 2) фиксируем progress
  await User.updateOne(
    { id:userId },
    {
      $addToSet: { [`questionnairesProgress.${params.id}.answered`]: qid }
    },
    { upsert:true }
  );

  return NextResponse.json({ ok:true });
}
