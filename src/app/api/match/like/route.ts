// src/app/api/match/like/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair } from '@/models/Pair';
import { Like } from '@/models/Like';
import { distance, score } from '@/utils/calcMatch';

type Body = {
  fromId: string;
  toId: string;
  agreements?: boolean[]; // приходят с клиента — валидируем, но не сохраняем
  answers?: string[];     // приходят с клиента — валидируем, но не сохраняем
};

const keyOf = (a: string, b: string) => [a, b].sort().join('|');

type UserVectors = Pick<UserType, 'vectors'>;
const vec = (u: UserVectors): number[] => [
  u.vectors.communication.level,
  u.vectors.domestic.level,
  u.vectors.personalViews.level,
  u.vectors.finance.level,
  u.vectors.sexuality.level,
  u.vectors.psyche.level,
];

const clampStr = (s: unknown, max: number) =>
  String((s ?? '') as string).trim().slice(0, max);

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;

  if (!body?.fromId || !body?.toId) {
    return NextResponse.json({ error: 'missing ids' }, { status: 400 });
  }
  if (body.fromId === body.toId) {
    return NextResponse.json({ error: 'self like not allowed' }, { status: 400 });
  }

  // agreements/answers сейчас не сохраняем, но валидируем вход (UI уже отправляет)
  if (!Array.isArray(body.agreements) || body.agreements.length !== 3 || body.agreements.some(x => x !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(body.answers) || body.answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  await connectToDatabase();

  // активная пара уже существует?
  const existPair = await Pair.findOne(
    { key: keyOf(body.fromId, body.toId), status: 'active' },
    { _id: 1 }
  ).lean();
  if (existPair) {
    return NextResponse.json({ error: 'already paired' }, { status: 409 });
  }

  // грузим обоих
  const [from, to] = await Promise.all([
    User.findOne({ id: body.fromId }).lean<UserType | null>(),
    User.findOne({ id: body.toId }).lean<UserType | null>(),
  ]);
  if (!from || !to) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  // карточка инициатора (ЕЁ и должен видеть получатель в RespondModal!)
  const initCard = from.profile?.matchCard;
  if (!initCard?.isActive || !initCard.requirements?.length || !initCard.questions?.length) {
    return NextResponse.json({ error: 'initiator has no active match card' }, { status: 400 });
  }

  // (по желанию можно дополнительно требовать активную карточку получателя — для UX в модалке лайка)
  const recipCard = to.profile?.matchCard;
  if (!recipCard?.isActive || !recipCard.requirements?.length || !recipCard.questions?.length) {
    return NextResponse.json({ error: 'recipient has no active match card' }, { status: 400 });
  }

  // считаем матч-скор
  const d = distance(vec(from), vec(to));
  const matchScore = score(d);

  // СНИМОК КАРТОЧКИ ИНИЦИАТОРА — то, на что будет отвечать получатель
  const fromCardSnapshot = {
    requirements: [
      clampStr(initCard.requirements[0], 80),
      clampStr(initCard.requirements[1], 80),
      clampStr(initCard.requirements[2], 80),
    ] as [string, string, string],
    questions: [
      clampStr(initCard.questions[0], 120),
      clampStr(initCard.questions[1], 120),
    ] as [string, string],
    updatedAt: initCard.updatedAt,
  };

  // создаём лайк в НОВОЙ схеме: только ключевые поля
  const doc = await Like.create({
    fromId: body.fromId,
    toId: body.toId,
    matchScore,
    fromCardSnapshot, // <- критично для RespondModal
    status: 'sent',
  });

  return NextResponse.json({ id: String(doc._id), matchScore });
}
