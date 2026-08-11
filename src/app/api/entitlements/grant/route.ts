// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { jsonError, jsonOk } from '@/lib/api/response';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import {
  PLAN_VALUES,
  SUBSCRIPTION_STATUS_VALUES,
} from '@/lib/entitlements/types';
import { entitlementGrantService } from '@/domain/services/entitlementGrant.service';
import { asError, toDomainError } from '@/domain/errors';

const ADMIN_HEADER = 'x-entitlements-admin-key';

const bodySchema = z
  .object({
    userId: z.string().min(1),
    plan: z.enum(PLAN_VALUES),
    days: z.number().int().positive().max(3650).optional(),
    status: z.enum(SUBSCRIPTION_STATUS_VALUES).optional(),
  })
  .strict();

const safeCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const canGrant = (req: NextRequest): boolean => {
  const configuredKey = process.env.ENTITLEMENTS_ADMIN_KEY?.trim();
  if (!configuredKey) return false;

  const providedKey = req.headers.get(ADMIN_HEADER)?.trim() ?? '';
  return safeCompare(providedKey, configuredKey);
};

export async function POST(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  if (!canGrant(req)) {
    return jsonError(403, 'ACCESS_DENIED', 'entitlements grant is disabled');
  }

  const parsedBody = await parseJson(req, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    return jsonOk(
      await entitlementGrantService.grant({
        ...parsedBody.data,
        auditRequest: auditContextFromRequest(req, '/api/entitlements/grant'),
      }),
    );
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details,
    );
  }
}
