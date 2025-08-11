import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';

type Body = { likeId: string; userId: string };

export async function POST(req: NextRequest) {
  const { likeId, userId } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  await connectToDatabase();

  const l = await Like.findById(likeId);
  if (!l) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (l.toId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (l.status === 'rejected') return NextResponse.json({ ok: true, already: true });

  if (l.status !== 'sent' && l.status !== 'viewed') {
    return NextResponse.json({ error: `invalid status ${l.status}` }, { status: 400 });
  }

  l.status = 'rejected';
  await l.save();

  return NextResponse.json({ ok: true });
}
