import { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/guards';
import { questionnaireCatalogService } from '@/domain/services/questionnaireCatalog.service';

// DTO rule: return only DTO/view model (never raw DB model shape).

const querySchema = z
  .object({
    target: z.enum(['couple', 'individual']).optional(),
    audience: z.enum(['personal', 'couple']).optional(),
  })
  .passthrough();

// GET /api/questionnaires?target=couple|individual
export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  return jsonOk(await questionnaireCatalogService.listPublished(query.data));
}
