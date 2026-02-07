import { NextRequest, NextResponse } from 'next/server';
import { successScore } from '@/utils/activities';
import { requireSession } from '@/lib/auth/guards';
import { requireActivityMember } from '@/lib/auth/resourceGuards';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const { id } = await ctx.params;
  const { answers } = (await req.json()) as { answers:{checkInId:string; ui:number}[] };
  if (!answers?.length) return NextResponse.json({ error:'bad body' }, { status:400 });

  const activityGuard = await requireActivityMember(id, currentUserId);
  if (!activityGuard.ok) return activityGuard.response;

  const by = activityGuard.data.by;
  const act = activityGuard.data.activity;

  const now = new Date();
  act.answers = act.answers || [];
  for (const a of answers) act.answers.push({ checkInId:a.checkInId, by, ui:a.ui, at: now });
  act.status = 'awaiting_checkin';
  // если собраны оба набора ответов — посчитаем success предварительно
  const sc = successScore(act.checkIns, act.answers);
  act.successScore = sc;
  await act.save();

  return NextResponse.json({ ok:true, success: sc });
}
