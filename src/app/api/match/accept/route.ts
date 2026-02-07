import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { jsonForbidden } from '@/lib/auth/errors';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';

type Body = { likeId: string; userId?: string }; // userId legacy field is ignored

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const { likeId } = (await req.json()) as Body;
  if (!likeId) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  const likeGuard = await requireLikeParticipant(likeId, currentUserId);
  if (!likeGuard.ok) return likeGuard.response;

  const { like, role } = likeGuard.data;
  if (role !== 'from') return jsonForbidden('AUTH_FORBIDDEN', 'forbidden');

  if (like.status !== 'awaiting_initiator')
    return NextResponse.json({ error: `invalid status ${like.status}` }, { status: 400 });

  const now = new Date();
  like.initiatorDecision = { accepted: true, at: now };
  like.status = 'mutual_ready';
  like.updatedAt = now;
  await like.save();

  return NextResponse.json({ ok: true });
}
