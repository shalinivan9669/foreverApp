import { http } from './http';
import type { CurrentUserDTO } from './types';

export type EntryProfileRequest = {
  cohort: 'SOLO' | 'EXISTING_PARTNER';
  age: number;
  gender: 'male' | 'female';
  city: string;
  locationMode: 'CITY_CATALOG' | 'DEVICE' | 'NONE' | 'KEEP';
  searchCityId?: string;
  coordinates?: [number, number];
};
export type EntryStateDTO = {
  user: CurrentUserDTO & { publicId: string };
  hasPair: boolean;
  onboardingCompleted: boolean;
  cityCatalogVersion: string;
  searchCities: Array<{ id: string; name: string; country: string; coordinates: [number, number] }>;
};
export const entryApi = {
  get: (signal?: AbortSignal) => http.get<EntryStateDTO>('/api/users/me/entry', { signal, cache: 'no-store' }),
  save: (profile: EntryProfileRequest) => http.put<EntryStateDTO, EntryProfileRequest>('/api/users/me/entry', profile),
};
