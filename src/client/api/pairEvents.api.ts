import { http, type HttpRequestOptions } from './http';
import type {
  PairEventAcceptResponse,
  PairEventListResponse,
  PairEventMutationResponse,
} from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

export const pairEventsApi = {
  getPairEvents: (
    pairId: string,
    input?: { include?: 'active' | 'all' },
    signal?: AbortSignal
  ): Promise<PairEventListResponse> => {
    const params = new URLSearchParams();
    if (input?.include) params.set('include', input.include);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return http.get<PairEventListResponse>(`/api/pairs/${pairId}/events${suffix}`, withSignal(signal));
  },

  acceptPairEvent: (pairId: string, eventId: string): Promise<PairEventAcceptResponse> =>
    http.post<PairEventAcceptResponse, Record<string, never>>(
      `/api/pairs/${pairId}/events/${eventId}/accept`,
      {},
      { idempotency: true }
    ),

  declinePairEvent: (pairId: string, eventId: string): Promise<PairEventMutationResponse> =>
    http.post<PairEventMutationResponse, Record<string, never>>(
      `/api/pairs/${pairId}/events/${eventId}/decline`,
      {},
      { idempotency: true }
    ),

  snoozePairEvent: (
    pairId: string,
    eventId: string,
    input?: { days?: 1 | 3 | 7 }
  ): Promise<PairEventMutationResponse> =>
    http.post<PairEventMutationResponse, { days?: 1 | 3 | 7 }>(
      `/api/pairs/${pairId}/events/${eventId}/snooze`,
      input ?? {},
      { idempotency: true }
    ),
};
