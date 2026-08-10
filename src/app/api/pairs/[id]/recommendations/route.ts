import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { asError, toDomainError } from '@/domain/errors';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { recommendationBodySchema, recommendationParamsSchema } from './request';
import { executeRecommendationMutation } from './mutation';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await ctx.params, recommendationParamsSchema);
  if (!params.ok) return params.response;

  try {
    const response = jsonOk(
      await recommendationDecisionService.getOverview({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
      })
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await ctx.params, recommendationParamsSchema);
  if (!params.ok) return params.response;
  const pairGuard = await requirePairMember(params.data.id, auth.data.userId);
  if (!pairGuard.ok) {
    return jsonError(
      404,
      'RECOMMENDATION_UNAVAILABLE',
      'Recommendation is unavailable'
    );
  }
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.recommendationMutations,
    userId: auth.data.userId,
    routeForAudit: `/api/pairs/${params.data.id}/recommendations`,
  });
  if (!rate.ok) return rate.response;
  const body = await parseJson(req, recommendationBodySchema);
  if (!body.ok) return body.response;

  const route = `/api/pairs/${params.data.id}/recommendations`;
  const auditRequest = auditContextFromRequest(req, route);

  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: body.data,
    execute: () =>
      executeRecommendationMutation({
        req,
        route,
        pairId: params.data.id,
        currentUserId: auth.data.userId,
        body: body.data,
        auditRequest,
      }),
  });
}
