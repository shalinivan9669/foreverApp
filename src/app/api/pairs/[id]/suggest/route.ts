// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseParams } from '@/lib/api/validate';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import {
  assertEntitlement,
  assertQuota,
  resolveEntitlements,
} from '@/lib/entitlements';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const auditRequest = auditContextFromRequest(
    req,
    `/api/pairs/${params.data.id}/suggest`
  );

  return withIdempotency({
    req,
    route: `/api/pairs/${params.data.id}/suggest`,
    userId: auth.data.userId,
    requestBody: {},
    execute: async () => {
      const snapshot = await resolveEntitlements({
        currentUserId: auth.data.userId,
        pairId: params.data.id,
      });
      await assertEntitlement({
        req,
        route: `/api/pairs/${params.data.id}/suggest`,
        snapshot,
        key: 'activities.suggestions',
      });
      await assertQuota({
        req,
        route: `/api/pairs/${params.data.id}/suggest`,
        snapshot,
        key: 'activities.suggestions.per_day',
      });

      return recommendationWorkflowService.suggestCompatibility({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
        auditRequest,
      });
    },
  });
}
