import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { requireSession } from '@/lib/auth/guards';

type Body = { likeId: string; userId?: string }; // userId legacy field is ignored

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const { likeId } = (await req.json()) as Body;
  if (!likeId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();
  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (like.fromId !== currentUserId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (like.status !== 'awaiting_initiator')
    return NextResponse.json({ error: `invalid status ${like.status}` }, { status: 400 });

  const now = new Date();
  await Like.updateOne(
    { _id: like._id, fromId: currentUserId },
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
