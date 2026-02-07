// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { applyEffects, successScore, clamp } from '@/utils/activities';
import { requireSession } from '@/lib/auth/guards';
import { requireActivityMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const activityGuard = await requireActivityMember(id, currentUserId);
  if (!activityGuard.ok) return activityGuard.response;

  const act = activityGuard.data.activity;
  const pair = activityGuard.data.pair;

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
  return jsonOk({ success: clamp(sc), status });
}

