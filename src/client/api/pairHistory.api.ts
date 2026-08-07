import { http } from './http';

export type PairHistorySignalDTO = {
  key: 'connection' | 'tension' | 'recovery' | 'resource';
  status: 'LOW' | 'STEADY' | 'HIGH' | 'MIXED';
};

export type PairHistoryCycleItemDTO = {
  kind: 'cycle';
  id: string;
  date: string;
  cycleKey: string;
  status: 'partial' | 'complete' | 'insufficient';
  summary: {
    dataStatus: 'PARTIAL' | 'ENOUGH' | 'INSUFFICIENT';
    signals: PairHistorySignalDTO[];
  };
};

export type PairHistoryActivityItemDTO = {
  kind: 'activity';
  id: string;
  date: string;
  title: string;
  status:
    | 'completed_success'
    | 'completed_partial'
    | 'failed'
    | 'expired'
    | 'cancelled';
  feedbackSubmitted: boolean;
};

export type PairHistoryItemDTO =
  | PairHistoryCycleItemDTO
  | PairHistoryActivityItemDTO;

export type PairHistoryPageDTO = {
  pairId: string;
  items: PairHistoryItemDTO[];
  nextCursor: string | null;
};

export const pairHistoryApi = {
  list: (
    pairId: string,
    options: {
      cursor?: string;
      limit?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<PairHistoryPageDTO> => {
    const query = new URLSearchParams();
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.limit !== undefined) query.set('limit', String(options.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';

    return http.get<PairHistoryPageDTO>(`/api/pairs/${pairId}/history${suffix}`, {
      signal: options.signal,
      cache: 'no-store',
    });
  },
};
