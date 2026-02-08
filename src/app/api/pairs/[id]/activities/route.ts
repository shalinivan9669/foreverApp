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
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { relationshipActivityLegacyService } from '@/domain/services/relationshipActivityLegacy.service';

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
    return { q, limit: 1 }; // С‚РµРєСѓС‰Р°СЏ вЂ” РѕРґРЅР°
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

  // РµСЃР»Рё РїСЂРёР»РµС‚РµР» СЂРµР°Р»СЊРЅС‹Р№ СЃС‚Р°С‚СѓСЃ вЂ” С‚РѕР¶Рµ РїРѕРґРґРµСЂР¶РёРј
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
  const auditRequest = auditContextFromRequest(req, `/api/pairs/${id}/activities`);

  const { q, limit } = buildQuery(String(pairGuard.data.pair._id), s);
  const list = await PairActivity.find(q)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const pairActivities = list.map((activity) =>
    toPairActivityDTO(activity, { includeLegacyId: true, includeAnswers: false })
  );

  const legacyActivities = await relationshipActivityLegacyService.listForPair({
    pairId: String(pairGuard.data.pair._id),
    members: pairGuard.data.pair.members,
    currentUserId,
    bucket: s,
    auditRequest,
  });

  const merged = [...pairActivities, ...legacyActivities].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt ?? left.offeredAt ?? '');
    const rightTs = Date.parse(right.createdAt ?? right.offeredAt ?? '');
    return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
  });

  return jsonOk(merged.slice(0, limit));
}

