import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseParams } from '@/lib/api/validate';
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

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites/[id]',
  });
  if (!rate.ok) return rate.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  try {
    const response = jsonOk(
      await pairInviteService.ownerStatus({
        currentUserId: auth.data.userId,
        inviteId: params.data.id,
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
