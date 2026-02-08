// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';
import { activityOfferService } from '@/domain/services/activityOffer.service';
import { asError, toDomainError } from '@/domain/errors';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
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
    `/api/pairs/${params.data.id}/activities/suggest`
  );

  try {
    const snapshot = await resolveEntitlements({
      currentUserId: auth.data.userId,
      pairId: params.data.id,
    });
    await assertEntitlement({
      req,
      route: `/api/pairs/${params.data.id}/activities/suggest`,
      snapshot,
      key: 'activities.suggestions',
    });
    await assertQuota({
      req,
      route: `/api/pairs/${params.data.id}/activities/suggest`,
      snapshot,
      key: 'activities.suggestions.per_day',
    });

    const data = await activityOfferService.suggestActivities({
      pairId: params.data.id,
      currentUserId: auth.data.userId,
      dedupeAgainstLastOffered: true,
      source: 'pairs.activities.suggest',
      auditRequest,
    });
    return jsonOk(data);
  } catch (error: unknown) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}
