/** Browser contract surface: runtime exports must remain free of services, models and Node APIs. */
export { ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_TERMS_VERSION } from '@/domain/assessment/admission';
export { expandBetaRecurrence, localTimeToInstant } from '@/domain/assessment/schedule';
export type {
  AssessmentChoices, AssessmentRegistration, AssessmentSettingsDTO, AssessmentSettingsMutation,
  AssessmentSupportDTO, AssessmentSupportInput, AssessmentWithdraw,
} from '@/domain/assessment/admission';
export type { BetaInterval } from '@/domain/assessment/schedule';
export type { AssessmentPortfolioDTO, AssessmentPortfolioMutation, AssessmentPracticeDTO } from '@/domain/assessment/planner';
export type { AssessmentPeriod, AssessmentResponse } from '@/domain/assessment/contracts';
// Type-only exports intentionally exclude profile evaluation and its server publication dependencies.
export type { AssessmentSkillSnapshot, AssessmentTrackSnapshot } from '@/domain/assessment/profile';
