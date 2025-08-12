import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, LikeType } from '@/models/Like';
import { User, UserType } from '@/models/User';

type Row = {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: LikeType['status'];
  matchScore: number;
  updatedAt?: string;
  peer: { id: string; username: string; avatar: string };
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? '';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  const incoming = await Like.find({
    toId: userId,
    status: { $in: ['sent', 'viewed', 'awaiting_initiator'] },
  }).lean<LikeType[]>();

  const outgoing = await Like.find({
    fromId: userId,
    status: 'awaiting_initiator',
  }).lean<LikeType[]>();

  const all = [...incoming, ...outgoing];

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
        id: String((l as any)._id),
        direction, // литеральный union
        status: l.status,
        matchScore: l.matchScore,
        updatedAt: (l as any).updatedAt ? new Date((l as any).updatedAt as any).toISOString() : undefined,
        peer: {
          id: peerId,
          username: u?.username ?? peerId,
          avatar: u?.avatar ?? '',
        },
      } satisfies Row;
    })
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return NextResponse.json(rows);
}
