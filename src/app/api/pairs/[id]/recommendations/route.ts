import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { asError, toDomainError } from '@/domain/errors';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import {
  assertEntitlement,
  assertQuota,
  resolveEntitlements,
} from '@/lib/entitlements';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('offer') }).strict(),
  z.object({ action: z.literal('accept'), decisionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('skip'), decisionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('replace'), decisionId: z.string().min(1) }).strict(),
]);

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  try {
    const response = jsonOk(
      await recommendationDecisionService.getOverview({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
      })
    );
    response.headers.set('Cache-Control', 'no-store');
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
  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  const route = `/api/pairs/${params.data.id}/recommendations`;
  const auditRequest = auditContextFromRequest(req, route);

  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: body.data,
    execute: async () => {
      if (body.data.action === 'offer' || body.data.action === 'replace') {
        const snapshot = await resolveEntitlements({
          currentUserId: auth.data.userId,
          pairId: params.data.id,
        });
        await assertEntitlement({
          req,
          route,
          snapshot,
          key: 'activities.suggestions',
        });
        await assertQuota({
          req,
          route,
          snapshot,
          key: 'activities.suggestions.per_day',
        });
      }

      const input = {
        pairId: params.data.id,
        currentUserId: auth.data.userId,
        auditRequest,
      };
      if (body.data.action === 'offer') {
        return recommendationWorkflowService.offer(input);
      }
      if (body.data.action === 'accept') {
        return recommendationWorkflowService.accept({
          ...input,
          decisionId: body.data.decisionId,
        });
      }
      if (body.data.action === 'replace') {
        return recommendationWorkflowService.replace({
          ...input,
          decisionId: body.data.decisionId,
        });
      }
      return recommendationWorkflowService.skip({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
        decisionId: body.data.decisionId,
      });
    },
  });
}
