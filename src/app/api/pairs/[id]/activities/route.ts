import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { Types } from 'mongoose';

interface Ctx { params: Promise<{ id: string }> }

type SGroup = 'current' | 'suggested' | 'history' | 'all';

const GROUPS: Record<Exclude<SGroup,'all'>, PairActivityType['status'][]> = {
  current: ['accepted','in_progress','awaiting_checkin'],
  suggested: ['offered'],
  history: ['completed_success','completed_partial','failed','cancelled','expired'],
};

// GET /api/pairs/:id/activities?s=current|suggested|history|all&limit=20
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const s = (url.searchParams.get('s') ?? 'current') as SGroup;
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? '20')));

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }

  await connectToDatabase();

  const q: Record<string, unknown> = { pairId: new Types.ObjectId(id) };
  if (s !== 'all') q.status = { $in: GROUPS[s] };

  const items = await PairActivity.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  return NextResponse.json({ items });
}
