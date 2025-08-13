// src/app/api/match/respond/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType } from '@/models/Like';
import { User, type UserType } from '@/models/User';

type Body = {
  userId?: string;                      // кто отвечает (должен быть получателем лайка)
  likeId?: string;                      // id лайка
  agreements?: boolean[];               // [true,true,true]
  answers?: string[];                   // [string,string]
};

const clamp = (s: unknown, max: number) =>
  String((s ?? '') as string).trim().slice(0, max);

// собрать снапшот карточки инициатора на момент ответа
function buildInitiatorSnapshot(u: UserType | null): LikeType['fromCardSnapshot'] | undefined {
  if (!u?.profile?.matchCard?.isActive) return undefined;
  const c = u.profile.matchCard;
  if (!c?.requirements?.length || !c?.questions?.length) return undefined;
  return {
    requirements: [
      clamp(c.requirements[0], 80),
      clamp(c.requirements[1], 80),
      clamp(c.requirements[2], 80),
    ] as [string, string, string],
    questions: [
      clamp(c.questions[0], 120),
      clamp(c.questions[1], 120),
    ] as [string, string],
    updatedAt: c.updatedAt,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;

  if (!body.likeId) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }
  if (!body.userId) {
    return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  }
  if (!Array.isArray(body.agreements) || body.agreements.length !== 3 || body.agreements.some(x => x !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(body.answers) || body.answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  await connectToDatabase();

  const like = await Like.findById(body.likeId);
  if (!like) {
    return NextResponse.json({ error: 'like not found' }, { status: 404 });
  }

  // отвечать может только получатель
  if (like.toId !== body.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // отвечать можно только на свежий лайк
  if (!['sent', 'viewed'].includes(like.status)) {
    return NextResponse.json({ error: 'invalid state' }, { status: 409 });
  }

  // снапшот карточки инициатора на момент ответа (если нет активной — берём снимок из лайка)
  const initiator = await User.findOne({ id: like.fromId }).lean<UserType | null>();
  let initiatorCardSnapshot = buildInitiatorSnapshot(initiator);
  if (!initiatorCardSnapshot) {
    // fallback к снимку, сохранённому в момент отправки лайка
    if (like.fromCardSnapshot) {
      initiatorCardSnapshot = like.fromCardSnapshot;
    } else {
      return NextResponse.json({ error: 'initiator card snapshot missing' }, { status: 400 });
    }
  }

  // сохраняем ответ получателя и переводим лайк в ожидание решения инициатора
  like.recipientResponse = {
    agreements: [true, true, true],
    answers: [clamp(body.answers[0], 280), clamp(body.answers[1], 280)],
    initiatorCardSnapshot,
    at: new Date(),
  };
  like.status = 'awaiting_initiator';

  await like.save();

  return NextResponse.json({ ok: true, status: like.status });
}
