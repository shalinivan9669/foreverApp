import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, UserType } from '@/models/User';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? '';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  const pair = await Pair.findOne({
    members: userId,
    status: 'active',
  }).lean();

  if (!pair) return NextResponse.json({ hasActive: false });

  const peerId = pair.members.find(m => m !== userId)!;
  const peer = await User.findOne({ id: peerId })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserType | null>();

  return NextResponse.json({
    hasActive: true,
    pairKey: pair.key,
    peer: peer ? { id: peer.id, username: peer.username, avatar: peer.avatar } : { id: peerId, username: peerId, avatar: '' }
  });
}
