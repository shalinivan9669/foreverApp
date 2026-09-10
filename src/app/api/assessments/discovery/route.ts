import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseQuery } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { betaDiscoveryService } from '@/domain/services/assessmentDiscovery.service';

const querySchema = z.object({ cursor: z.string().min(24).max(200).optional(), limit: z.coerce.number().int().min(1).max(10).optional() }).strict();
export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  return domainResponse(() => betaDiscoveryService.get(auth.data.userId, query.data));
}
