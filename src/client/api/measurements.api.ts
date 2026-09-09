import { http } from './http';
import type { MeasurementMutation, MeasurementTestDTO } from '@/lib/dto/measurementTests.dto';
import type { MeasuredPairProfileDTO } from '@/lib/dto/measuredPairProfile.dto';
export const measurementsApi = {
  list: (signal?: AbortSignal) => http.get<MeasurementTestDTO[]>('/api/measurements', { signal }),
  get: (key: string, signal?: AbortSignal) => http.get<MeasurementTestDTO>(`/api/measurements/${encodeURIComponent(key)}`, { signal }),
  mutate: (key: string, body: MeasurementMutation) => http.post<MeasurementTestDTO, MeasurementMutation>(`/api/measurements/${encodeURIComponent(key)}`, body),
  pair: (pairId: string, signal?: AbortSignal) => http.get<MeasuredPairProfileDTO>(`/api/pairs/${encodeURIComponent(pairId)}/factor-profile`, { signal }),
};
