// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { pairsService } from '@/domain/services/pairs.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';

type Body = {
  userId?: string;
  partnerId?: string;
  likeId?: string;
};

const bodySchema = z
  .object({
    userId: z.string().optional(),
    partnerId: z.string().optional(),
    likeId: z.string().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.pairsCreate,
    userId: currentUserId,
    routeForAudit: '/api/pairs/create',
  });
  if (!rate.ok) return rate.response;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Body;
  const auditRequest = auditContextFromRequest(req, '/api/pairs/create');

  return withIdempotency({
    req,
    route: '/api/pairs/create',
    userId: currentUserId,
    requestBody: {
      partnerId: body.partnerId ?? null,
      likeId: body.likeId ?? null,
    },
    execute: () =>
      pairsService.createPair({
        currentUserId,
        partnerId: body.partnerId,
        likeId: body.likeId,
        auditRequest,
      }),
  });
}
