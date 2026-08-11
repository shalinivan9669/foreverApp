import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asError, toDomainError } from '@/domain/errors';
import { notificationService } from '@/domain/services/notification.service';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/guards';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';

type Context = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) }).strict();

export async function POST(req: NextRequest, context: Context): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await context.params, paramsSchema);
  if (!params.ok) return params.response;
  const route = `/api/notifications/${params.data.id}/read`;
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.notificationMutations,
    userId: auth.data.userId,
    routeForAudit: route,
  });
  if (!rate.ok) return rate.response;

  try {
    return jsonOk(
      await notificationService.markRead({
        currentUserId: auth.data.userId,
        notificationId: params.data.id,
      })
    );
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}
