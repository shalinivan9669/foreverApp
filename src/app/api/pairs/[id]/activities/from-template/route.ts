// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z
  .object({
    templateId: z.string().min(1),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const pairGuard = await requirePairMember(params.data.id, auth.data.userId);
  if (!pairGuard.ok) {
    return jsonError(
      404,
      'RECOMMENDATION_UNAVAILABLE',
      'Recommendation is unavailable'
    );
  }
  const route = `/api/pairs/${params.data.id}/activities/from-template`;
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.recommendationMutations,
    userId: auth.data.userId,
    routeForAudit: route,
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: body.data,
    execute: async () =>
      recommendationWorkflowService.fromTemplateCompatibility({
        pairId: params.data.id,
        templateId: body.data.templateId,
        currentUserId: auth.data.userId,
        auditRequest: auditContextFromRequest(req, route),
      }),
  });
}
