import { http } from './http';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentComparisonDTO, AssessmentComparisonMutation } from '@/lib/dto/assessmentComparison.dto';
import type { AssessmentPairDTO, AssessmentPairMutation } from '@/lib/dto/assessmentPair.dto';

export const assessmentApi = {
  get: (signal?: AbortSignal): Promise<AssessmentRunDTO> => http.get('/api/assessments/dom-s07', { signal, cache: 'no-store' }),
  controls: (signal?: AbortSignal): Promise<AssessmentRunDTO> => http.get('/api/assessments/dom-s07?view=controls', { signal, cache: 'no-store' }),
  mutate: (body: AssessmentMutation, signal?: AbortSignal): Promise<AssessmentRunDTO> => http.post<AssessmentRunDTO, AssessmentMutation>('/api/assessments/dom-s07', body, { signal }),
  comparison: (signal?: AbortSignal): Promise<AssessmentComparisonDTO> => http.get('/api/assessments/comparison', { signal, cache: 'no-store' }),
  comparisonControls: (signal?: AbortSignal): Promise<AssessmentComparisonDTO> => http.get('/api/assessments/comparison?view=controls', { signal, cache: 'no-store' }),
  compare: (body: AssessmentComparisonMutation, signal?: AbortSignal): Promise<AssessmentComparisonDTO> => http.post<AssessmentComparisonDTO, AssessmentComparisonMutation>('/api/assessments/comparison', body, { signal }),
  pair: (signal?: AbortSignal): Promise<AssessmentPairDTO> => http.get('/api/assessments/pair', { signal, cache: 'no-store' }),
  pairControls: (signal?: AbortSignal): Promise<AssessmentPairDTO> => http.get('/api/assessments/pair?view=controls', { signal, cache: 'no-store' }),
  mutatePair: (body: AssessmentPairMutation, signal?: AbortSignal): Promise<AssessmentPairDTO> => http.post<AssessmentPairDTO, AssessmentPairMutation>('/api/assessments/pair', body, { signal }),
};
