// DTO rule: return only DTO/view model (never raw DB model shape).
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { activitiesService } from '@/domain/services/activities.service';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: Request, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  return withIdempotency({
    req,
    route: `/api/activities/${id}/cancel`,
    userId: currentUserId,
    requestBody: { id },
    execute: () =>
      activitiesService.cancelActivity({
        activityId: id,
        currentUserId,
      }),
  });
}