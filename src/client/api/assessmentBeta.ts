import { http } from './http';
import type { AssessmentRegistration, AssessmentSettingsDTO, AssessmentSettingsMutation, AssessmentSupportDTO, AssessmentSupportInput, AssessmentWithdraw } from '@/lib/dto/assessmentClient.dto';
import type { BetaDirectDTO, BetaDirectMutation, BetaComparisonDTO, BetaComparisonMutation, BetaDiscoveryDTO } from '@/lib/dto/assessmentBeta.dto';
import type { AssessmentPortfolioDTO, AssessmentPortfolioMutation } from '@/lib/dto/assessmentClient.dto';

export const assessmentBetaApi = {
  portfolio: (signal: AbortSignal): Promise<AssessmentPortfolioDTO> => http.get('/api/assessments/portfolio', { signal, cache: 'no-store' }),
  updatePortfolio: (body: AssessmentPortfolioMutation, signal: AbortSignal): Promise<AssessmentPortfolioDTO> => http.post('/api/assessments/portfolio', body, { signal }),
  settings: (signal: AbortSignal): Promise<AssessmentSettingsDTO> => http.get('/api/assessments/settings', { signal, cache: 'no-store' }),
  register: (body: AssessmentRegistration, signal: AbortSignal): Promise<AssessmentSettingsDTO> => http.post('/api/assessments/register', body, { signal }),
  updateSettings: (body: AssessmentSettingsMutation, signal: AbortSignal): Promise<AssessmentSettingsDTO> => http.post('/api/assessments/settings', body, { signal }),
  withdraw: (body: AssessmentWithdraw, signal: AbortSignal): Promise<AssessmentSettingsDTO> => http.post('/api/assessments/withdraw', body, { signal }),
  support: (body: AssessmentSupportInput, signal: AbortSignal): Promise<AssessmentSupportDTO> => http.post('/api/assessments/support', body, { signal }),
  supportList: (signal: AbortSignal): Promise<AssessmentSupportDTO[]> => http.get('/api/assessments/support', { signal, cache: 'no-store' }),
  direct: (signal: AbortSignal): Promise<BetaDirectDTO> => http.get('/api/assessments/direct', { signal, cache: 'no-store' }),
  saveDirect: (body: BetaDirectMutation, signal: AbortSignal): Promise<BetaDirectDTO> => http.post('/api/assessments/direct', body, { signal }),
  compare: (body: BetaComparisonMutation, signal: AbortSignal): Promise<BetaComparisonDTO> => http.post('/api/assessments/compare', body, { signal }),
  discovery: (signal: AbortSignal, cursor?: string): Promise<BetaDiscoveryDTO> => http.get(`/api/assessments/discovery${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal, cache: 'no-store' }),
};
