// src/app/api/pairs/[id]/activities/route.ts
import { NextRequest } from 'next/server';
import { PairActivity } from '@/models/PairActivity';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { toPairActivityDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

type Bucket = 'current' | 'suggested' | 'history';

function buildQuery(pairId: string, s?: string) {
  const q: Record<string, unknown> = { pairId: new Types.ObjectId(pairId) };

  if (!s) return { q, limit: 50 };

  const bucket = s as Bucket;
  if (bucket === 'suggested') {
    q.status = 'offered';
    return { q, limit: 50 };
  }
  if (bucket === 'current') {
    q.status = { $in: ['accepted', 'in_progress', 'awaiting_checkin'] };
    return { q, limit: 1 }; // текущая — одна
  }
  if (bucket === 'history') {
    q.status = {
      $in: [
        'completed_success',
        'completed_partial',
        'failed',
        'cancelled',
        'expired',
      ],
    };
    return { q, limit: 50 };
  }

  // если прилетел реальный статус — тоже поддержим
  q.status = s;
  return { q, limit: 50 };
}

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
  const auth = requireSession(req);
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

  const { q, limit } = buildQuery(String(pairGuard.data.pair._id), s);
  const list = await PairActivity.find(q)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // фронт ожидает массив
  return jsonOk(
    list.map((activity) => toPairActivityDTO(activity, { includeLegacyId: true, includeAnswers: false }))
  );
}
