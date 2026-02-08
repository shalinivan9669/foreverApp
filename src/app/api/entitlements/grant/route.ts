// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { jsonError, jsonOk } from '@/lib/api/response';
import { connectToDatabase } from '@/lib/mongodb';
import { Subscription } from '@/models/Subscription';
import { emitEvent, auditContextFromRequest } from '@/lib/audit/emitEvent';
import { PLAN_VALUES, SUBSCRIPTION_STATUS_VALUES } from '@/lib/entitlements/types';

const ADMIN_HEADER = 'x-entitlements-admin-key';

const bodySchema = z
  .object({
    userId: z.string().min(1),
    plan: z.enum(PLAN_VALUES),
    days: z.number().int().positive().max(3650).optional(),
    status: z.enum(SUBSCRIPTION_STATUS_VALUES).optional(),
  })
  .strict();

const canGrant = (req: NextRequest): boolean => {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const configuredKey = process.env.ENTITLEMENTS_ADMIN_KEY;
  if (!configuredKey) {
    return false;
  }

  return req.headers.get(ADMIN_HEADER) === configuredKey;
};

export async function POST(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  if (!canGrant(req)) {
    return jsonError(403, 'ACCESS_DENIED', 'entitlements grant is disabled');
  }

  const parsedBody = await parseJson(req, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const now = new Date();
  const periodEnd = body.days
    ? new Date(now.getTime() + body.days * 24 * 60 * 60 * 1000)
    : undefined;
  const status = body.status ?? 'active';

  await connectToDatabase();

  const subscription = await Subscription.create({
    userId: body.userId,
    plan: body.plan,
    status,
    periodEnd,
    meta: {
      source: 'dev_endpoint',
      grantedAt: now.toISOString(),
    },
  });

  const request = auditContextFromRequest(req, '/api/entitlements/grant');
  await emitEvent({
    event: 'ENTITLEMENT_GRANTED',
    actor: { userId: body.userId },
    request,
    target: {
      type: 'user',
      id: body.userId,
    },
    metadata: {
      userId: body.userId,
      plan: body.plan,
      status,
      periodEnd: periodEnd?.toISOString() ?? null,
      source: 'dev_endpoint',
    },
  });

  return jsonOk({
    id: String(subscription._id),
    userId: subscription.userId,
    plan: subscription.plan,
    status: subscription.status,
    periodEnd: subscription.periodEnd?.toISOString(),
    createdAt: subscription.createdAt?.toISOString(),
  });
}
