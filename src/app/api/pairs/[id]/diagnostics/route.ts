// DTO rule: return only DTO/view model (never raw DB model shape).
// GET /api/pairs/[id]/diagnostics
import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { z } from 'zod';
import { jsonError } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';

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
  if (!pairGuard.ok) return pairGuard.response;

  const response = jsonError(
    410,
    'PAIR_DIAGNOSTICS_RETIRED',
    'Use the privacy-safe pair summary'
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}


