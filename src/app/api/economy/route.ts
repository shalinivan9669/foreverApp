import { NextRequest } from 'next/server';
import { economyService } from '@/domain/services/economy.service';
import { economyResponse, requireEconomyOwner } from './shared';

export async function GET(req: NextRequest) {
  const auth = await requireEconomyOwner(req);
  if (!auth.ok) return auth.response;
  return economyResponse(() => economyService.overview(auth.data.userId));
}
