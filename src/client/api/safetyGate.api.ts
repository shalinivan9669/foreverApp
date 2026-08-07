import { http } from '@/client/api/http';

export type OwnerSafetyGateDTO = {
  enabled: boolean;
  retentionClass: 'UNTIL_REVOKED_OR_PAIR_END';
  updatedAt?: string;
};

export const safetyGateApi = {
  get: (pairId: string, signal?: AbortSignal): Promise<OwnerSafetyGateDTO> =>
    http.get<OwnerSafetyGateDTO>(
      `/api/users/me/safety-gate?pairId=${encodeURIComponent(pairId)}`,
      signal ? { signal } : undefined
    ),

  set: (pairId: string, enabled: boolean): Promise<OwnerSafetyGateDTO> =>
    http.put<OwnerSafetyGateDTO, { pairId: string; enabled: boolean }>(
      '/api/users/me/safety-gate',
      { pairId, enabled }
    ),
};
