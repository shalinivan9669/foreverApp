// DTO rule: return only DTO/view model (never raw DB model shape).
// src/app/api/users/me/profile-summary/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getOwnerFactorProfileSummary } from '@/domain/services/factorProfileSummary.service';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/guards';

// GET /api/users/me/profile-summary
export async function GET(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const summary = await getOwnerFactorProfileSummary(auth.data.userId);
  if (!summary) return jsonError(404, 'USER_NOT_FOUND', 'no user');

  return jsonOk(summary);
}
