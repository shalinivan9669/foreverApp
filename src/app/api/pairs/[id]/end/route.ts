import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pairsService } from '@/domain/services/pairs.service';
import { parseJson, parseParams } from '@/lib/api/validate';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { requireSession } from '@/lib/auth/guards';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({ confirmation: z.literal('END_PAIR') }).strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  const route = `/api/pairs/${params.data.id}/end`;
  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: body.data,
    execute: () =>
      pairsService.endPair({
        pairId: params.data.id,
        currentUserId: auth.data.userId,
        auditRequest: auditContextFromRequest(req, route),
      }),
  });
}
