import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';

type Body = { likeId: string; userId: string }; // любой участник

export async function POST(req: NextRequest) {
  const { likeId, userId } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();
  const like = await Like.findById(likeId).lean();
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (![like.fromId, like.toId].includes(userId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (like.status !== 'mutual_ready')
    return NextResponse.json({ error: `not ready: ${like.status}` }, { status: 400 });

  const members = [like.fromId, like.toId].sort() as [string, string];
  const key = `${members[0]}|${members[1]}`;

  await Pair.findOneAndUpdate(
    { key },
    { $setOnInsert: { members, key, status: 'active' } },
    { upsert: true }
  );

  await Like.updateOne({ _id: like._id }, { $set: { status: 'paired', updatedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
