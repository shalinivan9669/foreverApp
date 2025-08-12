import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { Types } from 'mongoose';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await connectToDatabase();
  const { searchParams } = new URL(req.url);
  const s = searchParams.get('s') || undefined;
  const lim = Number(searchParams.get('limit') ?? 20);
  const q: Record<string, unknown> = { pairId: new Types.ObjectId(id) };
  if (s) q.status = s;

  const list = await PairActivity.find(q).sort({ createdAt: -1 }).limit(lim).lean();
  return NextResponse.json(list);
}
