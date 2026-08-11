// src/app/api/activity-templates/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/guards';
import { activityTemplateCatalogService } from '@/domain/services/activityTemplateCatalog.service';

// DTO rule: return only DTO/view model (never raw DB model shape).

const querySchema = z
  .object({
    targetFactorKey: z.string().min(1).max(200).optional(),
    actionKey: z.string().min(1).max(200).optional(),
    intent: z.string().optional(),
    difficulty: z.coerce.number().int().min(1).max(3).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  return jsonOk(await activityTemplateCatalogService.listPublished(query.data));
}
