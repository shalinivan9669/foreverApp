// src/app/api/match/inbox/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType, type LikeStatus } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';

type Direction = 'incoming' | 'outgoing';

type Row = {
  id: string;
  direction: Direction;
  status: LikeStatus;
  matchScore: number;
  updatedAt?: string;
  peer: { id: string; username: string; avatar: string };
  canCreatePair: boolean;
};

type LikeLean = Pick<
  LikeType,
  'fromId' | 'toId' | 'status' | 'matchScore'
> & {
  _id: Types.ObjectId;
  updatedAt?: Date;
  createdAt?: Date;
};

type UserLean = Pick<UserType, 'id' | 'username' | 'avatar'>;

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const userId = auth.data.userId;

  await connectToDatabase();

  // все лайки, где пользователь — отправитель или получатель
  const likes = await Like.find({
    $or: [{ fromId: userId }, { toId: userId }],
  })
    .sort({ updatedAt: -1 })
    .lean<LikeLean[]>()
    .exec();

  if (likes.length === 0) {
    return NextResponse.json<Row[]>([]);
  }

  // подтянем юзернеймы/аватарки для собеседников
  const peerIds = Array.from(
    new Set<string>(
      likes.map((l) => (l.fromId === userId ? l.toId : l.fromId))
    )
  );

  const users = await User.find({ id: { $in: peerIds } })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserLean[]>()
    .exec();

  const uMap = new Map<string, UserLean>(users.map((u) => [u.id, u]));

  const rows: Row[] = likes.map((l) => {
    const direction: Direction = l.toId === userId ? 'incoming' : 'outgoing';
    const peerId = direction === 'incoming' ? l.fromId : l.toId;
    const u = uMap.get(peerId);

    // Создание пары допускаем только когда всё согласовано
    // (mutual_ready) и текущий пользователь — инициатор (fromId).
    const canCreatePair =
      l.status === 'mutual_ready' && l.fromId === userId;

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
      canCreatePair,
    };
  });

  return NextResponse.json(rows);
}
