import { http } from './http';
import type { EconomyHistoryDTO, EconomyOverviewDTO, EconomyPurchaseDTO, EconomyPairCollectionDTO, EconomyContributionDTO } from '@/lib/dto/economy.dto';

export type { EconomyCatalogItemDTO, EconomyHistoryDTO, EconomyOverviewDTO, EconomyPurchaseDTO, EconomyPairCollectionDTO, EconomyContributionDTO } from '@/lib/dto/economy.dto';

export const economyApi = {
  overview: (signal?: AbortSignal): Promise<EconomyOverviewDTO> =>
    http.get('/api/economy', { signal, cache: 'no-store' }),
  history: (cursor?: string, signal?: AbortSignal): Promise<EconomyHistoryDTO> =>
    http.get(`/api/economy/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal, cache: 'no-store' }),
  purchase: (itemId: string, operationId: string): Promise<EconomyPurchaseDTO> =>
    http.post('/api/economy/purchases', { itemId, operationId }),
  equip: (itemId: string | null): Promise<{ equippedItemId: string | null }> =>
    http.post('/api/economy/appearance', { itemId }),
  pairCollection: (pairId: string, signal?: AbortSignal): Promise<EconomyPairCollectionDTO> =>
    http.get(`/api/economy/pair-collection?pairId=${encodeURIComponent(pairId)}`, { signal, cache: 'no-store' }),
  contribute: (pairId: string, itemId: string, operationId: string): Promise<EconomyContributionDTO> =>
    http.post('/api/economy/contributions', { pairId, itemId, operationId }),
};
