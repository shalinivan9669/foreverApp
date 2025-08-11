import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { distance, score } from '@/utils/calcMatch';

type Body = {
  fromId: string;
  toId: string;
  agreements: boolean[];
  answers: string[];
};

const clamp = (s: string, max: number) => String(s ?? '').trim().slice(0, max);
const keyOf = (a: string, b: string) => [a, b].sort().join('|');

type UserVectors = Pick<UserType, 'vectors'>;
const pickVec = (u: UserVectors): number[] => [
  u.vectors.communication.level,
  u.vectors.domestic.level,
  u.vectors.personalViews.level,
  u.vectors.finance.level,
  u.vectors.sexuality.level,
  u.vectors.psyche.level
];

interface MongoErrorLike { code?: number }

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Body;

  if (!b?.fromId || !b?.toId) {
    return NextResponse.json({ error: 'missing ids' }, { status: 400 });
  }
  if (b.fromId === b.toId) {
    return NextResponse.json({ error: 'self like not allowed' }, { status: 400 });
  }
  if (!Array.isArray(b.agreements) || b.agreements.length !== 3 || b.agreements.some(x => x !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(b.answers) || b.answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  const answers: [string, string] = [clamp(b.answers[0], 280), clamp(b.answers[1], 280)];

  await connectToDatabase();

  const pairKey = keyOf(b.fromId, b.toId);
  const existPair = await Pair.findOne({ key: pairKey, status: 'active' }, { _id: 1 }).lean();
  if (existPair) return NextResponse.json({ error: 'already paired' }, { status: 409 });

  const [from, to] = await Promise.all([
    User.findOne({ id: b.fromId }).lean<UserType | null>(),
    User.findOne({ id: b.toId }).lean<UserType | null>()
  ]);
  if (!from || !to) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const card = to.profile?.matchCard;
  if (!card?.isActive || !card?.requirements?.length || !card?.questions?.length) {
    return NextResponse.json({ error: 'recipient has no active match card' }, { status: 400 });
  }

  const d = distance(pickVec(from), pickVec(to));
  const sc = score(d);

  try {
    const doc = await Like.create({
      fromId: b.fromId,
      toId: b.toId,
      agreements: [true, true, true],
      answers,
      cardSnapshot: {
        requirements: [
          clamp(card.requirements[0], 80),
          clamp(card.requirements[1], 80),
          clamp(card.requirements[2], 80)
        ] as [string, string, string],
        questions: [
          clamp(card.questions[0], 120),
          clamp(card.questions[1], 120)
        ] as [string, string],
        updatedAt: card.updatedAt
      },
      matchScore: sc,
      status: 'sent'
    });

    return NextResponse.json({ id: doc._id.toString(), matchScore: sc });
  } catch (e: unknown) {
    const err = e as MongoErrorLike;
    if (err?.code === 11000) {
      return NextResponse.json({ error: 'already sent' }, { status: 409 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
