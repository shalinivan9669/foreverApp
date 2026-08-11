import { NextRequest } from 'next/server';
import { asError, toDomainError } from '@/domain/errors';
import { privacyExportService } from '@/domain/services/privacyExport.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { jsonError, jsonOk } from '@/lib/api/response';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { requireSession } from '@/lib/auth/guards';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.privacyExport,
    userId: auth.data.userId,
  });
  if (!rate.ok) return rate.response;

  try {
    return jsonOk(
      await privacyExportService.buildOwnerExport({
        ownerUserId: auth.data.userId,
        auditRequest: auditContextFromRequest(req, '/api/privacy/export'),
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
