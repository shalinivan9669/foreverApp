import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { successScore } from '@/utils/activities';
import { requireSession } from '@/lib/auth/guards';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const { by, answers } = (await req.json()) as { by:'A'|'B'; answers:{checkInId:string; ui:number}[] };
  if (!by || !answers?.length) return NextResponse.json({ error:'bad body' }, { status:400 });

  await connectToDatabase();
  const act = await PairActivity.findById(id);
  if (!act) return NextResponse.json({ error:'not found' }, { status:404 });

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
