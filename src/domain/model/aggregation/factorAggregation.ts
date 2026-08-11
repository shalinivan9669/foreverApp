import type {
  AggregationStrategy,
  FactorDefinition,
} from '@/domain/model/definitions/definitionTypes';
import type {
  AcceptedEvidenceEvent,
  EvidenceEvent,
} from '@/domain/model/evidence/evidence';
import {
  factorValueCanonicalKey,
  isAvailableFactorValue,
  skillLevelForScore,
  validateFactorValue,
  type AvailableFactorValue,
  type FactorValue,
} from '@/domain/model/values/factorValue';

export type FactorAggregationStatus =
  | 'AVAILABLE'
  | 'MISSING'
  | 'INVALID'
  | 'UNKNOWN'
  | 'INSUFFICIENT_DATA';

export type FactorAggregationMetrics = {
  confidence: number;
  coverage: number;
  freshness: number;
  consistency: number;
  evidenceCount: number;
};

export type FactorAggregationResult = {
  factorKey: string;
  status: FactorAggregationStatus;
  value: FactorValue;
  metrics: FactorAggregationMetrics;
  evidenceIds: readonly string[];
  reasonCodes: readonly (
    | 'NO_EVIDENCE'
    | 'ONLY_INVALID_EVIDENCE'
    | 'ONLY_UNKNOWN_EVIDENCE'
    | 'TOO_FEW_EVIDENCE'
    | 'ZERO_EFFECTIVE_WEIGHT'
    | 'EVIDENCE_RELIABILITY_BELOW_MINIMUM'
    | 'EVIDENCE_EXPIRED'
    | 'SNAPSHOT_CONFIDENCE_BELOW_MINIMUM'
    | 'INCOMPATIBLE_DEFINITION_VERSION'
    | 'VALUE_KIND_MISMATCH'
    | 'AGGREGATED'
  )[];
};

