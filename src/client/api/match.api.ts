import { http, type HttpRequestOptions } from './http';
import type {
  CandidateMatchCardDTO,
  MatchCardDTO,
  MatchConfirmResponse,
  MatchDecisionRequest,
  MatchFeedCandidateDTO,
  MatchInboxRowDTO,
  MatchLikeCreateRequest,
  MatchLikeCreateResponse,
  MatchLikeDTO,
  MatchRespondRequest,
  MatchRespondResponse,
  MutationAckDTO,
  SaveMatchCardRequest,
} from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

export const matchApi = {
  getFeed: (signal?: AbortSignal): Promise<MatchFeedCandidateDTO[]> =>
    http.get<MatchFeedCandidateDTO[]>('/api/match/feed', withSignal(signal)),

  getInbox: (signal?: AbortSignal): Promise<MatchInboxRowDTO[]> =>
    http.get<MatchInboxRowDTO[]>('/api/match/inbox', withSignal(signal)),

  getLike: (likeId: string, signal?: AbortSignal): Promise<MatchLikeDTO> =>
    http.get<MatchLikeDTO>(`/api/match/like/${likeId}`, withSignal(signal)),

  getOwnMatchCard: (signal?: AbortSignal): Promise<MatchCardDTO | null> =>
    http.get<MatchCardDTO | null>('/api/match/card', withSignal(signal)),

  saveOwnMatchCard: (payload: SaveMatchCardRequest): Promise<MatchCardDTO | null> =>
    http.post<MatchCardDTO | null, SaveMatchCardRequest>('/api/match/card', payload),

  getCandidateCard: (candidateId: string, signal?: AbortSignal): Promise<CandidateMatchCardDTO> =>
    http.get<CandidateMatchCardDTO>(`/api/match/card/${candidateId}`, withSignal(signal)),

  createLike: (payload: MatchLikeCreateRequest): Promise<MatchLikeCreateResponse> =>
    http.post<MatchLikeCreateResponse, MatchLikeCreateRequest>('/api/match/like', payload, {
      idempotency: true,
    }),

  respondToLike: (payload: MatchRespondRequest): Promise<MatchRespondResponse> =>
    http.post<MatchRespondResponse, MatchRespondRequest>('/api/match/respond', payload, {
      idempotency: true,
    }),

  acceptLike: (payload: MatchDecisionRequest): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, MatchDecisionRequest>('/api/match/accept', payload, {
      idempotency: true,
    }),

  rejectLike: (payload: MatchDecisionRequest): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, MatchDecisionRequest>('/api/match/reject', payload, {
      idempotency: true,
    }),

  confirmLike: (payload: MatchDecisionRequest): Promise<MatchConfirmResponse> =>
    http.post<MatchConfirmResponse, MatchDecisionRequest>('/api/match/confirm', payload, {
      idempotency: true,
    }),
};
