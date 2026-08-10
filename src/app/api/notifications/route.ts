import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asError, toDomainError } from '@/domain/errors';
import { notificationService } from '@/domain/services/notification.service';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/guards';

const querySchema = z
  .object({
    cursor: z.string().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  try {
    return jsonOk(
      await notificationService.list({
        currentUserId: auth.data.userId,
        cursor: query.data.cursor,
        limit: query.data.limit,
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

