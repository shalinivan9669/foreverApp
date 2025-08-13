import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair } from '@/models/Pair';
import { Like } from '@/models/Like';
import { distance, score } from '@/utils/calcMatch';

type Body = {
  fromId: string;
  toId: string;
  agreements: boolean[];
  answers: string[];
};

const clampStr = (s: unknown, max: number) =>
  String((s ?? '') as string).trim().slice(0, max);

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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;

  if (!body?.fromId || !body?.toId) {
    return NextResponse.json({ error: 'missing ids' }, { status: 400 });
  }
  if (body.fromId === body.toId) {
    return NextResponse.json({ error: 'self like not allowed' }, { status: 400 });
  }
  if (!Array.isArray(body.agreements) || body.agreements.length !== 3 || body.agreements.some(x => x !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(body.answers) || body.answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  await connectToDatabase();

  // активная пара уже существует?
  const existsPair = await Pair.findOne({ key: keyOf(body.fromId, body.toId), status: 'active' }, { _id: 1 }).lean();
  if (existsPair) return NextResponse.json({ error: 'already paired' }, { status: 409 });

  // грузим пользователей
  const [from, to] = await Promise.all([
    User.findOne({ id: body.fromId }).lean<UserType | null>(),
    User.findOne({ id: body.toId }).lean<UserType | null>(),
  ]);
  if (!from || !to) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // проверяем карточку получателя (условия + вопросы)
  const card = to.profile?.matchCard;
  if (!card?.isActive || !card.requirements?.length || !card.questions?.length) {
    return NextResponse.json({ error: 'recipient has no active match card' }, { status: 400 });
  }

  const d = distance(vec(from), vec(to));
  const matchScore = score(d);

  // нормализуем «снимок» карточки инициатора (на самом деле — карточки получателя,
  // с которой инициатор согласился; поле называется fromCardSnapshot, т.к. лайк «от» инициатора)
  const fromCardSnapshot = {
    requirements: [
      clampStr(card.requirements[0], 80),
      clampStr(card.requirements[1], 80),
      clampStr(card.requirements[2], 80),
    ] as [string, string, string],
    questions: [
      clampStr(card.questions[0], 120),
      clampStr(card.questions[1], 120),
    ] as [string, string],
    updatedAt: card.updatedAt,
  };

  // сохраняем лайк (заявку)
  const doc = await Like.create({
    fromId: body.fromId,
    toId: body.toId,
    matchScore,
    fromCardSnapshot,            // ВАЖНО: именно это поле требуется фронту
    status: 'sent',
  });

  // (опционально: можно логировать «инициатор принял условия/ответил», если понадобится —
  //  сохраняй это отдельной коллекцией; в текущей схеме поля для этого нет, и это ок)

  return NextResponse.json({ id: String(doc._id), matchScore });
}
