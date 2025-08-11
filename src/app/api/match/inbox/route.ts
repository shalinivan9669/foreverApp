import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { User } from '@/models/User';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  const likes = await Like.find({ toId: userId, status: 'sent' })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const fromIds = [...new Set(likes.map(l => l.fromId))];
  const users   = await User.find({ id: { $in: fromIds } }, { id:1, username:1, avatar:1 }).lean();
  const map = new Map(users.map(u => [u.id, u]));

  const items = likes.map(l => ({
    likeId:   String(l._id),
    fromId:   l.fromId,
    username: map.get(l.fromId)?.username ?? 'unknown',
    avatar:   map.get(l.fromId)?.avatar ?? '',
    matchScore: l.matchScore,
    createdAt:  l.createdAt
  }));

  return NextResponse.json(items);
}
