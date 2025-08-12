import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { User } from '@/models/User';

type Row = {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'viewed' | 'awaiting_initiator' | 'accepted' | 'rejected' | 'expired';
  matchScore: number;
  updatedAt?: string;
  peer: { id: string; username: string; avatar: string };
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? '';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  // входящие: мне пришли → я получатель, любые ожидающие стадии
  const incoming = await Like.find({
    toId: userId,
    status: { $in: ['sent', 'viewed', 'awaiting_initiator'] },
  }).lean();

  // исходящие: я инициатор, ждём моего решения
  const outgoing = await Like.find({
    fromId: userId,
    status: 'awaiting_initiator',
  }).lean();

  const all = [...incoming, ...outgoing];

  // подтянем профили собеседников
  const peerIds = new Set<string>();
  for (const l of all) {
    const peer = l.fromId === userId ? l.toId : l.fromId;
    peerIds.add(peer);
  }
  const users = await User.find({ id: { $in: Array.from(peerIds) } })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean();
  const uMap = new Map(users.map(u => [u.id, u]));

  const rows: Row[] = all
    .map(l => {
      const direction = l.toId === userId ? 'incoming' : 'outgoing';
      const peerId = direction === 'incoming' ? l.fromId : l.toId;
      const u = uMap.get(peerId);
      return {
        id: String(l._id),
        direction,
        status: l.status,
        matchScore: l.matchScore,
        updatedAt: l.updatedAt?.toISOString(),
        peer: {
          id: peerId,
          username: u?.username ?? peerId,
          avatar: u?.avatar ?? '',
        },
      };
    })
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return NextResponse.json(rows);
}
