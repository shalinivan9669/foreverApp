// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { pairsService } from '@/domain/services/pairs.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;
  const auditRequest = auditContextFromRequest(req, `/api/pairs/${id}/resume`);

  return withIdempotency({
    req,
    route: `/api/pairs/${id}/resume`,
    userId: currentUserId,
    requestBody: { pairId: id },
    execute: () =>
      pairsService.resumePair({
        pairId: id,
        currentUserId,
        auditRequest,
      }),
  });
}
