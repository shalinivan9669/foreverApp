// DTO rule: return only DTO/view model (never raw DB model shape).
// src/app/api/pairs/[id]/resume/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Pair } from '@/models/Pair';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string }> }

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

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;

  const doc = await Pair.findByIdAndUpdate(
    pairGuard.data.pair._id,
    { $set: { status: 'paused' } },
    { new: true }
  );
  if (!doc) return jsonError(404, 'PAIR_NOT_FOUND', 'not found');
  return jsonOk({});
}

