import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase }         from '@/lib/mongodb'
import { Questionnaire }             from '@/models/Questionnaire'
import { Question }                  from '@/models/Question'
import { User }                      from '@/models/User'
import type { QuestionType }         from '@/models/Question'
import type { QuestionnaireType }    from '@/models/Questionnaire'

/* ---------- GET: анкета + вопросы ---------- */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id

  await connectToDatabase()

  const qn = await Questionnaire
    .findById(id)
    .lean<QuestionnaireType | null>()

  if (!qn) {
    return NextResponse.json(null, { status: 404 })
  }

  const questions = await Question
    .find({ _id: { $in: qn.qids } })
    .lean<QuestionType[]>()

  // Восстанавливаем порядок вопросов по qn.qids
  const ordered = qn.qids.map(qid =>
    questions.find(q => q?._id === qid) || null
  )

  return NextResponse.json({ ...qn, questions: ordered })
}

/* ---------- POST: один ответ ---------- */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id
  const { userId, qid, ui } = (await req.json()) as {
    userId: string
    qid:    string
    ui:     number
  }

  await connectToDatabase()

  // Пересчитать векторы через existing endpoint
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/answers/bulk`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, answers: [{ qid, ui }] }),
  })

  // Зафиксировать прогресс пользователя
  await User.updateOne(
    { id: userId },
    { $addToSet: { [`questionnairesProgress.${id}.answered`]: qid } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true })
}
