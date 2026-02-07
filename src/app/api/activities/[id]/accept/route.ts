import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { requireActivityMember } from '@/lib/auth/resourceGuards';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const { id } = await ctx.params;
  const activityGuard = await requireActivityMember(id, currentUserId);
  if (!activityGuard.ok) return activityGuard.response;

  const doc = activityGuard.data.activity;

  doc.status = 'accepted';
  doc.acceptedAt = new Date();
  await doc.save();
  return NextResponse.json({ ok:true });
}
