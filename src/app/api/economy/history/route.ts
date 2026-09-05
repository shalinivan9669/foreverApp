import { NextRequest } from 'next/server';
import { z } from 'zod';
import { economyService } from '@/domain/services/economy.service';
import { parseQuery } from '@/lib/api/validate';
import { economyResponse, requireEconomyOwner } from '../shared';

const querySchema = z.object({ cursor: z.string().max(100).optional() }).strict();
export async function GET(req: NextRequest) {
  const auth = await requireEconomyOwner(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  return economyResponse(() => economyService.history(auth.data.userId, query.data.cursor));
}
