import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { asError, toDomainError } from '@/domain/errors';
import {
  buildPairWeeklyCheckInSummary,
  toPairWeeklyCheckInPairDTO,
} from '@/domain/services/weeklyCheckIn.service';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const querySchema = z
  .object({
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
  })
  .strict();

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
    const summary = await buildPairWeeklyCheckInSummary({
      pair: pairGuard.data.pair,
      currentUserId: auth.data.userId,
      weekKey: query.data.weekKey,
    });
    return jsonOk(toPairWeeklyCheckInPairDTO(summary));
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
