// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { questionnaireCardsService } from '@/domain/services/questionnaireCards.service';
import { requireSession } from '@/lib/auth/guards';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';

const querySchema = z
  .object({
    audience: z.enum(['personal', 'couple']).optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const cards = await questionnaireCardsService.list({
    currentUserId: auth.data.userId,
    scope: query.data.audience,
  });
  return jsonOk(cards);
}
