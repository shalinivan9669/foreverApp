import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  weeklyCycleKeyForDate,
  weeklyCycleService,
} from '@/domain/services/weeklyCycle.service';
import { asError, toDomainError } from '@/domain/errors';
import { jsonError, jsonOk } from '@/lib/api/response';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { parseJson, parseParams } from '@/lib/api/validate';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});
const bodySchema = z.object({}).strict();

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  const pairGuard = await requirePairMember(params.data.id, auth.data.userId);
  if (!pairGuard.ok) return pairGuard.response;

  try {
    const response = jsonOk(
      await weeklyCycleService.current({
        pair: pairGuard.data.pair,
        currentUserId: auth.data.userId,
      })
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: auth.data.userId,
    routeForAudit: `/api/pairs/${params.data.id}/weekly-cycle/current`,
  });
  if (!rate.ok) return rate.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const pairGuard = await requirePairMember(params.data.id, auth.data.userId);
  if (!pairGuard.ok) return pairGuard.response;
  const now = new Date();
  const cycleKey = weeklyCycleKeyForDate(now);

  const response = await withIdempotency({
    req,
    route: `/api/pairs/${params.data.id}/weekly-cycle/current`,
    userId: auth.data.userId,
    requestBody: { cycleKey },
    execute: () =>
      weeklyCycleService.skipCurrent({
        pair: pairGuard.data.pair,
        currentUserId: auth.data.userId,
        now,
      }),
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
