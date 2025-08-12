import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await connectToDatabase();

  const act = await PairActivity.findByIdAndUpdate(id, { $set: { status:'cancelled' } }, { new:true });
  if (!act) return NextResponse.json({ error:'not found' }, { status:404 });
  return NextResponse.json({ ok:true });
}
