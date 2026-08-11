// src/app/api/pairs/[id]/activities/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { pairActivityReadService } from '@/domain/services/pairActivityRead.service';

// DTO rule: return only DTO/view model (never raw DB model shape).

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

const querySchema = z
  .object({
    s: z.string().optional(),
  })
  .passthrough();

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  const { s } = query.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;

  return jsonOk(
    await pairActivityReadService.list({
      pairId: pairGuard.data.pair._id,
      currentUserId,
      role: pairGuard.data.by,
      ...(s ? { status: s } : {}),
    })
  );
}

