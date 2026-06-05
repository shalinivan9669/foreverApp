import { http, type HttpRequestOptions } from './http';
import type {
  PairWeeklyCheckInSummaryDTO,
  WeeklyCheckInAnswersDTO,
  WeeklyCheckInDTO,
} from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

export const checkinsApi = {
  getCurrentWeekly: (
    input: { pairId?: string; weekKey?: string } = {},
    signal?: AbortSignal
  ): Promise<{ checkIn: WeeklyCheckInDTO | null }> => {
    const params = new URLSearchParams();
    if (input.pairId) params.set('pairId', input.pairId);
    if (input.weekKey) params.set('weekKey', input.weekKey);
    const suffix = params.toString();
    return http.get<{ checkIn: WeeklyCheckInDTO | null }>(
      `/api/checkins/weekly/current${suffix ? `?${suffix}` : ''}`,
      withSignal(signal)
    );
  },

  getPairWeeklySummary: (
    pairId: string,
    input: { weekKey?: string } = {},
    signal?: AbortSignal
  ): Promise<PairWeeklyCheckInSummaryDTO> => {
    const params = new URLSearchParams();
    if (input.weekKey) params.set('weekKey', input.weekKey);
    const suffix = params.toString();
    return http.get<PairWeeklyCheckInSummaryDTO>(
      `/api/pairs/${pairId}/weekly-checkin/current${suffix ? `?${suffix}` : ''}`,
      withSignal(signal)
    );
  },

  submitWeekly: (input: {
    pairId?: string;
    weekKey?: string;
    answers: WeeklyCheckInAnswersDTO;
  }): Promise<WeeklyCheckInDTO> =>
    http.post<WeeklyCheckInDTO, {
      pairId?: string;
      weekKey?: string;
      answers: WeeklyCheckInAnswersDTO;
    }>('/api/checkins/weekly', input, { idempotency: true }),
};
