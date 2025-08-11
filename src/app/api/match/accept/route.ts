import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { User } from '@/models/User';

type Body = { likeId: string; userId: string };
const keyOf = (a: string, b: string) => [a, b].sort().join('|');

export async function POST(req: NextRequest) {
  const { likeId, userId } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();

  const l = await Like.findById(likeId);
  if (!l) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (l.toId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (l.status === 'accepted') return NextResponse.json({ ok: true, already: true });

  if (l.status !== 'sent' && l.status !== 'viewed') {
    return NextResponse.json({ error: `invalid status ${l.status}` }, { status: 400 });
  }

  const a = l.fromId;
  const b = l.toId;
  const key = keyOf(a, b);
  const members = [a, b].sort() as [string, string];

  const pair = await Pair.findOneAndUpdate(
    { key },
    {
      $setOnInsert: {
        key,
        members,
        status: 'active',
        progress: { streak: 0, completed: 0 }
      }
    },
    { new: true, upsert: true }
  ).lean();

  await Like.updateOne({ _id: l._id }, { $set: { status: 'accepted' } });

  await Like.updateMany(
    {
      _id: { $ne: l._id },
      $or: [{ fromId: a, toId: b }, { fromId: b, toId: a }],
      status: { $in: ['sent', 'viewed'] }
    },
    { $set: { status: 'expired' } }
  );

  await User.updateMany(
    { id: { $in: [a, b] } },
    { $set: { 'personal.relationshipStatus': 'in_relationship' } }
  );

  return NextResponse.json({ ok: true, pairId: String(pair?._id), members });
}
