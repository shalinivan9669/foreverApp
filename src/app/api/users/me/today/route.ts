// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { asError, DomainError, toDomainError } from '@/domain/errors';
import { personalTodayService } from '@/domain/services/personalToday.service';

const querySchema = z
  .object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timezoneOffsetMin: z.coerce.number().optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  try {
    const today = await personalTodayService.build({
      currentUserId: auth.data.userId,
      dateKey: query.data.dateKey,
      timezoneOffsetMin: query.data.timezoneOffsetMin,
    });
    return jsonOk(today);
  } catch (error: unknown) {
    const domainError = error instanceof DomainError ? error : toDomainError(asError(error));
    return jsonError(domainError.status, domainError.code, domainError.message, domainError.details);
  }
}
