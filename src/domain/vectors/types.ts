import type { QuestionType } from '@/models/Question';
import type { UserType } from '@/models/User';

export type Axis = QuestionType['axis'];

export const AXES: Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
];

export type VectorAnswerInput = {
  qid: string;
  ui: number;
};

export type VectorQuestion = {
  axis: Axis;
  facet: string;
  map: number[];
  weight: number;
  polarity: QuestionType['polarity'] | 'neutral';
};

export type VectorQuestionSource = VectorQuestion & {
  id?: string;
  _id?: string;
};

export type VectorDelta = {
  answeredCount: number;
  matchedCount: number;
  perAxisMatchedCount: Partial<Record<Axis, number>>;
  perAxisSumWeights: Partial<Record<Axis, number>>;
  levelDeltaByAxis: Partial<Record<Axis, number>>;
  positivesByAxis: Partial<Record<Axis, string[]>>;
  negativesByAxis: Partial<Record<Axis, string[]>>;
};

export type ApplyContext = Pick<UserType, 'vectors'>;

export type VectorUpdatePolicy = {
  alphaBase: number;
  maxStepPerSubmit: number;
  confidenceK: number;
  edgeDiminishMin: number;
};

export const DEFAULT_VECTOR_UPDATE_POLICY: VectorUpdatePolicy = {
  alphaBase: 0.12,
  maxStepPerSubmit: 0.08,
  confidenceK: 12,
  edgeDiminishMin: 0.35,
};

export type UserVectorApplyResult = {
  levelsByAxis: Record<Axis, number>;
  setLevels: Record<string, number>;
  addToSet: Record<string, { $each: string[] }>;
  appliedStepByAxis: Partial<Record<Axis, number>>;
  clampedAxes: Axis[];
  confidence: number;
  alphaBase: number;
  maxStepPerSubmit: number;
  effectiveAlpha: number;
};
