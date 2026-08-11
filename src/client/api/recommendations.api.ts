import { http, type HttpRequestOptions } from './http';
import type { ActivityActionDefinitionRef } from './types';

export type RecommendationDecisionStatus =
  | 'OFFERED'
  | 'ACCEPTED'
  | 'SKIPPED'
  | 'REPLACED'
  | 'EXPIRED';

export type RecommendationDecisionDTO = {
  id: string;
  cycleKey: string;
  activity: {
    id: string;
    title: { ru: string; en: string };
    actionDefinition: ActivityActionDefinitionRef;
    difficulty: 1 | 2 | 3 | 4 | 5;
    expiresAt?: string;
  };
  status: RecommendationDecisionStatus;
  reasonCode: 'CURRENT_CYCLE_SUPPORT' | 'ALTERNATIVE_REQUESTED';
  explanation: { ru: string; en: string };
  decisionVersion: 'recommendation-decision-v1';
  previousDecisionId?: string;
  canAccept: boolean;
  canSkip: boolean;
  canReplace: boolean;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RecommendationOverviewDTO = {
  current: RecommendationDecisionDTO | null;
  history: RecommendationDecisionDTO[];
};

const noStore = (signal?: AbortSignal): HttpRequestOptions => ({
  cache: 'no-store',
  ...(signal ? { signal } : {}),
});

const decide = (
  pairId: string,
  action: 'accept' | 'replace' | 'skip',
  decisionId: string
): Promise<RecommendationDecisionDTO> =>
  http.post<RecommendationDecisionDTO, { action: typeof action; decisionId: string }>(
    `/api/pairs/${pairId}/recommendations`,
    { action, decisionId },
    { idempotency: true }
  );

export const recommendationsApi = {
  getOverview: (
    pairId: string,
    signal?: AbortSignal
  ): Promise<RecommendationOverviewDTO> =>
    http.get<RecommendationOverviewDTO>(
      `/api/pairs/${pairId}/recommendations`,
      noStore(signal)
    ),

  offer: (pairId: string): Promise<RecommendationDecisionDTO> =>
    http.post<RecommendationDecisionDTO, { action: 'offer' }>(
      `/api/pairs/${pairId}/recommendations`,
      { action: 'offer' },
      { idempotency: true }
    ),

  accept: (pairId: string, decisionId: string): Promise<RecommendationDecisionDTO> =>
    decide(pairId, 'accept', decisionId),

  replace: (pairId: string, decisionId: string): Promise<RecommendationDecisionDTO> =>
    decide(pairId, 'replace', decisionId),

  skip: (pairId: string, decisionId: string): Promise<RecommendationDecisionDTO> =>
    decide(pairId, 'skip', decisionId),
};
