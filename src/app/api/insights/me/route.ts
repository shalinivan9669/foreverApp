// DTO rule: return only DTO/view model (never raw DB model shape).
// GET /api/insights/me
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { asError, toDomainError } from '@/domain/errors';
import { listMyInsights } from '@/domain/services/insightRules.service';

export async function GET(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const insights = await listMyInsights(auth.data.userId);
    return jsonOk({ insights });
  } catch (error: unknown) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}