type WeightedEvidence = {
  event: AcceptedEvidenceEvent;
  value: AvailableFactorValue;
  weight: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const FACTOR_EVIDENCE_SELECTION_MINIMUM = 8;
export const FACTOR_EVIDENCE_SELECTION_MAXIMUM = 64;
const FACTOR_EVIDENCE_EXPECTED_HEADROOM = 8;

const minimumEvidence = (strategy: AggregationStrategy): number =>
  strategy.minimumEvidence;

const expectedEvidence = (strategy: AggregationStrategy): number => {
  switch (strategy.type) {
    case 'LATEST':
    case 'NON_AGGREGATING':
      return strategy.minimumEvidence;
    case 'WEIGHTED_MEAN':
    case 'RECENCY_WEIGHTED':
    case 'MAJORITY':
      return strategy.expectedEvidence;
  }
};

export type FactorEvidenceSelectionWindow = {
  evidenceCutoffAt: Date;
  earliestObservedAt?: Date;
  maximumEvents: number;
};

/**
 * Bounds persistence reads without teaching repositories individual factor keys.
 * The registry's expected evidence count supplies headroom for noisy/repeated
 * observations, while DECAY expiry supplies a semantically safe time horizon.
 */
export const factorEvidenceSelectionWindow = (
  factor: FactorDefinition,
  evidenceCutoffAt: Date
): FactorEvidenceSelectionWindow => {
  const cutoffTimestamp = evidenceCutoffAt.getTime();
  if (!Number.isFinite(cutoffTimestamp)) {
    throw new RangeError('EVIDENCE_CUTOFF_TIME_INVALID');
  }
  const maximumEvents = Math.min(
    FACTOR_EVIDENCE_SELECTION_MAXIMUM,
    Math.max(
      FACTOR_EVIDENCE_SELECTION_MINIMUM,
      expectedEvidence(factor.aggregationStrategy) *
        FACTOR_EVIDENCE_EXPECTED_HEADROOM
    )
  );
  return {
    evidenceCutoffAt: new Date(cutoffTimestamp),
    ...(factor.freshnessPolicy.type === 'DECAY'
      ? {
          earliestObservedAt: new Date(
            cutoffTimestamp -
              factor.freshnessPolicy.expiresAfterDays * DAY_MS
          ),
        }
      : {}),
    maximumEvents,
  };
};

const recencyWeight = (
  observedAt: Date,
  calculatedAt: Date,
  halfLife: number
): number => {
  const ageDays = Math.max(0, calculatedAt.getTime() - observedAt.getTime()) / DAY_MS;
  return 2 ** (-ageDays / halfLife);
};

const ageDaysAt = (observedAt: Date, calculatedAt: Date): number =>
  Math.max(0, calculatedAt.getTime() - observedAt.getTime()) / DAY_MS;

const freshnessFor = (
  factor: FactorDefinition,
  observedAt: Date,
  calculatedAt: Date
): number =>
  factor.freshnessPolicy.type === 'NON_EXPIRING'
    ? 1
    : recencyWeight(
        observedAt,
        calculatedAt,
        factor.freshnessPolicy.halfLifeDays
      );

const weightFor = (
  event: AcceptedEvidenceEvent,
  factor: FactorDefinition,
  calculatedAt: Date
): number => {
  const recency = factor.aggregationStrategy.type === 'RECENCY_WEIGHTED'
    ? recencyWeight(
        event.observedAt,
        calculatedAt,
        factor.aggregationStrategy.halfLifeDays
      )
    : 1;
  return event.reliability * recency;
};

const weightedAverage = (
  evidence: readonly WeightedEvidence[],
  valueFor: (item: AvailableFactorValue) => number
): number => {
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  if (!(totalWeight > 0)) throw new TypeError('ZERO_EFFECTIVE_WEIGHT');
  return evidence.reduce(
    (sum, item) => sum + valueFor(item.value) * item.weight,
    0
  ) / totalWeight;
};

const numeric = (value: AvailableFactorValue): number => {
  switch (value.kind) {
    case 'SCALAR':
      return value.value;
    case 'BOOLEAN':
      return value.value ? 1 : 0;
    case 'RANGE':
      return (value.low + value.high) / 2;
    case 'MASTERY':
      return value.score01;
    case 'ORDINAL':
      return value.rank;
    case 'CATEGORY':
    case 'CONSTRAINT':
    case 'SET':
    case 'TEXT':
      throw new TypeError('NON_NUMERIC_FACTOR_VALUE');
  }
};

const majority = (evidence: readonly WeightedEvidence[]): AvailableFactorValue => {
  const byValue = new Map<string, { value: AvailableFactorValue; weight: number }>();
  for (const item of evidence) {
    const key = factorValueCanonicalKey(item.value);
    const current = byValue.get(key);
    byValue.set(key, {
      value: item.value,
      weight: (current?.weight ?? 0) + item.weight,
    });
  }
  return [...byValue.entries()]
    .sort((a, b) => b[1].weight - a[1].weight || a[0].localeCompare(b[0]))[0][1]
    .value;
};

const aggregateAvailableValues = (
  factor: FactorDefinition,
  evidence: readonly WeightedEvidence[]
): FactorValue => {
  const latest = [...evidence].sort(
    (a, b) =>
      b.event.observedAt.getTime() - a.event.observedAt.getTime() ||
      b.event.eventId.localeCompare(a.event.eventId)
  )[0];
  if (
    factor.aggregationStrategy.type === 'LATEST' ||
    factor.aggregationStrategy.type === 'NON_AGGREGATING'
  ) {
    return latest.value;
  }
  if (factor.aggregationStrategy.type === 'MAJORITY') return majority(evidence);

  switch (factor.valueSchema.type) {
    case 'SCALAR':
      return { kind: 'SCALAR', value: weightedAverage(evidence, numeric) };
    case 'BOOLEAN':
      return { kind: 'BOOLEAN', value: weightedAverage(evidence, numeric) >= 0.5 };
    case 'CATEGORY':
    case 'TEXT':
      return majority(evidence);
    case 'ORDINAL': {
      const meanRank = weightedAverage(evidence, numeric);
      const level = [...factor.valueSchema.levels].sort(
        (left, right) =>
          Math.abs(left.rank - meanRank) - Math.abs(right.rank - meanRank) ||
          left.rank - right.rank ||
          left.value.localeCompare(right.value)
      )[0];
      if (!level) throw new TypeError('ORDINAL_LEVELS_EMPTY');
      return { kind: 'ORDINAL', value: level.value, rank: level.rank };
    }
    case 'CONSTRAINT':
      throw new TypeError('CONSTRAINT_AGGREGATION_STRATEGY_INVALID');
    case 'RANGE':
      return {
        kind: 'RANGE',
        low: weightedAverage(evidence, (value) =>
          value.kind === 'RANGE' ? value.low : numeric(value)
        ),
        high: weightedAverage(evidence, (value) =>
          value.kind === 'RANGE' ? value.high : numeric(value)
        ),
      };
    case 'MASTERY': {
      const score01 = clamp01(weightedAverage(evidence, numeric));
      return {
        kind: 'MASTERY',
        score01,
        level: skillLevelForScore(score01, factor.valueSchema),
      };
    }
    case 'SET': {
      const weights = new Map<string, number>();
      const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
      for (const item of evidence) {
        if (item.value.kind !== 'SET') continue;
        for (const value of item.value.values) {
          weights.set(value, (weights.get(value) ?? 0) + item.weight);
        }
      }
      const values = [...weights.entries()]
        .filter((entry) => entry[1] >= totalWeight / 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, factor.valueSchema.maxItems)
        .map((entry) => entry[0])
        .sort();
      return values.length >= factor.valueSchema.minItems
        ? { kind: 'SET', values }
        : latest.value;
    }
  }
};

const consistencyFor = (
  factor: FactorDefinition,
  evidence: readonly WeightedEvidence[]
): number => {
  if (evidence.length <= 1) return 1;
  if (
    factor.valueSchema.type === 'CATEGORY' ||
    factor.valueSchema.type === 'CONSTRAINT' ||
    factor.valueSchema.type === 'BOOLEAN' ||
    factor.valueSchema.type === 'SET' ||
    factor.valueSchema.type === 'TEXT'
  ) {
    const weights = new Map<string, number>();
    let total = 0;
    for (const item of evidence) {
      const key = factorValueCanonicalKey(item.value);
      weights.set(key, (weights.get(key) ?? 0) + item.weight);
      total += item.weight;
    }
    return total === 0 ? 0 : Math.max(...weights.values()) / total;
  }
  const mean = weightedAverage(evidence, numeric);
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  const variance = totalWeight === 0
    ? 0
    : evidence.reduce(
        (sum, item) => sum + (numeric(item.value) - mean) ** 2 * item.weight,
        0
      ) / totalWeight;
  const span =
    factor.valueSchema.type === 'SCALAR' || factor.valueSchema.type === 'RANGE'
      ? factor.valueSchema.max - factor.valueSchema.min
      : factor.valueSchema.type === 'ORDINAL'
        ? Math.max(...factor.valueSchema.levels.map((level) => level.rank)) -
          Math.min(...factor.valueSchema.levels.map((level) => level.rank))
        : 1;
  return clamp01(1 - Math.sqrt(variance) / Math.max(span, Number.EPSILON));
};

const unavailable = (
  factorKey: string,
  status: Exclude<FactorAggregationStatus, 'AVAILABLE'>,
  value: FactorValue,
  evidenceCount: number,
  reasonCode: FactorAggregationResult['reasonCodes'][number]
): FactorAggregationResult => ({
  factorKey,
  status,
  value,
  metrics: {
    confidence: 0,
    coverage: 0,
    freshness: 0,
    consistency: 0,
    evidenceCount,
  },
  evidenceIds: [],
  reasonCodes: [reasonCode],
});

export function aggregateFactorEvidence(
  factor: FactorDefinition,
  events: readonly EvidenceEvent[],
  calculatedAt: Date,
  evidenceCutoffAt: Date = calculatedAt
): FactorAggregationResult {
  const cutoffTimestamp = evidenceCutoffAt.getTime();
  if (!Number.isFinite(cutoffTimestamp)) {
    throw new RangeError('EVIDENCE_CUTOFF_TIME_INVALID');
  }
  const relevant = events.filter(
    (event): event is AcceptedEvidenceEvent =>
      event.factorKey === factor.key &&
      event.status === 'ACCEPTED' &&
      event.observedAt.getTime() <= cutoffTimestamp &&
      event.recordedAt.getTime() <= cutoffTimestamp
  );
  if (relevant.length === 0) {
    return unavailable(
      factor.key,
      'MISSING',
      { kind: 'MISSING', reasonCode: 'NO_EVIDENCE' },
      0,
      'NO_EVIDENCE'
    );
  }
  const compatible = relevant.filter(
    (event) => event.versions.definitionVersion === factor.definitionVersion
  );
  if (compatible.length !== relevant.length) {
    return unavailable(
      factor.key,
      'INSUFFICIENT_DATA',
      { kind: 'INSUFFICIENT_DATA', reasonCode: 'INCOMPATIBLE_EVIDENCE' },
      relevant.length,
      'INCOMPATIBLE_DEFINITION_VERSION'
    );
  }

  const available: WeightedEvidence[] = [];
  let hasUnknown = false;
  let hasInvalid = false;
  let hasLowReliability = false;
  for (const event of compatible) {
    if (event.normalizedValue.kind === 'UNKNOWN') hasUnknown = true;
    if (event.normalizedValue.kind === 'INVALID') hasInvalid = true;
    const validation = validateFactorValue(factor.valueSchema, event.normalizedValue);
    if (!validation.valid) {
      hasInvalid = true;
      continue;
    }
    if (isAvailableFactorValue(validation.value)) {
      if (
        event.reliability <
        factor.confidenceRequirements.minimumEvidenceReliability
      ) {
        hasLowReliability = true;
        continue;
      }
      available.push({
        event,
        value: validation.value,
        weight: weightFor(event, factor, calculatedAt),
      });
    }
  }

  if (available.length === 0) {
    if (hasLowReliability) {
      return unavailable(
        factor.key,
        'INSUFFICIENT_DATA',
        { kind: 'INSUFFICIENT_DATA', reasonCode: 'LOW_CONFIDENCE' },
        compatible.length,
        'EVIDENCE_RELIABILITY_BELOW_MINIMUM'
      );
    }
    if (hasInvalid) {
      return unavailable(
        factor.key,
        'INVALID',
        { kind: 'INVALID', reasonCode: 'TYPE_MISMATCH' },
        compatible.length,
        'ONLY_INVALID_EVIDENCE'
      );
    }
    if (hasUnknown) {
      return unavailable(
        factor.key,
        'UNKNOWN',
        { kind: 'UNKNOWN', reasonCode: 'UNRESOLVED' },
        compatible.length,
        'ONLY_UNKNOWN_EVIDENCE'
      );
    }
    return unavailable(
      factor.key,
      'MISSING',
      { kind: 'MISSING', reasonCode: 'NO_EVIDENCE' },
      compatible.length,
      'NO_EVIDENCE'
    );
  }

  if (available.length < minimumEvidence(factor.aggregationStrategy)) {
    return unavailable(
      factor.key,
      'INSUFFICIENT_DATA',
      { kind: 'INSUFFICIENT_DATA', reasonCode: 'TOO_FEW_EVIDENCE' },
      available.length,
      'TOO_FEW_EVIDENCE'
    );
  }

  const valueKinds = new Set(available.map((item) => item.value.kind));
  if (valueKinds.size !== 1 || !valueKinds.has(factor.valueSchema.type)) {
    return unavailable(
      factor.key,
      'INVALID',
      { kind: 'INVALID', reasonCode: 'TYPE_MISMATCH' },
      available.length,
      'VALUE_KIND_MISMATCH'
    );
  }

  const newest = Math.max(...available.map((item) => item.event.observedAt.getTime()));
  const newestObservedAt = new Date(newest);
  if (
    factor.freshnessPolicy.type === 'DECAY' &&
    ageDaysAt(newestObservedAt, calculatedAt) >=
      factor.freshnessPolicy.expiresAfterDays
  ) {
    return unavailable(
      factor.key,
      'MISSING',
      { kind: 'MISSING', reasonCode: 'EXPIRED' },
      available.length,
      'EVIDENCE_EXPIRED'
    );
  }

  const totalEffectiveWeight = available.reduce(
    (sum, item) => sum + item.weight,
    0
  );
  if (!(totalEffectiveWeight > 0)) {
    return unavailable(
      factor.key,
      'INSUFFICIENT_DATA',
      { kind: 'INSUFFICIENT_DATA', reasonCode: 'LOW_CONFIDENCE' },
      available.length,
      'ZERO_EFFECTIVE_WEIGHT'
    );
  }

  const freshness = freshnessFor(factor, newestObservedAt, calculatedAt);
  const coverage = clamp01(
    available.length / expectedEvidence(factor.aggregationStrategy)
  );
  const consistency = consistencyFor(factor, available);
  const meanReliability = averageReliability(available);
  const confidence = clamp01(
    meanReliability *
      (0.25 + 0.75 * coverage) *
      freshness *
      (0.5 + 0.5 * consistency)
  );
  if (confidence < factor.confidenceRequirements.minimumSnapshotConfidence) {
    return unavailable(
      factor.key,
      'INSUFFICIENT_DATA',
      { kind: 'INSUFFICIENT_DATA', reasonCode: 'LOW_CONFIDENCE' },
      available.length,
      'SNAPSHOT_CONFIDENCE_BELOW_MINIMUM'
    );
  }

  return {
    factorKey: factor.key,
    status: 'AVAILABLE',
    value: aggregateAvailableValues(factor, available),
    metrics: {
      confidence,
      coverage,
      freshness,
      consistency,
      evidenceCount: available.length,
    },
    evidenceIds: available.map((item) => item.event.eventId).sort(),
    reasonCodes: ['AGGREGATED'],
  };
}

const averageReliability = (evidence: readonly WeightedEvidence[]): number =>
  evidence.length === 0
    ? 0
    : evidence.reduce((sum, item) => sum + item.event.reliability, 0) /
      evidence.length;
