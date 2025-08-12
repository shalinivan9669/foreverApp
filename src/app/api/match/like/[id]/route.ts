import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { User } from '@/models/User';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? '';
  if (!id || !userId) return NextResponse.json({ error: 'bad params' }, { status: 400 });

  await connectToDatabase();
  const l = await Like.findById(id).lean();
  if (!l) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (l.toId !== userId && l.fromId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // пометить просмотренным, если получатель открыл
  if (l.toId === userId && l.status === 'sent') {
    await Like.updateOne({ _id: l._id }, { $set: { status: 'viewed', updatedAt: new Date() } });
    l.status = 'viewed';
  }

  const from = await User.findOne({ id: l.fromId }).lean();
  const to   = await User.findOne({ id: l.toId }).lean();

  return NextResponse.json({
    likeId: String(l._id),
    from: { id: l.fromId, username: from?.username ?? l.fromId, avatar: from?.avatar ?? '' },
    to:   { id: l.toId,   username: to?.username ?? l.toId,     avatar: to?.avatar ?? '' },
    agreements: l.agreements,
    answers: l.answers,
    cardSnapshot: l.cardSnapshot,
    recipientResponse: l.recipientResponse ?? null,
    matchScore: l.matchScore,
    status: l.status,
    createdAt: l.createdAt,
  });
}
