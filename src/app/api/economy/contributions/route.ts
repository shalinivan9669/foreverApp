import { NextRequest } from 'next/server';
import { z } from 'zod';
import { economyService } from '@/domain/services/economy.service';
import { parseJson } from '@/lib/api/validate';
import { economyResponse, requireEconomyOwner } from '../shared';

const bodySchema = z.object({ pairId: z.string().regex(/^[a-f0-9]{24}$/i), itemId: z.string().min(1).max(100), operationId: z.string().uuid() }).strict();
export async function POST(req: NextRequest) {
  const auth = await requireEconomyOwner(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  return economyResponse(() => economyService.contribute({ userId: auth.data.userId, ...body.data }));
}
