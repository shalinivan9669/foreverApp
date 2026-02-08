import { http, type HttpRequestOptions } from './http';
import type { MutationAckDTO } from './types';
import {
  normalizePairMe,
  normalizePairStatus,
  normalizePairSummary,
  type PairMeInput,
  type PairStatusInput,
  type PairSummaryDTO,
  type PairSummaryInput,
} from '@/client/viewmodels/pair.viewmodels';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

export const pairsApi = {
  getStatus: async (signal?: AbortSignal) =>
    normalizePairStatus(
      await http.get<PairStatusInput>('/api/pairs/status', withSignal(signal))
    ),

  getMyPair: async (signal?: AbortSignal) =>
    normalizePairMe(await http.get<PairMeInput>('/api/pairs/me', withSignal(signal))),

  getSummary: async (pairId: string, signal?: AbortSignal): Promise<PairSummaryDTO> => {
    const summary = normalizePairSummary(
      await http.get<PairSummaryInput>(`/api/pairs/${pairId}/summary`, withSignal(signal))
    );
    if (!summary) {
      throw new Error('PAIR_SUMMARY_INVALID');
    }
    return summary;
  },

  pausePair: (pairId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/pairs/${pairId}/pause`, {}, { idempotency: true }),

  resumePair: (pairId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/pairs/${pairId}/resume`, {}, { idempotency: true }),
};

export type { PairSummaryDTO };
