import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, LikeType, LikeStatus } from '@/models/Like';
import { User, UserType } from '@/models/User';
import { Types } from 'mongoose';

type LikeLean = LikeType & { _id: Types.ObjectId; updatedAt?: Date; createdAt?: Date };

type DTO = {
  id: string;
  status: LikeStatus;
  matchScore: number;
  updatedAt?: string;
  from: { id: string; username: string; avatar: string };
  to:   { id: string; username: string; avatar: string };
  fromCardSnapshot: LikeType['fromCardSnapshot'];
  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: LikeType['fromCardSnapshot'];
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
        ? {
            accepted: l.initiatorDecision.accepted,
            at: new Date(l.initiatorDecision.at).toISOString(),
          }
        : null,
      recipient: l.recipientDecision
        ? {
            accepted: l.recipientDecision.accepted,
            at: new Date(l.recipientDecision.at).toISOString(),
          }
        : null,
    },
  };

  return NextResponse.json(dto);
}
