import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { pairInviteService } from '@/domain/services/pairInvite.service';

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
    policy: RATE_LIMIT_POLICIES.pairsCreate,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites/accept',
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const route = '/api/pair-invites/accept';

  const response = await withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: { token: body.data.token },
    execute: () =>
      pairInviteService.accept({
        currentUserId: auth.data.userId,
        token: body.data.token,
        auditRequest: auditContextFromRequest(req, route),
      }),
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
