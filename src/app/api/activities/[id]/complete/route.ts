import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { Pair } from '@/models/Pair';
import { applyEffects, successScore, clamp } from '@/utils/activities';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await connectToDatabase();

  const act = await PairActivity.findById(id);
  if (!act) return NextResponse.json({ error:'not found' }, { status:404 });

  const pair = await Pair.findById(act.pairId);
  if (!pair) return NextResponse.json({ error:'pair not found' }, { status:404 });

  const sc = successScore(act.checkIns, act.answers || []);
  act.successScore = sc;

  let status:'completed_success'|'completed_partial'|'failed' = 'completed_partial';
  if (sc >= 0.7) status = 'completed_success';
  else if (sc < 0.35) status = 'failed';
  act.status = status;

  await applyEffects({
    pairDoc: pair,
    members: act.members,
    effect: act.effect || [],
    success: sc,
    fatigueDelta: act.fatigueDeltaOnComplete ?? 0,
    readinessDelta: act.readinessDeltaOnComplete ?? 0,
  });

  await act.save();
  return NextResponse.json({ ok:true, success: clamp(sc), status });
}
