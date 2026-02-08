import { http, type HttpRequestOptions } from './http';
import type { QuestionnaireCardDTO } from './types';

const withSignal = (signal?: AbortSignal): HttpRequestOptions | undefined =>
  signal ? { signal } : undefined;

export const questionnairesApi = {
  getCards: (signal?: AbortSignal): Promise<QuestionnaireCardDTO[]> =>
    http.get<QuestionnaireCardDTO[]>('/api/questionnaires/cards', withSignal(signal)),
};
