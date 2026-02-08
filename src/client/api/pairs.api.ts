import { http, type HttpRequestOptions } from './http';
import type { MutationAckDTO, PairMeDTO, PairStatusDTO } from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

type PairSummaryDTO = {
  pair: {
    id: string;
    _id?: string;
    members: [string, string];
    status: 'active' | 'paused' | 'ended';
    createdAt?: string;
    progress?: { streak: number; completed: number };
    readiness?: { score: number };
    fatigue?: { score: number };
    passport?: {
      strongSides: { axis: string; facets: string[] }[];
      riskZones: { axis: string; facets: string[]; severity: 1 | 2 | 3 }[];
      complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
      levelDelta: { axis: string; delta: number }[];
    };
  };
  currentActivity: {
    id: string;
    _id?: string;
    title: { ru: string; en: string };
    status: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    intensity: 1 | 2 | 3;
    axis: string[];
  } | null;
  suggestedCount: number;
  lastLike: {
    id: string;
    matchScore: number;
    updatedAt?: string;
    agreements?: boolean[];
    answers?: string[];
    recipientResponse?: {
      agreements: boolean[];
      answers: string[];
    } | null;
  } | null;
};

export const pairsApi = {
  getStatus: (signal?: AbortSignal): Promise<PairStatusDTO> =>
    http.get<PairStatusDTO>('/api/pairs/status', withSignal(signal)),

  getMyPair: (signal?: AbortSignal): Promise<PairMeDTO> =>
    http.get<PairMeDTO>('/api/pairs/me', withSignal(signal)),

  getSummary: (pairId: string, signal?: AbortSignal): Promise<PairSummaryDTO> =>
    http.get<PairSummaryDTO>(`/api/pairs/${pairId}/summary`, withSignal(signal)),

  pausePair: (pairId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/pairs/${pairId}/pause`, {}, { idempotency: true }),

  resumePair: (pairId: string): Promise<MutationAckDTO> =>
    http.post<MutationAckDTO, Record<string, never>>(`/api/pairs/${pairId}/resume`, {}, { idempotency: true }),
};

export type { PairSummaryDTO };
