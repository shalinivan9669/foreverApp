import { http, type HttpRequestOptions } from './http';
import type { QuestionnaireCardDTO, QuestionnaireDTO } from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

type QuestionnaireAudienceFilter = 'personal' | 'couple';

const withAudienceQuery = (audience?: QuestionnaireAudienceFilter): string => {
  if (!audience) return '/api/questionnaires/cards';
  return `/api/questionnaires/cards?audience=${encodeURIComponent(audience)}`;
};

export const questionnairesApi = {
  getCards: (
    signal?: AbortSignal,
    audience?: QuestionnaireAudienceFilter
  ): Promise<QuestionnaireCardDTO[]> =>
    http.get<QuestionnaireCardDTO[]>(withAudienceQuery(audience), withSignal(signal)),

  getQuestionnaire: (questionnaireId: string, signal?: AbortSignal): Promise<QuestionnaireDTO> =>
    http.get<QuestionnaireDTO>(`/api/questionnaires/${questionnaireId}`, withSignal(signal)),

  startPersonalQuestionnaire: (
    questionnaireId: string,
    signal?: AbortSignal
  ): Promise<QuestionnaireDTO> =>
    questionnairesApi.getQuestionnaire(questionnaireId, signal),

  startCoupleQuestionnaire: (
    pairId: string,
    questionnaireId: string
  ): Promise<{ sessionId: string; status: 'in_progress'; startedAt: string }> =>
    http.post<{ sessionId: string; status: 'in_progress'; startedAt: string }, Record<string, never>>(
      `/api/pairs/${pairId}/questionnaires/${questionnaireId}/start`,
      {},
      { idempotency: true }
    ),

  submitPersonalAnswer: (
    questionnaireId: string,
    answer: { qid: string; ui: number }
  ): Promise<Record<string, never>> =>
    http.post<Record<string, never>, { qid: string; ui: number }>(
      `/api/questionnaires/${questionnaireId}`,
      answer,
      { idempotency: true }
    ),

  submitPersonalAnswers: (
    questionnaireId: string,
    answers: { qid: string; ui: number }[]
  ): Promise<Record<string, never>> =>
    http.post<Record<string, never>, { answers: { qid: string; ui: number }[] }>(
      `/api/questionnaires/${questionnaireId}`,
      { answers },
      { idempotency: true }
    ),
};
