import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { asError, isDomainError } from '@/domain/errors';
import { pairEventService } from '@/domain/services/pairEvent.service';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const querySchema = z.object({
  include: z.enum(['active', 'all']).optional(),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  try {
    const events = await pairEventService.refreshPairEvents({
      pairId: params.data.id,
      currentUserId: auth.data.userId,
      include: query.data.include ?? 'active',
    });
    return jsonOk({ events });
  } catch (error: unknown) {
    const normalized = asError(error);
    if (isDomainError(normalized)) {
      return jsonError(normalized.status, normalized.code, normalized.message, normalized.details);
    }
    return jsonError(500, 'INTERNAL', 'Internal server error');
  }
}
