// src/app/api/pairs/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  // сначала активная/пауза
  let pair = await Pair.findOne({
    members: userId,
    status: { $in: ['active', 'paused'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  // на всякий случай fallback — любая последняя пара
  if (!pair) {
    pair = await Pair.findOne({ members: userId }).sort({ createdAt: -1 }).lean();
  }

  return NextResponse.json({ pair: pair ?? null });
}
