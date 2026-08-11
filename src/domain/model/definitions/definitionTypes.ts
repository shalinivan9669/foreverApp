import type {
  PairStrategyDefinition,
  RelationshipContext,
} from '@/domain/model/pair/strategyTypes';
import type {
  FactorType,
  SkillLevel,
  ValueSchema,
} from '@/domain/model/values/factorValue';

export type DefinitionLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export type PrivacyClass =
  | 'NORMAL'
  | 'PRIVATE'
  | 'SENSITIVE'
  | 'MATCHING_ONLY';

export type DevelopmentPolicy =
  | 'NO_IMPROVEMENT'
  | 'TRAINABLE'
  | 'STATE_MANAGEMENT'
  | 'REFLECTION_ONLY'
  | 'NEGOTIABLE'
  | 'FIXED_CONSTRAINT';

export type SemanticPole = {
  key: string;
  label: string;
};

export type FactorSemantics =
  | {
      kind: 'BIPOLAR';
      lowPole: SemanticPole;
      midpointLabel: string;
      highPole: SemanticPole;
      interpretation: 'NON_EVALUATIVE';
    }
  | {
      kind: 'ORDERED';
      lowPole: SemanticPole;
      highPole: SemanticPole;
      labels: readonly SemanticPole[];
      interpretation:
        | 'CAPABILITY'
        | 'STATE_INTENSITY'
        | 'AVAILABILITY'
        | 'CONNECTION';
    }
  | {
      kind: 'CATEGORICAL';
      labels: readonly SemanticPole[];
      interpretation: 'NON_ORDINAL';
    };

export type ConfidenceRequirements = {
  minimumEvidenceReliability: number;
  minimumSnapshotConfidence: number;
  minimumPairConfidence: number;
};

export type FreshnessPolicy =
  | { type: 'NON_EXPIRING' }
  | {
      type: 'DECAY';
      halfLifeDays: number;
      expiresAfterDays: number;
    };

export type FactorDisplayKeys = {
  titleKey: string;
  descriptionKey: string;
  explanationKey: string;
};

export type EvidenceSourceType =
  | 'QUESTIONNAIRE'
  | 'CHECK_IN'
  | 'TASK'
  | 'TASK_RESULT'
  | 'REFLECTION'
  | 'EXPLICIT_PROFILE'
  | 'PAIR_ACTIVITY'
  | 'FEEDBACK'
  | 'OBSERVED_OUTCOME';

export type LatestAggregationStrategy = {
  type: 'LATEST';
  minimumEvidence: number;
};

export type WeightedMeanAggregationStrategy = {
  type: 'WEIGHTED_MEAN';
  minimumEvidence: number;
  expectedEvidence: number;
};

export type RecencyWeightedAggregationStrategy = {
  type: 'RECENCY_WEIGHTED';
  minimumEvidence: number;
  expectedEvidence: number;
  halfLifeDays: number;
};

export type MajorityAggregationStrategy = {
  type: 'MAJORITY';
  minimumEvidence: number;
  expectedEvidence: number;
};

export type NonAggregatingStrategy = {
  type: 'NON_AGGREGATING';
  minimumEvidence: 1;
};

export type AggregationStrategy =
  | LatestAggregationStrategy
  | WeightedMeanAggregationStrategy
  | RecencyWeightedAggregationStrategy
  | MajorityAggregationStrategy
  | NonAggregatingStrategy;

export type DomainDefinition = {
  id: string;
  key: string;
  title: string;
  description: string;
  order: number;
  version: number;
};

export type DimensionDefinition = {
  id: string;
  key: string;
  domainKey: string;
  title: string;
  description: string;
  order: number;
  version: number;
};

export type FactorDefinition = {
  id: string;
  key: string;
  domainKey: string;
  dimensionKey: string;
  title: string;
  description: string;
  type: FactorType;
  valueSchema: ValueSchema;
  semantics: FactorSemantics;
  aggregationStrategy: AggregationStrategy;
  developmentPolicy: DevelopmentPolicy;
  pairStrategies: readonly PairStrategyDefinition[];
  privacyClass: PrivacyClass;
  contexts: readonly RelationshipContext[];
  confidenceRequirements: ConfidenceRequirements;
  freshnessPolicy: FreshnessPolicy;
  displayKeys: FactorDisplayKeys;
  definitionVersion: number;
};

export type NormalizationRule =
  | { type: 'IDENTITY' }
  | {
      type: 'LINEAR_SCALE';
      inputMin: number;
      inputMax: number;
      outputMin: number;
      outputMax: number;
    }
  | { type: 'REVERSE_SCALAR'; min: number; max: number };

export type MeasurementDefinition = {
  id: string;
  key: string;
  factorKey: string;
  sourceType: EvidenceSourceType;
  valueSchema: ValueSchema;
  normalization: NormalizationRule;
  reliability: number;
  measurementVersion: number;
};

export type InstrumentDefinition = {
  id: string;
  key: string;
  title: string;
  context: RelationshipContext;
  measurementKeys: readonly string[];
  instrumentVersion: number;
};

export type ActionContraindication =
  | {
      type: 'FACTOR_AT_OR_ABOVE';
      factorKey: string;
      threshold: number;
    }
  | {
      type: 'FACTOR_AT_OR_BELOW';
      factorKey: string;
      threshold: number;
    }
  | {
      type: 'FACTOR_STATUS';
      factorKey: string;
      status: 'MISSING' | 'INVALID' | 'UNKNOWN' | 'INSUFFICIENT_DATA';
    };

export type ActionDefinition = {
  id: string;
  key: string;
  title: string;
  description: string;
  targetFactors: readonly string[];
  minimumSkillLevel?: SkillLevel;
  minimumSkillFactorKey?: string;
  contexts: readonly RelationshipContext[];
  expectedOutcomes: readonly string[];
  contraindications: readonly ActionContraindication[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  durationMinutes: number;
  cooldownDays: number;
  feedbackSchemaKey: 'activity-feedback-v2';
  publicationVersion: number;
  actionVersion: number;
};

export type FactorRegistryDefinitionSet = {
  domains: readonly DomainDefinition[];
  dimensions: readonly DimensionDefinition[];
  factors: readonly FactorDefinition[];
  measurements: readonly MeasurementDefinition[];
  instruments: readonly InstrumentDefinition[];
  actions: readonly ActionDefinition[];
};

export type FactorRegistryRelease = FactorRegistryDefinitionSet & {
  registryKey: string;
  registryVersion: number;
  algorithmVersion: number;
  snapshotVersion: number;
  displayVersion: number;
  status: DefinitionLifecycleStatus;
  hash: string;
};

export type UnhashedFactorRegistryRelease = Omit<FactorRegistryRelease, 'hash'>;
