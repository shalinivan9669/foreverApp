import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await connectToDatabase();

  const doc = await PairActivity.findById(id);
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  doc.status = 'accepted';
  doc.acceptedAt = new Date();
  await doc.save();
  return NextResponse.json({ ok:true });
}
