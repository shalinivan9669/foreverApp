import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';

type Body = {
  userId: string;                   // кто отвечает (получатель лайка)
  agreements: boolean[];
  answers: string[];
};

/**
 * Получатель лайка отвечает на условия и вопросы.
 * Переводим статус в 'awaiting_initiator' и сохраняем recipientResponse,
 * кладя туда «снимок карточки инициатора» = like.fromCardSnapshot.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const likeId = req.nextUrl.searchParams.get('id') || ''; // можно вызывать как /api/match/respond?id=...

  if (!likeId) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }
  if (!body?.userId) {
    return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  }
  if (!Array.isArray(body.agreements) || body.agreements.length !== 3 || body.agreements.some(x => x !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(body.answers) || body.answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  await connectToDatabase();

  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Право отвечать — только получатель
  if (like.toId !== body.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Уже отвечал?
  if (like.recipientResponse) {
    return NextResponse.json({ error: 'already responded' }, { status: 409 });
  }

  // БЕЗОПАСНО: если по какой-то причине старые лайки без fromCardSnapshot — откажем,
  // чтобы не падал фронт.
  if (!like.fromCardSnapshot) {
    return NextResponse.json({ error: 'like has no fromCardSnapshot' }, { status: 409 });
  }

  like.recipientResponse = {
    agreements: [true, true, true],
    answers: [String(body.answers[0] ?? ''), String(body.answers[1] ?? '')] as [string, string],
    initiatorCardSnapshot: like.fromCardSnapshot,
    at: new Date(),
  };
  like.status = 'awaiting_initiator';

  await like.save();

  return NextResponse.json({ ok: true });
}
