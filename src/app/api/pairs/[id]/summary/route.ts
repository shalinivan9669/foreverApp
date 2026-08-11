// src/app/api/pairs/[id]/summary/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { buildPairDashboardSummary } from '@/domain/services/pairDashboardSummary.service';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';

// DTO rule: return only DTO/view model (never raw DB model shape).

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;

  const summary = await buildPairDashboardSummary({
    pair: pairGuard.data.pair,
    currentUserId,
  });
  recordProductAnalyticsEvent({
    name: 'pair_summary_viewed',
    technicalScope: 'pair_summary',
  });
  return jsonOk(summary);
}
