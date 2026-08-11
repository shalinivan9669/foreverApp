import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asError, toDomainError } from '@/domain/errors';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { requireSession } from '@/lib/auth/guards';

const emptyBodySchema = z.object({}).strict();

const toErrorResponse = (error: Error): Response => {
  const domainError = toDomainError(error);
  return jsonError(
    domainError.status,
    domainError.code,
    domainError.message,
    domainError.details
  );
};

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.privacyDeletionStatus,
    userId: auth.data.userId,
  });
  if (!rate.ok) return rate.response;

  try {
    return jsonOk({
      request: await privacyRequestService.getCurrent(auth.data.userId),
    });
  } catch (error) {
    return toErrorResponse(asError(error));
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.privacyDeletionMutation,
    userId: auth.data.userId,
  });
  if (!rate.ok) return rate.response;

  const body = await parseJson(req, emptyBodySchema);
  if (!body.ok) return body.response;

  try {
    return jsonOk({
      request: await privacyRequestService.requestDeletion({
        ownerUserId: auth.data.userId,
        auditRequest: auditContextFromRequest(
          req,
          '/api/privacy/deletion-request'
        ),
      }),
    });
  } catch (error) {
    return toErrorResponse(asError(error));
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.privacyDeletionMutation,
    userId: auth.data.userId,
  });
  if (!rate.ok) return rate.response;

  try {
    const request = await privacyRequestService.cancelDeletion({
      ownerUserId: auth.data.userId,
      auditRequest: auditContextFromRequest(
        req,
        '/api/privacy/deletion-request'
      ),
    });
    return jsonOk({ request, cancelled: request !== null });
  } catch (error) {
    return toErrorResponse(asError(error));
  }
}
