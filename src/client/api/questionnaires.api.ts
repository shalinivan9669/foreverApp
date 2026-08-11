import { http, type HttpRequestOptions } from './http';
import type { QuestionnaireCardDTO, QuestionnaireDTO } from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

type QuestionnaireAudienceFilter = 'personal' | 'couple';
type QuestionnaireTargetFilter = 'individual' | 'couple';

const withAudienceQuery = (audience?: QuestionnaireAudienceFilter): string => {
  if (!audience) return '/api/questionnaires/cards';
  return `/api/questionnaires/cards?audience=${encodeURIComponent(audience)}`;
};

const withTargetQuery = (target: QuestionnaireTargetFilter): string =>
  `/api/questionnaires?target=${encodeURIComponent(target)}`;

export const questionnairesApi = {
  getCards: (
    signal?: AbortSignal,
    audience?: QuestionnaireAudienceFilter
  ): Promise<QuestionnaireCardDTO[]> =>
    http.get<QuestionnaireCardDTO[]>(withAudienceQuery(audience), withSignal(signal)),

  getQuestionnaire: (questionnaireId: string, signal?: AbortSignal): Promise<QuestionnaireDTO> =>
    http.get<QuestionnaireDTO>(`/api/questionnaires/${questionnaireId}`, withSignal(signal)),

  getQuestionnairesByTarget: (
    target: QuestionnaireTargetFilter,
    signal?: AbortSignal
  ): Promise<QuestionnaireDTO[]> =>
    http.get<QuestionnaireDTO[]>(withTargetQuery(target), withSignal(signal)),

  startPersonalQuestionnaire: (
    questionnaireId: string,
    signal?: AbortSignal
  ): Promise<QuestionnaireDTO> =>
    questionnairesApi.getQuestionnaire(questionnaireId, signal),

  startCoupleQuestionnaire: (
    pairId: string,
    questionnaireId: string,
    signal?: AbortSignal
  ): Promise<{ sessionId: string; status: 'in_progress'; startedAt: string }> =>
    http.post<{ sessionId: string; status: 'in_progress'; startedAt: string }, Record<string, never>>(
      `/api/pairs/${pairId}/questionnaires/${questionnaireId}/start`,
      {},
      { idempotency: true, ...(signal ? { signal } : {}) }
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

  submitCoupleAnswer: (
    pairId: string,
    questionnaireId: string,
    payload: { sessionId?: string | null; questionId: string; ui: number }
  ): Promise<Record<string, never>> =>
    http.post<Record<string, never>, { sessionId?: string | null; questionId: string; ui: number }>(
      `/api/pairs/${pairId}/questionnaires/${questionnaireId}/answer`,
      payload,
      { idempotency: true }
    ),
};
