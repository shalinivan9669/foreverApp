import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase }         from '@/lib/mongodb'
import { Questionnaire }             from '@/models/Questionnaire'
import { Question }                  from '@/models/Question'
import { User }                      from '@/models/User'
import type { QuestionType }         from '@/models/Question'
import type { QuestionnaireType }    from '@/models/Questionnaire'

/* ---------- GET: получить анкету + вопросы ---------- */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

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

  // Восстанавливаем исходный порядок
  const ordered = qn.qids.map(qid =>
    questions.find(q => String(q._id) === String(qid)) || null
  )

  return NextResponse.json({ ...qn, questions: ordered })
}

/* ---------- POST: сохранить один ответ ---------- */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const { userId, qid, ui } = (await req.json()) as {
    userId: string
    qid:    string
    ui:     number
  }

  await connectToDatabase()

  // Пересчитать векторы (bulk-endpoint)
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/answers/bulk`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, answers: [{ qid, ui }] }),
  })

  // Обновляем прогресс пользователя
  await User.updateOne(
    { id: userId },
    { $addToSet: { [`questionnairesProgress.${id}.answered`]: qid } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true })
}
