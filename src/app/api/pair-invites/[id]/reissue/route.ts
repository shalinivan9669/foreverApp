import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { jsonError, jsonOk } from '@/lib/api/response';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { asError, toDomainError } from '@/domain/errors';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
});
const bodySchema = z.object({}).strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.pairsCreate,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites/[id]/reissue',
  });
  if (!rate.ok) return rate.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  // Replaying this response through idempotency storage would persist the raw one-time token.
  try {
    const response = jsonOk(
      await pairInviteService.reissue({
        currentUserId: auth.data.userId,
        inviteId: params.data.id,
      })
    );
    response.headers.set('Cache-Control', 'no-store');
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
