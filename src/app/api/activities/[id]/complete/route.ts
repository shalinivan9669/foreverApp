// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { activitiesService } from '@/domain/services/activities.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Ctx {
  params: Promise<{ id: string }>;
}

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
  const auditRequest = auditContextFromRequest(req, `/api/activities/${id}/complete`);

  return withIdempotency({
    req,
    route: `/api/activities/${id}/complete`,
    userId: currentUserId,
    requestBody: { id },
    execute: () =>
      activitiesService.completeActivity({
        activityId: id,
        currentUserId,
        auditRequest,
      }),
  });
}
