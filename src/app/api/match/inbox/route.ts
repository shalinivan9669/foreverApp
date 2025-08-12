import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, LikeType, LikeStatus } from '@/models/Like';
import { User, UserType } from '@/models/User';
import { Types } from 'mongoose';

type Row = {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: LikeStatus;
  matchScore: number;
  updatedAt?: string;
  peer: { id: string; username: string; avatar: string };
  canCreatePair: boolean;
};

type LikeLean = LikeType & { _id: Types.ObjectId; updatedAt?: Date; createdAt?: Date };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? '';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  // входящие (я получатель)
  const incoming = await Like.find({
    toId: userId,
    status: { $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready'] },
  }).lean<LikeLean[]>();

  // исходящие (я инициатор)
  const outgoing = await Like.find({
    fromId: userId,
    status: { $in: ['awaiting_initiator', 'mutual_ready'] },
  }).lean<LikeLean[]>();

  const all: LikeLean[] = [...incoming, ...outgoing];

  // подтянем карточки собеседников
  const peerIds = new Set<string>();
  for (const l of all) {
    const dir: 'incoming' | 'outgoing' = l.toId === userId ? 'incoming' : 'outgoing';
    const peerId = dir === 'incoming' ? l.fromId : l.toId;
    peerIds.add(peerId);
  }

  const users = await User.find({ id: { $in: Array.from(peerIds) } })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserType[]>();

  const uMap = new Map(users.map(u => [u.id, u]));

  const rows: Row[] = all
    .map((l) => {
      const direction: 'incoming' | 'outgoing' = l.toId === userId ? 'incoming' : 'outgoing';
      const peerId = direction === 'incoming' ? l.fromId : l.toId;
      const u = uMap.get(peerId);
      return {
        id: l._id.toHexString(),
        direction,
        status: l.status,
        matchScore: l.matchScore,
        updatedAt: l.updatedAt ? new Date(l.updatedAt).toISOString() : undefined,
        peer: {
          id: peerId,
          username: u?.username ?? peerId,
          avatar: u?.avatar ?? '',
        },
        canCreatePair: l.status === 'mutual_ready',
      };
    })
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return NextResponse.json(rows);
}
