import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';

type Body = { likeId: string; userId: string }; // userId = fromId

export async function POST(req: NextRequest) {
  const { likeId, userId } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();
  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (like.fromId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (like.status !== 'awaiting_initiator')
    return NextResponse.json({ error: `invalid status ${like.status}` }, { status: 400 });

  const now = new Date();
  await Like.updateOne(
    { _id: like._id, fromId: userId },
    {
      $set: {
        initiatorDecision: { accepted: true, at: now },
        status: 'mutual_ready',
        updatedAt: now,
      },
    }
  );

  return NextResponse.json({ ok: true });
}
