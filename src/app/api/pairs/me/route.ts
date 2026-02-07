import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { requireSession } from '@/lib/auth/guards';

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();

  // 1) активная или на паузе — приоритетно
  let pair = await Pair.findOne({
    members: userId,
    status: { $in: ['active', 'paused'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  // 2) fallback — любая последняя (для истории)
  if (!pair) {
    pair = await Pair.findOne({ members: userId }).sort({ createdAt: -1 }).lean();
  }

  // ✅ не ломаем формат, но добавляем явные флаги
  const status = pair?.status ?? null;
  const hasActive = status === 'active';
  const hasAny = !!pair;

  return NextResponse.json({
    pair: pair ?? null,
    hasActive,
    hasAny,
    status, // 'active' | 'paused' | 'ended' | null
  });
}
