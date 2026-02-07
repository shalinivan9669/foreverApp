// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { activitiesService } from '@/domain/services/activities.service';

interface Ctx {
  params: Promise<{ id: string }>;
}

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

  return withIdempotency({
    req,
    route: `/api/activities/${id}/checkin`,
    userId: currentUserId,
    requestBody: {
      id,
      answers,
    },
    execute: () =>
      activitiesService.checkinActivity({
        activityId: id,
        currentUserId,
        answers,
      }),
  });
}