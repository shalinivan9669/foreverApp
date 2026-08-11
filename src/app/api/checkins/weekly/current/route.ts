// DTO rule: return only DTO/view model (never raw DB model shape).
// GET /api/checkins/weekly/current
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { asError, toDomainError } from '@/domain/errors';
import { weeklyCheckInService } from '@/domain/services/weeklyCheckIn.service';

const querySchema = z
  .object({
    pairId: z.string().optional(),
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  try {
    const checkIn = await weeklyCheckInService.current({
      currentUserId: auth.data.userId,
      pairId: query.data.pairId,
      weekKey: query.data.weekKey,
    });
    return jsonOk({ checkIn });
  } catch (error: unknown) {
    const domainError = toDomainError(asError(error));
    return jsonError(domainError.status, domainError.code, domainError.message, domainError.details);
  }
}
