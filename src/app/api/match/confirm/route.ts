import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { User } from '@/models/User';

const keyOf = (a: string, b: string) => [a, b].sort().join('|');

type Body = { likeId: string; userId: string }; // userId должен быть инициатором (fromId)

export async function POST(req: NextRequest) {
  const { likeId, userId } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();
  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (like.fromId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (like.status !== 'awaiting_initiator' || !like.recipientResponse) {
    return NextResponse.json({ error: 'not ready' }, { status: 400 });
  }

  const a = like.fromId;
  const b = like.toId;
  const key = keyOf(a, b);
  const members = [a, b].sort() as [string, string];

  const pair = await Pair.findOneAndUpdate(
    { key },
    {
      $setOnInsert: {
        key,
        members,
        status: 'active',
        progress: { streak: 0, completed: 0 },
      },
    },
    { new: true, upsert: true }
  ).lean();

  await Like.updateOne({ _id: like._id }, { $set: { status: 'accepted', updatedAt: new Date() } });

  await Like.updateMany(
    {
      _id: { $ne: like._id },
      $or: [{ fromId: a, toId: b }, { fromId: b, toId: a }],
      status: { $in: ['sent', 'viewed', 'awaiting_initiator'] },
    },
    { $set: { status: 'expired' } }
  );

  await User.updateMany(
    { id: { $in: [a, b] } },
    { $set: { 'personal.relationshipStatus': 'in_relationship' } }
  );

  return NextResponse.json({ ok: true, pairId: String(pair?._id), members });
}
