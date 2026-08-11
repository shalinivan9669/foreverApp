import { NextRequest } from 'next/server';
import { z } from 'zod';
import { accountDeletionService } from '@/domain/services/accountDeletion.service';
import { asError, toDomainError } from '@/domain/errors';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { requireSession } from '@/lib/auth/guards';

const bodySchema = z.object({ confirmation: z.literal('DELETE_ACCOUNT') }).strict();

export async function POST(req: NextRequest) {
  const auth = await requireSession(req, { accountLease: 'deletion-control' });
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.privacyDeletionMutation,
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const request = await accountDeletionService.execute({
      ownerUserId: auth.data.userId,
      sessionVersion: auth.data.sessionVersion,
      auditRequest: auditContextFromRequest(
        req,
        '/api/privacy/deletion-request/execute'
      ),
    });
    const response = jsonOk({ request, deleted: true });
    response.headers.append(
      'Set-Cookie',
      'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );
    return response;
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
