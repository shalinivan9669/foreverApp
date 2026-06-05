// src/app/api/pairs/[id]/summary/route.ts
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Pair } from '@/models/Pair';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { buildPairDashboardSummary } from '@/domain/services/pairDashboardSummary.service';

// DTO rule: return only DTO/view model (never raw DB model shape).

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) {
    let foundPairId: string | null = null;
    let membershipOk = false;

    if (Types.ObjectId.isValid(id)) {
      const pairDoc = await Pair.findById(id)
        .select({ _id: 1, members: 1 })
        .lean<{ _id: Types.ObjectId; members: string[] } | null>();

      if (pairDoc) {
        foundPairId = String(pairDoc._id);
        membershipOk = pairDoc.members.includes(currentUserId);
      }
    }

    console.warn('[pairs.summary] pair access check failed', {
      userId: currentUserId,
      requestedPairId: id,
      foundPairId,
      membershipOk,
    });
    return pairGuard.response;
  }

  return jsonOk(
    await buildPairDashboardSummary({
      pair: pairGuard.data.pair,
      currentUserId,
    })
  );
}
