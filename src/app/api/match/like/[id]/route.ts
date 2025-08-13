// src/app/api/match/like/[id]/route.ts
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

  /** legacy-поля инициатора — теперь опциональны */
  agreements?: [boolean, boolean, boolean];
  answers?: [string, string];
  cardSnapshot?: LikeType['cardSnapshot'];

  /** новое поле — снимок карточки получателя при отправке лайка инициатором */
  fromCardSnapshot?: LikeType['fromCardSnapshot'];

  /** ответы получателя на карточку инициатора (если уже ответил) */
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

const avatarUrl = (id: string, avatar?: string) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.pathname.split('/').pop() || '';
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  await connectToDatabase();

  const l = await Like.findById(id).lean<LikeLean | null>();
  if (!l) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const users = await User.find({ id: { $in: [l.fromId, l.toId] } })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserType[]>();

  const byId = new Map(users.map(u => [u.id, u]));
  const fromU = byId.get(l.fromId);
  const toU   = byId.get(l.toId);

  const dto: DTO = {
    id: l._id.toHexString(),
    status: l.status,
    matchScore: l.matchScore,
    updatedAt: l.updatedAt ? new Date(l.updatedAt).toISOString() : undefined,

    from: { id: l.fromId, username: fromU?.username ?? l.fromId, avatar: avatarUrl(l.fromId, fromU?.avatar) },
    to:   { id: l.toId,   username: toU?.username   ?? l.toId,   avatar: avatarUrl(l.toId,   toU?.avatar) },

    // legacy-поля — могут отсутствовать
    agreements: l.agreements,
    answers:    l.answers,
    cardSnapshot: l.cardSnapshot,

    // новое поле
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
