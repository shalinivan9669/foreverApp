// src/app/api/pairs/[id]/activities/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { Types } from 'mongoose';
import { requireSession } from '@/lib/auth/guards';

type Bucket = 'current' | 'suggested' | 'history';

function buildQuery(pairId: string, s?: string) {
  const q: Record<string, unknown> = { pairId: new Types.ObjectId(pairId) };

  if (!s) return { q, limit: 50 };

  const bucket = s as Bucket;
  if (bucket === 'suggested') {
    q.status = 'offered';
    return { q, limit: 50 };
  }
  if (bucket === 'current') {
    q.status = { $in: ['accepted', 'in_progress', 'awaiting_checkin'] };
    return { q, limit: 1 }; // текущая — одна
  }
  if (bucket === 'history') {
    q.status = {
      $in: [
        'completed_success',
        'completed_partial',
        'failed',
        'cancelled',
        'expired',
      ],
    };
    return { q, limit: 50 };
  }

  // если прилетел реальный статус — тоже поддержим
  q.status = s;
  return { q, limit: 50 };
}

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const s = searchParams.get('s') || undefined;

  await connectToDatabase();

  const { q, limit } = buildQuery(id, s);
  const list = await PairActivity.find(q)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // фронт ожидает массив
  return NextResponse.json(list);
}
