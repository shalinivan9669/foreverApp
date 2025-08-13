import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType, type LikeStatus } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import { distance, score } from '@/utils/calcMatch';

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

const vec = (u: Pick<UserType, 'vectors'>) => [
  u.vectors.communication.level,
  u.vectors.domestic.level,
  u.vectors.personalViews.level,
  u.vectors.finance.level,
  u.vectors.sexuality.level,
  u.vectors.psyche.level,
];

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') || '';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  // текущий пользователь (для возможного пересчёта matchScore)
  const me = await User.findOne({ id: userId })
    .select({ id: 1, username: 1, avatar: 1, vectors: 1 })
    .lean<UserType | null>();
  if (!me) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // все лайки, где я инициатор или получатель
  const likes = await Like.find({
    $or: [{ fromId: userId }, { toId: userId }],
  })
    .sort({ updatedAt: -1 })
    .lean<LikeType[]>();

  if (!likes.length) return NextResponse.json([]);

  // подтянем карточки всех собеседников разом
  const peerIds = Array.from(
    new Set(likes.map(l => (l.fromId === userId ? l.toId : l.fromId)))
  );
  const peers = await User.find({ id: { $in: peerIds } })
    .select({ id: 1, username: 1, avatar: 1, vectors: 1 })
    .lean<UserType[]>();
  const peerMap = new Map(peers.map(p => [p.id, p]));

  const meVec = vec(me);

  const rows: Row[] = likes.map(l => {
    const direction: Direction = l.fromId === userId ? 'outgoing' : 'incoming';
    const peerId = direction === 'outgoing' ? l.toId : l.fromId;
    const peer = peerMap.get(peerId);

    // берём сохранённый score, а если что — пересчитываем
    let s = l.matchScore ?? 0;
    if ((!s || Number.isNaN(s)) && peer) {
      s = score(distance(meVec, vec(peer)));
    }

    return {
      id: String((l as any)._id),
      direction,
      status: l.status as LikeStatus,
      matchScore: Math.max(0, Math.min(100, Math.round(s))),
      updatedAt: l.updatedAt ? new Date(l.updatedAt).toISOString() : undefined,
      peer: {
        id: peer?.id ?? peerId,
        username: peer?.username ?? peerId,
        // avatar — hash; фронт сам склеит URL
        avatar: peer?.avatar ?? '',
      },
      canCreatePair: l.status === 'mutual_ready',
    };
  });

  // уже отсортировано в запросе, но на всякий случай
  rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return NextResponse.json(rows);
}
