// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requireActivePairForMember } from '@/lib/auth/resourceGuards';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import {
  assertRecommendationOfferAccess,
  buildRecommendationQuotaClaimKey,
} from '@/lib/entitlements';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';

const emptySchema = z.object({}).strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, emptySchema);
  if (!query.ok) return query.response;
  const pairGuard = await requireActivePairForMember(auth.data.userId);
  if (!pairGuard.ok) return pairGuard.response;
  const route = '/api/activities/next';
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.recommendationMutations,
    userId: auth.data.userId,
    routeForAudit: route,
  });
  if (!rate.ok) return rate.response;
  const body = await parseJson(req, emptySchema);
  if (!body.ok) return body.response;
  const pairId = String(pairGuard.data.pair._id);
  const auditRequest = auditContextFromRequest(req, route);

  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: body.data,
    execute: async () => {
      const current = await recommendationDecisionService.getCurrent({
        pairId,
        currentUserId: auth.data.userId,
      });
      if (!current) {
        const context =
          await recommendationDecisionService.requireCurrentPublishableSummary({
            pairId,
            currentUserId: auth.data.userId,
          });
        await assertRecommendationOfferAccess({
          req,
          route,
          pairId,
          currentUserId: auth.data.userId,
          quotaClaimKey: buildRecommendationQuotaClaimKey({
            pairId,
            cycleKey: context.cycleKey,
            kind: 'primary',
          }),
        });
      }
      return recommendationWorkflowService.nextCompatibility({
        pairId,
        currentUserId: auth.data.userId,
        auditRequest,
      });
    },
  });
}
