import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { User } from '@/models/User';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId'); // кто смотрит
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  const l = await Like.findById(id).lean();
  if (!l) return NextResponse.json(null, { status: 404 });
  if (l.toId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // mark viewed (одноразово)
  if (l.status === 'sent') {
    await Like.updateOne({ _id: l._id, status: 'sent' }, { $set: { status: 'viewed' } });
    l.status = 'viewed';
  }

  const from = await User.findOne({ id: l.fromId }, { id:1, username:1, avatar:1 }).lean();

  return NextResponse.json({
    likeId: String(l._id),
    from: {
      id: from?.id ?? l.fromId,
      username: from?.username ?? 'unknown',
      avatar: from?.avatar ?? ''
    },
    agreements: l.agreements,
    answers: l.answers,
    cardSnapshot: l.cardSnapshot,
    matchScore: l.matchScore,
    status: l.status,
    createdAt: l.createdAt
  });
}
