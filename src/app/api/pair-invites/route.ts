import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { jsonError, jsonOk } from '@/lib/api/response';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { asError, toDomainError } from '@/domain/errors';

const bodySchema = z.object({}).strict();

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites',
  });
  if (!rate.ok) return rate.response;

  try {
    const response = jsonOk(
      await pairInviteService.ownerCurrent({ currentUserId: auth.data.userId })
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
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

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.pairsCreate,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites',
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  // Replaying this response through idempotency storage would persist the raw one-time token.
  try {
    const response = jsonOk(
      await pairInviteService.create({ currentUserId: auth.data.userId })
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
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
