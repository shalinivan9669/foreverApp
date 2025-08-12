import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType, type LikeStatus } from '@/models/Like';
import { User, type UserType } from '@/models/User';

type LikeLean = LikeType & { _id: Types.ObjectId; updatedAt?: Date; createdAt?: Date };

type DTO = {
  id: string;
  status: LikeStatus;
  matchScore: number;
  updatedAt?: string;

  from: { id: string; username: string; avatar: string };
  to:   { id: string; username: string; avatar: string };

  // то, что инициатор заполнил по карточке получателя
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  cardSnapshot: LikeType['cardSnapshot'];

  // оставляем поле на случай старых документов/отладок
  fromCardSnapshot?: LikeType['fromCardSnapshot'];

  // если получатель тоже отвечал на карточку инициатора
  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: NonNullable<LikeType['recipientResponse']>['initiatorCardSnapshot'];
    at: string;
  };

  decisions: {
    initiator: null | { accepted: boolean; at: string };
    recipient: null | { accepted: boolean; at: string };
  };
};

export async function GET(req: NextRequest) {
  const id = req.nextUrl.pathname.split('/').pop() || '';
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  await connectToDatabase();

  const l = await Like.findById(id).lean<LikeLean | null>();
  if (!l) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const users = await User.find({ id: { $in: [l.fromId, l.toId] } })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserType[]>();

  const map = new Map(users.map(u => [u.id, u]));
  const fromU = map.get(l.fromId);
  const toU   = map.get(l.toId);

  const dto: DTO = {
    id: l._id.toHexString(),
    status: l.status,
    matchScore: l.matchScore,
    updatedAt: l.updatedAt ? new Date(l.updatedAt).toISOString() : undefined,

    from: { id: l.fromId, username: fromU?.username ?? l.fromId, avatar: fromU?.avatar ?? '' },
    to:   { id: l.toId,   username: toU?.username   ?? l.toId,   avatar: toU?.avatar   ?? '' },

    agreements: l.agreements,
    answers:    l.answers,
    cardSnapshot: l.cardSnapshot,

    fromCardSnapshot: l.fromCardSnapshot,

    recipientResponse: l.recipientResponse
      ? {
          agreements: l.recipientResponse.agreements,
          answers: l.recipientResponse.answers,
          initiatorCardSnapshot: l.recipientResponse.initiatorCardSnapshot,
          at: new Date(l.recipientResponse.at).toISOString(),
        }
      : null,

    decisions: {
      initiator: l.initiatorDecision
        ? { accepted: l.initiatorDecision.accepted, at: new Date(l.initiatorDecision.at).toISOString() }
        : null,
      recipient: l.recipientDecision
        ? { accepted: l.recipientDecision.accepted, at: new Date(l.recipientDecision.at).toISOString() }
        : null,
    },
  };

  return NextResponse.json(dto);
}
