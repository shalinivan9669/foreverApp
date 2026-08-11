import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { pairInviteService } from '@/domain/services/pairInvite.service';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
});
const bodySchema = z.object({}).strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites/[id]/cancel',
  });
  if (!rate.ok) return rate.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  const response = await withIdempotency({
    req,
    route: '/api/pair-invites/[id]/cancel',
    userId: auth.data.userId,
    requestBody: { inviteId: params.data.id },
    execute: () =>
      pairInviteService.cancel({
        currentUserId: auth.data.userId,
        inviteId: params.data.id,
      }),
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
