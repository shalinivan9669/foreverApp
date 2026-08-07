import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { asError, toDomainError } from '@/domain/errors';
import {
  getOwnerSafetyGate,
  setOwnerSafetyGate,
} from '@/domain/services/safetyGate.service';

const querySchema = z.object({ pairId: z.string().min(1) }).strict();
const bodySchema = z
  .object({ pairId: z.string().min(1), enabled: z.boolean() })
  .strict();

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  try {
    return jsonOk(
      await getOwnerSafetyGate({
        pairId: query.data.pairId,
        ownerUserId: auth.data.userId,
      })
    );
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

export async function PUT(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.pairsCreate,
    userId: auth.data.userId,
    routeForAudit: '/api/users/me/safety-gate',
  });
  if (!rate.ok) return rate.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    return jsonOk(
      await setOwnerSafetyGate({
        pairId: body.data.pairId,
        ownerUserId: auth.data.userId,
        enabled: body.data.enabled,
        auditRequest: auditContextFromRequest(req, '/api/users/me/safety-gate'),
      })
    );
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
