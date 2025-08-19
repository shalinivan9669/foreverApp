import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { Types } from 'mongoose';

interface Ctx { params: Promise<{ id: string }> }

const GROUPS = {
  current:   ['accepted', 'in_progress', 'awaiting_checkin'] as const,
  suggested: ['offered'] as const,
  history:   ['completed_success', 'completed_partial', 'failed', 'cancelled', 'expired'] as const,
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const s = (searchParams.get('s') || '') as keyof typeof GROUPS;
  const lim = Number(searchParams.get('limit') ?? 20);

  await connectToDatabase();

  const q: Record<string, unknown> = { pairId: new Types.ObjectId(id) };
  if (s && GROUPS[s]) q.status = { $in: GROUPS[s] };

  const list = await PairActivity
    .find(q)
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  // Для вкладки "active/current" возвращаем最多 одну самую свежую
  if (s === 'current') {
    const cur = list.find(d => GROUPS.current.includes(d.status as (typeof GROUPS)['current'][number]));
    return NextResponse.json({ items: cur ? [cur] : [] });
  }

  return NextResponse.json({ items: list });
}
