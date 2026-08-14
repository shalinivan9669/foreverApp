import { http, type HttpRequestOptions } from './http';
import type {
  CurrentUserDTO,
  ExchangeCodeRequest,
  ExchangeCodeResponse,
  MutationAckDTO,
  PartnerSignalSendRequest,
  PartnerSignalSendResponse,
  PersonalDailyCheckInRequest,
  PersonalTodayDTO,
  ProfileSummaryDTO,
  RelationshipLensPatchRequest,
  UserOnboardingPatchRequest,
  UserProfileUpsertRequest,
} from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

const withSignalNoStore = (signal?: AbortSignal): HttpRequestOptions => ({
  ...(signal ? { signal } : {}),
  cache: 'no-store',
});

export const usersApi = {
  exchangeDiscordCode: (
    payload: ExchangeCodeRequest,
    signal?: AbortSignal
  ): Promise<ExchangeCodeResponse> =>
    http.post<ExchangeCodeResponse, ExchangeCodeRequest>(
      '/api/exchange-code',
      payload,
      withSignal(signal)
    ),

  getCurrentUser: (signal?: AbortSignal): Promise<CurrentUserDTO> =>
    http.get<CurrentUserDTO>('/api/users/me', withSignal(signal)),

  upsertCurrentUserProfile: (payload: UserProfileUpsertRequest): Promise<CurrentUserDTO> =>
    http.post<CurrentUserDTO, UserProfileUpsertRequest>('/api/users', payload, {
      idempotency: true,
    }),

  updateCurrentUserOnboarding: (
    payload: UserOnboardingPatchRequest
  ): Promise<CurrentUserDTO> =>
    http.patch<CurrentUserDTO, UserOnboardingPatchRequest>(
      '/api/users/me/onboarding',
      payload,
      { idempotency: true }
    ),

  getProfileSummary: (signal?: AbortSignal): Promise<ProfileSummaryDTO> =>
    http.get<ProfileSummaryDTO>('/api/users/me/profile-summary', withSignalNoStore(signal)),

  getPersonalToday: (
    input: { dateKey?: string; timezoneOffsetMin?: number } = {},
    signal?: AbortSignal
  ): Promise<PersonalTodayDTO> => {
    const params = new URLSearchParams();
    if (input.dateKey) params.set('dateKey', input.dateKey);
    if (typeof input.timezoneOffsetMin === 'number') {
      params.set('timezoneOffsetMin', String(input.timezoneOffsetMin));
    }
    const suffix = params.toString();
    return http.get<PersonalTodayDTO>(
      `/api/users/me/today${suffix ? `?${suffix}` : ''}`,
      withSignalNoStore(signal)
    );
  },

  submitPersonalDailyCheckIn: (
    payload: PersonalDailyCheckInRequest
  ): Promise<PersonalTodayDTO> =>
    http.post<PersonalTodayDTO, PersonalDailyCheckInRequest>(
      '/api/users/me/daily-checkins',
      payload,
      { idempotency: true }
    ),

  updateRelationshipLens: (
    payload: RelationshipLensPatchRequest
  ): Promise<{ lens: PersonalTodayDTO['lens'] }> =>
    http.patch<{ lens: PersonalTodayDTO['lens'] }, RelationshipLensPatchRequest>(
      '/api/users/me/relationship-lens',
      payload,
      { idempotency: true }
    ),

  sendPartnerSignal: (
    checkInId: string,
    payload: PartnerSignalSendRequest
  ): Promise<PartnerSignalSendResponse> =>
    http.post<PartnerSignalSendResponse, PartnerSignalSendRequest>(
      `/api/users/me/daily-checkins/${checkInId}/partner-signal`,
      payload,
      { idempotency: true }
    ),

  writeActivityLog: (): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>('/api/logs', {}, { idempotency: true }),
};
