import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';

type Body = {
  userId?: string;              // кто отвечает (получатель лайка)
  likeId?: string;              // id лайка
  agreements?: boolean[];       // [true,true,true]
  answers?: string[];           // [ans1, ans2]
};

const clamp = (s: unknown, max: number) =>
  String(s ?? '').trim().slice(0, max) as string;

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Body;

  // валидация тела запроса
  if (!b.userId || !b.likeId) {
    return NextResponse.json({ error: 'missing userId or likeId' }, { status: 400 });
  }
  if (!Array.isArray(b.agreements) || b.agreements.length !== 3 || b.agreements.some(v => v !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(b.answers) || b.answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  const answers: [string, string] = [
    clamp(b.answers[0], 280),
    clamp(b.answers[1], 280),
  ];

  await connectToDatabase();

  // читаем лайк
  if (!Types.ObjectId.isValid(b.likeId)) {
    return NextResponse.json({ error: 'invalid likeId' }, { status: 400 });
  }

  const likeDoc = await Like.findById(b.likeId);
  if (!likeDoc) {
    return NextResponse.json({ error: 'like not found' }, { status: 404 });
  }

  // защищаемся: отвечать может только получатель
  if (likeDoc.toId !== b.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // статус должен позволять ответ (ещё не отвечал и не финализирован)
  if (!['sent', 'viewed'].includes(likeDoc.status)) {
    return NextResponse.json({ error: `invalid status: ${likeDoc.status}` }, { status: 400 });
  }
  if (likeDoc.recipientResponse) {
    return NextResponse.json({ error: 'already responded' }, { status: 409 });
  }

  // снапшот карточки инициатора должен быть (по схеме обязателен, но проверим)
  if (!likeDoc.fromCardSnapshot) {
    return NextResponse.json({ error: 'corrupt like: missing snapshot' }, { status: 500 });
  }

  // фиксируем ответ получателя и переводим лайк в ожидание решения инициатора
  likeDoc.recipientResponse = {
    agreements: [true, true, true],
    answers,
    initiatorCardSnapshot: likeDoc.fromCardSnapshot, // после guard точно не undefined
    at: new Date(),
  };
  likeDoc.status = 'awaiting_initiator';

  // (опционально) зафиксируем, что получатель согласен продолжить
  likeDoc.recipientDecision = { accepted: true, at: new Date() };

  await likeDoc.save();

  return NextResponse.json({ ok: true });
}
