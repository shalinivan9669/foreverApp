// src/app/api/logs/route.ts
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { logsService } from '@/domain/services/logs.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

// DTO rule: return only DTO/view model (never raw DB model shape).

export async function POST(request: Request) {
  const auth = requireSession(request);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const rate = await enforceRateLimit({
    req: request,
    policy: RATE_LIMIT_POLICIES.logs,
    userId,
    routeForAudit: '/api/logs',
  });
  if (!rate.ok) return rate.response;

  const bodyResult = await parseJson(request, z.object({}).passthrough());
  if (!bodyResult.ok) return bodyResult.response;
  const auditRequest = auditContextFromRequest(request, '/api/logs');

  return withIdempotency({
    req: request,
    route: '/api/logs',
    userId,
    requestBody: {},
    execute: () =>
      logsService.recordVisit({
        currentUserId: userId,
        auditRequest,
      }),
  });
}
