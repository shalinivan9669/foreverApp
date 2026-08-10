import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { jsonError, jsonOk } from '@/lib/api/response';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { asError, toDomainError } from '@/domain/errors';

const bodySchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites/resolve',
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const response = jsonOk(
      await pairInviteService.resolve({
        currentUserId: auth.data.userId,
        token: body.data.token,
      })
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
