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
};

export type VectorQuestionSource = VectorQuestion & {
  id?: string;
  _id?: string;
};

export type VectorDelta = {
  answeredCount: number;
  matchedCount: number;
  levelDeltaByAxis: Partial<Record<Axis, number>>;
  positivesByAxis: Partial<Record<Axis, string[]>>;
  negativesByAxis: Partial<Record<Axis, string[]>>;
};

export type ApplyContext = Pick<UserType, 'vectors'>;

export type UserVectorApplyResult = {
  levelsByAxis: Record<Axis, number>;
  setLevels: Record<string, number>;
  addToSet: Record<string, { $each: string[] }>;
};
