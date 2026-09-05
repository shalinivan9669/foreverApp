import { NextRequest } from 'next/server';
import { pairInviteAcceptSchema } from '../schemas';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import {
  hashPairInviteToken,
  pairInviteService,
} from '@/domain/services/pairInvite.service';

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.pairsCreate,
    userId: auth.data.userId,
    routeForAudit: '/api/pair-invites/accept',
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, pairInviteAcceptSchema);
  if (!body.ok) return body.response;
  const route = '/api/pair-invites/accept';

  const response = await withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: { lookupHash: hashPairInviteToken('token' in body.data ? body.data.token : body.data.partnerCode), confirmation: body.data.confirmation },
    execute: () =>
      pairInviteService.accept({
        currentUserId: auth.data.userId,
        ...('token' in body.data ? { token: body.data.token } : { partnerCode: body.data.partnerCode }),
        auditRequest: auditContextFromRequest(req, route),
      }),
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
