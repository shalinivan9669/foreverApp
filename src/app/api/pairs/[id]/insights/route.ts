// DTO rule: return only DTO/view model (never raw DB model shape).
// GET /api/pairs/[id]/insights
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { asError, toDomainError } from '@/domain/errors';
import { listPairInsights } from '@/domain/services/insightRules.service';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  try {
    const insights = await listPairInsights(params.data.id, auth.data.userId);
    return jsonOk({
      pairId: params.data.id,
      insights,
    });
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
