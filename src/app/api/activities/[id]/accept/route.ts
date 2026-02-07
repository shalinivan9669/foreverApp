// DTO rule: return only DTO/view model (never raw DB model shape).
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requireActivityMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: Request, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const activityGuard = await requireActivityMember(id, currentUserId);
  if (!activityGuard.ok) return activityGuard.response;

  const doc = activityGuard.data.activity;

  doc.status = 'accepted';
  doc.acceptedAt = new Date();
  await doc.save();
  return jsonOk({});
}

