import type { MeasurementTest } from '@/domain/model/measurements/catalog';
export type MeasurementAnswerDTO = { questionId: string; choice: number | null };
export type MeasurementTestDTO = {
  test: MeasurementTest; status: 'NEW' | 'DRAFT' | 'FINALIZED'; revision: number;
  answers: MeasurementAnswerDTO[]; pairUse: boolean; permissionRevision: number;
  calculation: 'NOT_STARTED' | 'PENDING' | 'READY'; finalizedAt: string | null;
  factorKeys: string[];
};
export type MeasurementMutation =
  | { action: 'start' }
  | { action: 'draft' | 'finalize'; expectedRevision: number; answers: MeasurementAnswerDTO[]; pairUse: boolean }
  | { action: 'permission'; pairUse: boolean; expectedPermissionRevision: number }
  | { action: 'retry' };
