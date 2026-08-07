import { http, type HttpRequestOptions } from './http';

export type WeeklyCycleMemberStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'SKIPPED'
  | 'EXPIRED';

export type CurrentWeeklyCycleDTO = {
  pairId: string;
  cycleId: string;
  cycleKey: string;
  window: {
    startsAt: string;
    endsAt: string;
    status: 'OPEN' | 'EXPIRED';
    timeZone: 'UTC';
  };
  currentUser: { completionStatus: WeeklyCycleMemberStatus };
  peer: { completionStatus: WeeklyCycleMemberStatus };
  pair: {
    bothSubmitted: boolean;
    dataStatus: 'NOT_READY' | 'PARTIAL' | 'ENOUGH' | 'INSUFFICIENT' | 'EXPIRED';
    reasonCodes: string[];
    signals: Array<{
      key: 'connection' | 'tension' | 'recovery' | 'resource';
      status: 'LOW' | 'STEADY' | 'HIGH' | 'MIXED';
      reasonCode:
        | 'PAIR_LEVEL_LOW'
        | 'PAIR_LEVEL_STEADY'
        | 'PAIR_LEVEL_HIGH'
        | 'DIFFERENT_EXPERIENCE';
      nextStepHint:
        | 'CHECK_IN_TOGETHER'
        | 'CHOOSE_LOW_EFFORT'
        | 'MAKE_ROOM_FOR_RECOVERY'
        | 'KEEP_CURRENT_RHYTHM';
    }>;
  };
  snapshot: {
    revision: number;
    generatedAt: string;
    inputDefinitionVersion: string;
    algorithmVersion: string;
    displayVersion: string;
  };
};

const noStore = (signal?: AbortSignal): HttpRequestOptions => ({
  cache: 'no-store',
  ...(signal ? { signal } : {}),
});

export const weeklyCyclesApi = {
  getCurrent: (pairId: string, signal?: AbortSignal): Promise<CurrentWeeklyCycleDTO> =>
    http.get<CurrentWeeklyCycleDTO>(
      `/api/pairs/${pairId}/weekly-cycle/current`,
      noStore(signal)
    ),

  skipCurrent: (pairId: string): Promise<CurrentWeeklyCycleDTO> =>
    http.post<CurrentWeeklyCycleDTO, Record<string, never>>(
      `/api/pairs/${pairId}/weekly-cycle/current`,
      {},
      { idempotency: true }
    ),
};
