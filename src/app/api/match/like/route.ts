// src/app/api/match/like/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType } from '@/models/Like';
import { User, type UserType } from '@/models/User';

export const runtime = 'nodejs';

type Body = {
  userId?: string;              // инициатор (alias of fromId)
  fromId?: string;              // поддерживаем старое имя
  toId?: string;                // получатель
  agreements?: boolean[];       // [true,true,true]
  answers?: string[];           // [string,string]
};

const json = (d: unknown, s = 200) => NextResponse.json(d, { status: s });
const clamp = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);

function buildInitiatorSnapshot(u: UserType | null): LikeType['fromCardSnapshot'] | undefined {
  const c = u?.profile?.matchCard;
  if (!c?.isActive) return undefined;
  if (!c.requirements?.length || !c.questions?.length) return undefined;
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
  const body = (await req.json().catch(() => ({}))) as Body;

  // поддерживаем оба имени поля
  const fromId = body.userId ?? body.fromId ?? '';
  const toId   = body.toId ?? '';

  if (!fromId) return json({ error: 'missing userId' }, 400);
  if (!toId)   return json({ error: 'missing toId' }, 400);

  if (!Array.isArray(body.agreements) || body.agreements.length !== 3 || body.agreements.some(v => v !== true)) {
    return json({ error: 'agreements must be [true,true,true]' }, 400);
  }
  if (!Array.isArray(body.answers) || body.answers.length !== 2) {
    return json({ error: 'answers must have length 2' }, 400);
  }

  await connectToDatabase();

  // снимок карточки инициатора
  const initiator = await User.findOne({ id: fromId }).lean<UserType | null>();
  const fromCardSnapshot = buildInitiatorSnapshot(initiator);
  if (!fromCardSnapshot) return json({ error: 'initiator card snapshot missing' }, 400);

  // базовый скор, при желании подставишь свою формулу
  const matchScore = Math.max(0, Math.min(100, 75));

  const like = await Like.create({
    fromId,
    toId,
    matchScore,
    fromCardSnapshot,
    status: 'sent',
  });

  return json({ id: String(like._id), matchScore }, 200);
}
