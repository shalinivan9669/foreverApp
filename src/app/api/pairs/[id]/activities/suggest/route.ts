// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import {
  assertRecommendationOfferAccess,
  buildRecommendationQuotaClaimKey,
} from '@/lib/entitlements';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});
const bodySchema = z.object({}).strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
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
  const route = `/api/pairs/${params.data.id}/activities/suggest`;
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.recommendationMutations,
    userId: auth.data.userId,
    routeForAudit: route,
  });
  if (!rate.ok) return rate.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const auditRequest = auditContextFromRequest(
    req,
    route
  );

  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: body.data,
    execute: async () => {
      const current = await recommendationDecisionService.getCurrent({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
      });
      if (!current) {
        const context =
          await recommendationDecisionService.requireCurrentPublishableSummary({
            pairId: params.data.id,
            currentUserId: auth.data.userId,
          });
        await assertRecommendationOfferAccess({
          req,
          route,
          pairId: params.data.id,
          currentUserId: auth.data.userId,
          quotaClaimKey: buildRecommendationQuotaClaimKey({
            pairId: params.data.id,
            cycleKey: context.cycleKey,
            kind: 'primary',
          }),
        });
      }
      return recommendationWorkflowService.offersCompatibility({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
        auditRequest,
      });
    },
  });
}
