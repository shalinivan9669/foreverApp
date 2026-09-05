import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pairInviteConfirmationSchema } from '../../schemas';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Context { params: Promise<{ id: string }> }
const paramsSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) }).strict();

export async function POST(req: NextRequest, context: Context) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rate = await enforceRateLimit({ req, policy: RATE_LIMIT_POLICIES.pairsCreate, userId: auth.data.userId, routeForAudit: '/api/pair-invites/[id]/confirm' });
  if (!rate.ok) return rate.response;
  const params = parseParams(await context.params, paramsSchema);
  if (!params.ok) return params.response;
  const body = await parseJson(req, pairInviteConfirmationSchema);
  if (!body.ok) return body.response;
  return withIdempotency({
    req,
    route: '/api/pair-invites/[id]/confirm',
    userId: auth.data.userId,
    requestBody: { inviteId: params.data.id, ...body.data },
    execute: () => pairInviteService.confirm({ currentUserId: auth.data.userId, inviteId: params.data.id, partnerPublicId: body.data.partnerPublicId, auditRequest: auditContextFromRequest(req, '/api/pair-invites/[id]/confirm') }),
  });
}
