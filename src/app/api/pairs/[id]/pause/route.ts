// src/app/api/pairs/[id]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { requireSession } from '@/lib/auth/guards';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  await connectToDatabase();
  const doc = await Pair.findByIdAndUpdate(id, { $set: { status: 'paused' } }, { new: true });
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
