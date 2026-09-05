import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asError, toDomainError } from '@/domain/errors';
import { entryProfileService } from '@/domain/services/entryProfile.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { requireSession } from '@/lib/auth/guards';

const bodySchema = z.object({
  cohort: z.enum(['SOLO', 'EXISTING_PARTNER']),
  age: z.number().int().min(18).max(120),
  gender: z.enum(['male', 'female']),
  city: z.string().trim().min(1).max(100),
  locationMode: z.enum(['CITY_CATALOG', 'DEVICE', 'NONE', 'KEEP']),
  searchCityId: z.string().max(80).optional(),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).optional(),
}).strict();

const errorResponse = (error: Error) => {
  const failure = toDomainError(error);
  return jsonError(failure.status, failure.code, failure.message, failure.details);
};

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try { return jsonOk(await entryProfileService.get(auth.data.userId)); }
  catch (error) { return errorResponse(asError(error)); }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rate = await enforceRateLimit({ req, userId: auth.data.userId, policy: RATE_LIMIT_POLICIES.matchMutations, routeForAudit: '/api/users/me/entry' });
  if (!rate.ok) return rate.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk(await entryProfileService.save({ currentUserId: auth.data.userId, profile: body.data, auditRequest: auditContextFromRequest(req, '/api/users/me/entry') }));
  } catch (error) { return errorResponse(asError(error)); }
}
