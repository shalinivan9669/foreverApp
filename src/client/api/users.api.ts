import { http, type HttpRequestOptions } from './http';
import type {
  CurrentUserDTO,
  ExchangeCodeRequest,
  ExchangeCodeResponse,
  MutationAckDTO,
  ProfileSummaryDTO,
} from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

const withSignalNoStore = (signal?: AbortSignal): HttpRequestOptions => ({
  ...(signal ? { signal } : {}),
  cache: 'no-store',
});

export const usersApi = {
  exchangeDiscordCode: (payload: ExchangeCodeRequest): Promise<ExchangeCodeResponse> =>
    http.post<ExchangeCodeResponse, ExchangeCodeRequest>('/api/exchange-code', payload),

  getCurrentUser: (signal?: AbortSignal): Promise<CurrentUserDTO> =>
    http.get<CurrentUserDTO>('/api/users/me', withSignal(signal)),

  getProfileSummary: (signal?: AbortSignal): Promise<ProfileSummaryDTO> =>
    http.get<ProfileSummaryDTO>('/api/users/me/profile-summary', withSignalNoStore(signal)),

  writeActivityLog: (): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>('/api/logs', {}, { idempotency: true }),
};
