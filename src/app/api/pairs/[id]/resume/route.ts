// src/app/api/pairs/[id]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pair } from '@/models/Pair';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const { id } = await ctx.params;
  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;

  const doc = await Pair.findByIdAndUpdate(
    pairGuard.data.pair._id,
    { $set: { status: 'active' } },
    { new: true }
  );
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
