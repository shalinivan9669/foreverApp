import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

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
