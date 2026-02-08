// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { activityOfferService } from '@/domain/services/activityOffer.service';
import { asError, toDomainError } from '@/domain/errors';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import {
  assertEntitlement,
  assertQuota,
  resolveEntitlements,
} from '@/lib/entitlements';

export async function POST(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const auditRequest = auditContextFromRequest(req, '/api/activities/next');

  try {
    const snapshot = await resolveEntitlements({ currentUserId: auth.data.userId });
    await assertEntitlement({
      req,
      route: '/api/activities/next',
      snapshot,
      key: 'activities.suggestions',
    });
    await assertQuota({
      req,
      route: '/api/activities/next',
      snapshot,
      key: 'activities.suggestions.per_day',
    });

    const data = await activityOfferService.createNextActivity({
      currentUserId: auth.data.userId,
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
