// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { personalDailyCheckInService } from '@/domain/services/personalDailyCheckIn.service';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import {
  dailyCheckInBodySchema,
  dailyCheckInIdempotencyPayload,
} from './request';

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const body = await parseJson(req, dailyCheckInBodySchema);
  if (!body.ok) return body.response;

  return withIdempotency({
    req,
    route: '/api/users/me/daily-checkins',
    userId: auth.data.userId,
    requestBody: dailyCheckInIdempotencyPayload(body.data),
    execute: () =>
      personalDailyCheckInService.submit({
        currentUserId: auth.data.userId,
        dateKey: body.data.dateKey,
        timezoneOffsetMin: body.data.timezoneOffsetMin,
        answers: body.data.answers,
        context: body.data.context,
        privateJournal: body.data.privateJournal,
        share: body.data.share,
      }),
  });
}
