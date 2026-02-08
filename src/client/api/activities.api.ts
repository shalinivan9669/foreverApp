import { http, type HttpRequestOptions } from './http';
import type {
  ActivityBucket,
  ActivityCheckInRequest,
  ActivityCheckInResponse,
  ActivityOfferDTO,
  CreateActivityFromTemplateRequest,
  CreateActivityFromTemplateResponse,
  MutationAckDTO,
  NextActivityResponse,
  PairActivityDTO,
} from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

export const activitiesApi = {
  getPairActivities: (
    pairId: string,
    bucket: ActivityBucket,
    signal?: AbortSignal
  ): Promise<PairActivityDTO[]> =>
    http.get<PairActivityDTO[]>(`/api/pairs/${pairId}/activities?s=${bucket}`, withSignal(signal)),

  suggestPairActivities: (pairId: string): Promise<ActivityOfferDTO[]> =>
    http.post<ActivityOfferDTO[], Record<string, never>>(`/api/pairs/${pairId}/suggest`, {}, {
      idempotency: true,
    }),

  suggestPairActivitiesByTemplates: (pairId: string): Promise<ActivityOfferDTO[]> =>
    http.post<ActivityOfferDTO[], Record<string, never>>(`/api/pairs/${pairId}/activities/suggest`, {}, {
      idempotency: true,
    }),

  createFromTemplate: (
    pairId: string,
    payload: CreateActivityFromTemplateRequest
  ): Promise<CreateActivityFromTemplateResponse> =>
    http.post<CreateActivityFromTemplateResponse, CreateActivityFromTemplateRequest>(
      `/api/pairs/${pairId}/activities/from-template`,
      payload,
      { idempotency: true }
    ),

  createNextActivity: (): Promise<NextActivityResponse> =>
    http.post<NextActivityResponse, Record<string, never>>('/api/activities/next', {}, {
      idempotency: true,
    }),

  acceptActivity: (activityId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/activities/${activityId}/accept`, {}, {
      idempotency: true,
    }),

  cancelActivity: (activityId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/activities/${activityId}/cancel`, {}, {
      idempotency: true,
    }),

  checkInActivity: (activityId: string, payload: ActivityCheckInRequest): Promise<ActivityCheckInResponse> =>
    http.post<ActivityCheckInResponse, ActivityCheckInRequest>(
      `/api/activities/${activityId}/checkin`,
      payload,
      { idempotency: true }
    ),

  completeActivity: (activityId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/activities/${activityId}/complete`, {}, {
      idempotency: true,
    }),
};
