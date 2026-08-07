import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asError, isDomainError } from '@/domain/errors';
import {
  PAIR_HISTORY_MAX_LIMIT,
  pairHistoryService,
} from '@/domain/services/pairHistory.service';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const querySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAIR_HISTORY_MAX_LIMIT).optional(),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  const pairGuard = await requirePairMember(params.data.id, auth.data.userId);
  if (!pairGuard.ok) return pairGuard.response;

  try {
    const page = await pairHistoryService.list({
      pair: pairGuard.data.pair,
      role: pairGuard.data.by,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });
    const response = jsonOk(page);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const normalized = asError(error);
    if (isDomainError(normalized)) {
      return jsonError(
        normalized.status,
        normalized.code,
        normalized.message,
        normalized.details
      );
    }
    return jsonError(500, 'INTERNAL', 'Internal error');
  }
}
