import type { FactorValue } from '@/domain/model/values/factorValue';

export const RELATIONSHIP_CONTEXTS = [
  'SELF',
  'DATING',
  'EARLY_RELATIONSHIP',
  'COMMITTED_RELATIONSHIP',
  'COHABITATION',
  'MARRIAGE_PLANNING',
  'PARENTING_PLANNING',
  'PARENTING',
] as const;

export type RelationshipContext = (typeof RELATIONSHIP_CONTEXTS)[number];

export const PAIR_STRATEGY_TYPES = [
  'SIMILARITY',
  'BOUNDED_GAP',
  'TARGET_RANGE',
  'COMPLEMENT',
  'BOUNDED_COMPLEMENT',
  'MINIMUM_BOTH',
  'ROLE_COVERAGE',
  'DIRECTIONAL_EXPECTATION',
  'CUSTOM_MATRIX',
  'HARD_CONSTRAINT',
] as const;

export type PairStrategyType = (typeof PAIR_STRATEGY_TYPES)[number];

export const PAIR_STRATEGY_DIRECTIONALITIES = [
  'SYMMETRIC',
  'DIRECTIONAL',
] as const;

export type PairStrategyDirectionality =
  (typeof PAIR_STRATEGY_DIRECTIONALITIES)[number];

export type SimilarityStrategyConfig = {
  type: 'SIMILARITY';
  maximumDistance: number;
};

export type BoundedGapStrategyConfig = {
  type: 'BOUNDED_GAP';
  comfortableGap: number;
  maximumGap: number;
};

export type TargetRangeStrategyConfig = {
  type: 'TARGET_RANGE';
  targetMin: number;
  targetMax: number;
};

export type ComplementStrategyConfig = {
  type: 'COMPLEMENT';
  idealGap: number;
  tolerance: number;
};

export type BoundedComplementStrategyConfig = {
  type: 'BOUNDED_COMPLEMENT';
  minimumUsefulGap: number;
  idealGap: number;
  maximumGap: number;
};

export type MinimumBothStrategyConfig = {
  type: 'MINIMUM_BOTH';
  minimum: number;
};

export type RoleCoverageStrategyConfig = {
  type: 'ROLE_COVERAGE';
  minimumCoverage: number;
  maximumLoadImbalance: number;
};

export type DirectionalExpectationStrategyConfig = {
  type: 'DIRECTIONAL_EXPECTATION';
  maximumDistanceFromRange: number;
};

export type MatrixResultStatus =
  | 'ALIGNED'
  | 'COMPLEMENTARY'
  | 'WORKABLE_DIFFERENCE'
  | 'TENSION';

export type CustomMatrixEntry = {
  a: string;
  b: string;
  fit: number;
  status: MatrixResultStatus;
};

export type CustomMatrixStrategyConfig = {
  type: 'CUSTOM_MATRIX';
  entries: readonly CustomMatrixEntry[];
};

export type HardConstraintPair = {
  a: string;
  b: string;
};

export type HardConstraintStrategyConfig = {
  type: 'HARD_CONSTRAINT';
  allowedPairs: readonly HardConstraintPair[];
};

export type PairStrategyConfig =
  | SimilarityStrategyConfig
  | BoundedGapStrategyConfig
  | TargetRangeStrategyConfig
  | ComplementStrategyConfig
  | BoundedComplementStrategyConfig
  | MinimumBothStrategyConfig
  | RoleCoverageStrategyConfig
  | DirectionalExpectationStrategyConfig
  | CustomMatrixStrategyConfig
  | HardConstraintStrategyConfig;

export type PairActionability =
  | 'NONE'
  | 'AWARENESS'
  | 'NEGOTIATION'
  | 'SKILL_BUILDING'
  | 'ROLE_REDISTRIBUTION'
  | 'DECISION_REQUIRED';

export type PairStrategyDefinition = {
  strategyVersion: number;
  directionality: PairStrategyDirectionality;
  context: RelationshipContext;
  config: PairStrategyConfig;
  minimumConfidence: number;
  actionability: PairActionability;
};

export type PairFactorInput = {
  value: FactorValue;
  confidence: number;
};

export type DirectionalExpectation = {
  minimum: number;
  maximum: number;
};

export type RoleContribution = {
  roleKey: string;
  preference01: number;
  capability01: number;
  load01: number;
};

export type RoleCoverageContext = {
  partnerA: readonly RoleContribution[];
  partnerB: readonly RoleContribution[];
  fairnessConfidence: number;
};

export type PairEvaluationContext = {
  relationshipContext: RelationshipContext;
  directional?: {
    desiredByA: DirectionalExpectation;
    desiredByB: DirectionalExpectation;
  };
  roleCoverage?: RoleCoverageContext;
};

export type PairEvaluationStatus =
  | 'ALIGNED'
  | 'COMPLEMENTARY'
  | 'WORKABLE_DIFFERENCE'
  | 'TENSION'
  | 'CONSTRAINT_CONFLICT'
  | 'REQUIRES_DISCUSSION'
  | 'INSUFFICIENT_DATA';

export type PairEvaluationReasonCode =
  | 'INPUT_MISSING'
  | 'INPUT_INVALID'
  | 'INPUT_UNKNOWN'
  | 'INPUT_INSUFFICIENT_DATA'
  | 'STRATEGY_DEFINITION_INVALID'
  | 'RELATIONSHIP_CONTEXT_MISMATCH'
  | 'CONFIDENCE_BELOW_MINIMUM'
  | 'VALUE_TYPE_UNSUPPORTED'
  | 'VALUES_ALIGNED'
  | 'VALUES_DIFFER'
  | 'GAP_WITHIN_COMFORT'
  | 'GAP_WORKABLE'
  | 'GAP_EXCEEDS_BOUND'
  | 'TARGET_RANGE_MET'
  | 'TARGET_RANGE_MISSED'
  | 'COMPLEMENT_IDEAL'
  | 'COMPLEMENT_WORKABLE'
  | 'COMPLEMENT_OUTSIDE_BOUND'
  | 'BOTH_MINIMUM_MET'
  | 'ONE_OR_BOTH_BELOW_MINIMUM'
  | 'ROLE_COVERAGE_MET'
  | 'ROLE_COVERAGE_GAP'
  | 'ROLE_LOAD_IMBALANCE'
  | 'ROLE_CONTEXT_MISSING'
  | 'ROLE_CONTEXT_INVALID'
  | 'DIRECTIONAL_EXPECTATIONS_MET'
  | 'DIRECTIONAL_EXPECTATION_ONE_SIDED'
  | 'DIRECTIONAL_CONTEXT_MISSING'
  | 'DIRECTIONAL_CONTEXT_INVALID'
  | 'CUSTOM_MATRIX_MATCH'
  | 'CUSTOM_MATRIX_ENTRY_MISSING'
  | 'HARD_CONSTRAINT_ALLOWED'
  | 'HARD_CONSTRAINT_CONFLICT'
  | 'HARD_CONSTRAINT_REQUIRES_DISCUSSION';

export type PairStrategyEvaluation = {
  strategy: PairStrategyType;
  context: RelationshipContext;
  status: PairEvaluationStatus;
  internalFit?: number;
  confidence: number;
  reasonCodes: readonly PairEvaluationReasonCode[];
  actionability: PairActionability;
  directionalFit?: {
    aAcceptsB: number;
    bAcceptsA: number;
  };
  roleMetrics?: {
    coverage: number;
    loadImbalance: number;
    preferenceSatisfaction: number;
  };
};

export type PairStrategyValidation =
  | { valid: true }
  | { valid: false; reasonCodes: readonly string[] };
