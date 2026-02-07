import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successScore } from '@/utils/activities';
import { requireSession } from '@/lib/auth/guards';
import { requireActivityMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z.object({
  answers: z
    .array(
      z.object({
        checkInId: z.string().min(1),
        ui: z.number(),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const { answers } = body.data;

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

  return jsonOk({ success: sc });
}
