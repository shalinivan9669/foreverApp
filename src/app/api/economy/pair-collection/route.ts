import { NextRequest } from 'next/server';
import { z } from 'zod';
import { economyService } from '@/domain/services/economy.service';
import { jsonError } from '@/lib/api/response';
import { economyResponse, requireEconomyOwner } from '../shared';

const querySchema = z.object({ pairId: z.string().regex(/^[a-f0-9]{24}$/i) }).strict();
export async function GET(req: NextRequest) {
  const auth = await requireEconomyOwner(req);
  if (!auth.ok) return auth.response;
  const query = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return jsonError(400, 'VALIDATION_ERROR', 'Некорректная пара');
  return economyResponse(() => economyService.pairCollection({ userId: auth.data.userId, ...query.data }));
}
