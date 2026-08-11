import { Schema } from 'mongoose';
import type {
  FactorValue,
  FactorValueKind,
  InsufficientDataFactorValue,
  InvalidFactorValue,
  MissingFactorValue,
  SkillLevel,
  UnknownFactorValue,
} from '@/domain/model/values/factorValue';
import type {
  FactorAggregationMetrics,
  FactorAggregationStatus,
} from '@/domain/model/aggregation/factorAggregation';
import type {
  PairActionability,
  PairEvaluationReasonCode,
  PairEvaluationStatus,
  PairStrategyType,
  RelationshipContext,
} from '@/domain/model/pair/strategyTypes';
import {
  canonicalSnapshotCalculatedAt,
  type SnapshotVersions,
} from '@/domain/model/snapshots/snapshots';
import type { EvidenceVersions } from '@/domain/model/evidence/evidence';

export type StoredFactorValue = {
  kind: FactorValueKind;
  scalarValue?: number;
  booleanValue?: boolean;
  categoryValue?: string;
  ordinalValue?: string;
  ordinalRank?: number;
  constraintValue?: string;
  rangeLow?: number;
  rangeHigh?: number;
  score01?: number;
  skillLevel?: SkillLevel;
  setValues?: string[];
  textValue?: string;
  reasonCode?: string;
};

export class StoredFactorValueValidationError extends Error {
  readonly reasonCode:
    | 'REQUIRED_FIELD_MISSING'
    | 'NUMBER_NOT_FINITE'
    | 'RANGE_INVALID'
    | 'MASTERY_INVALID'
    | 'SET_INVALID'
    | 'REASON_CODE_INVALID';

  constructor(reasonCode: StoredFactorValueValidationError['reasonCode']) {
    super(reasonCode);
    this.name = 'StoredFactorValueValidationError';
    this.reasonCode = reasonCode;
  }
}

const missingReasonCodes: readonly MissingFactorValue['reasonCode'][] = [
  'NOT_PROVIDED',
  'NO_EVIDENCE',
  'EXPIRED',
];
const invalidReasonCodes: readonly InvalidFactorValue['reasonCode'][] = [
  'TYPE_MISMATCH',
  'OUT_OF_RANGE',
  'INVALID_RANGE',
  'VALUE_NOT_ALLOWED',
  'INVALID_ORDINAL_RANK',
  'INVALID_CARDINALITY',
  'INVALID_SKILL_LEVEL',
  'EMPTY_VALUE',
];
const unknownReasonCodes: readonly UnknownFactorValue['reasonCode'][] = [
  'NOT_ANSWERED',
  'DECLINED_TO_ANSWER',
  'NOT_APPLICABLE',
  'UNRESOLVED',
];
const insufficientReasonCodes: readonly InsufficientDataFactorValue['reasonCode'][] = [
  'TOO_FEW_EVIDENCE',
  'LOW_CONFIDENCE',
  'INCOMPATIBLE_EVIDENCE',
];

const assertReasonCode = <ReasonCode extends string>(
  value: string | undefined,
  allowed: readonly ReasonCode[]
): ReasonCode => {
  if (!value || !(allowed as readonly string[]).includes(value)) {
    throw new StoredFactorValueValidationError('REASON_CODE_INVALID');
  }
  return value as ReasonCode;
};

export function fromStoredFactorValue(value: StoredFactorValue): FactorValue {
  switch (value.kind) {
    case 'SCALAR':
      if (value.scalarValue === undefined) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      if (!Number.isFinite(value.scalarValue)) {
        throw new StoredFactorValueValidationError('NUMBER_NOT_FINITE');
      }
      return { kind: 'SCALAR', value: value.scalarValue };
    case 'BOOLEAN':
      if (value.booleanValue === undefined) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      return { kind: 'BOOLEAN', value: value.booleanValue };
    case 'CATEGORY':
      if (!value.categoryValue) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      return { kind: 'CATEGORY', value: value.categoryValue };
    case 'ORDINAL':
      if (value.ordinalValue === undefined || value.ordinalRank === undefined) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      if (!Number.isInteger(value.ordinalRank)) {
        throw new StoredFactorValueValidationError('NUMBER_NOT_FINITE');
      }
      return {
        kind: 'ORDINAL',
        value: value.ordinalValue,
        rank: value.ordinalRank,
      };
    case 'CONSTRAINT':
      if (!value.constraintValue) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      return { kind: 'CONSTRAINT', value: value.constraintValue };
    case 'RANGE':
      if (value.rangeLow === undefined || value.rangeHigh === undefined) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      if (!Number.isFinite(value.rangeLow) || !Number.isFinite(value.rangeHigh)) {
        throw new StoredFactorValueValidationError('NUMBER_NOT_FINITE');
      }
      if (value.rangeLow > value.rangeHigh) {
        throw new StoredFactorValueValidationError('RANGE_INVALID');
      }
      return { kind: 'RANGE', low: value.rangeLow, high: value.rangeHigh };
    case 'MASTERY':
      if (value.score01 === undefined || !value.skillLevel) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      if (
        !Number.isFinite(value.score01) ||
        value.score01 < 0 ||
        value.score01 > 1
      ) {
        throw new StoredFactorValueValidationError('MASTERY_INVALID');
      }
      return {
        kind: 'MASTERY',
        score01: value.score01,
        level: value.skillLevel,
      };
    case 'SET': {
      if (!value.setValues) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      const distinct = new Set(value.setValues);
      if (distinct.size !== value.setValues.length) {
        throw new StoredFactorValueValidationError('SET_INVALID');
      }
      return { kind: 'SET', values: [...value.setValues].sort() };
    }
    case 'TEXT':
      if (value.textValue === undefined) {
        throw new StoredFactorValueValidationError('REQUIRED_FIELD_MISSING');
      }
      return { kind: 'TEXT', value: value.textValue };
    case 'MISSING':
      return {
        kind: 'MISSING',
        reasonCode: assertReasonCode(value.reasonCode, missingReasonCodes),
      };
    case 'INVALID':
      return {
        kind: 'INVALID',
        reasonCode: assertReasonCode(value.reasonCode, invalidReasonCodes),
      };
    case 'UNKNOWN':
      return {
        kind: 'UNKNOWN',
        reasonCode: assertReasonCode(value.reasonCode, unknownReasonCodes),
      };
    case 'INSUFFICIENT_DATA':
      return {
        kind: 'INSUFFICIENT_DATA',
        reasonCode: assertReasonCode(value.reasonCode, insufficientReasonCodes),
      };
  }
}

export const toStoredFactorValue = (value: FactorValue): StoredFactorValue => {
  switch (value.kind) {
    case 'SCALAR':
      return { kind: value.kind, scalarValue: value.value };
    case 'BOOLEAN':
      return { kind: value.kind, booleanValue: value.value };
    case 'CATEGORY':
      return { kind: value.kind, categoryValue: value.value };
    case 'ORDINAL':
      return {
        kind: value.kind,
        ordinalValue: value.value,
        ordinalRank: value.rank,
      };
    case 'CONSTRAINT':
      return { kind: value.kind, constraintValue: value.value };
    case 'RANGE':
      return { kind: value.kind, rangeLow: value.low, rangeHigh: value.high };
    case 'MASTERY':
      return {
        kind: value.kind,
        score01: value.score01,
        skillLevel: value.level,
      };
    case 'SET':
      return { kind: value.kind, setValues: [...value.values] };
    case 'TEXT':
      return { kind: value.kind, textValue: value.value };
    case 'MISSING':
    case 'INVALID':
    case 'UNKNOWN':
    case 'INSUFFICIENT_DATA':
      return { kind: value.kind, reasonCode: value.reasonCode };
  }
};

const validateStoredFactorValue = (value: StoredFactorValue): boolean => {
  switch (value.kind) {
    case 'SCALAR':
      return Number.isFinite(value.scalarValue);
    case 'BOOLEAN':
      return typeof value.booleanValue === 'boolean';
    case 'CATEGORY':
      return typeof value.categoryValue === 'string';
    case 'ORDINAL':
      return (
        typeof value.ordinalValue === 'string' &&
        Number.isInteger(value.ordinalRank)
      );
    case 'CONSTRAINT':
      return typeof value.constraintValue === 'string';
    case 'RANGE':
      return Number.isFinite(value.rangeLow) &&
        Number.isFinite(value.rangeHigh) &&
        Number(value.rangeLow) <= Number(value.rangeHigh);
    case 'MASTERY':
      return Number.isFinite(value.score01) && Boolean(value.skillLevel);
    case 'SET':
      return Array.isArray(value.setValues);
    case 'TEXT':
      return typeof value.textValue === 'string';
    case 'MISSING':
    case 'INVALID':
    case 'UNKNOWN':
    case 'INSUFFICIENT_DATA':
      return typeof value.reasonCode === 'string';
  }
};

export const FactorValueSchema = new Schema<StoredFactorValue>(
  {
    kind: {
      type: String,
      enum: [
        'SCALAR',
        'BOOLEAN',
        'CATEGORY',
        'ORDINAL',
        'CONSTRAINT',
        'RANGE',
        'MASTERY',
        'SET',
        'TEXT',
        'MISSING',
        'INVALID',
        'UNKNOWN',
        'INSUFFICIENT_DATA',
      ],
      required: true,
      immutable: true,
    },
    scalarValue: { type: Number, immutable: true },
    booleanValue: { type: Boolean, immutable: true },
    categoryValue: { type: String, immutable: true },
    ordinalValue: { type: String, immutable: true },
    ordinalRank: { type: Number, immutable: true },
    constraintValue: { type: String, immutable: true },
    rangeLow: { type: Number, immutable: true },
    rangeHigh: { type: Number, immutable: true },
    score01: { type: Number, min: 0, max: 1, immutable: true },
    skillLevel: {
      type: String,
      enum: ['BASIC', 'INTERMEDIATE', 'ADVANCED'],
      immutable: true,
    },
    setValues: { type: [String], immutable: true },
    textValue: { type: String, immutable: true },
    reasonCode: { type: String, immutable: true },
  },
  { _id: false }
);

FactorValueSchema.path('kind').validate(function () {
  return validateStoredFactorValue(this as StoredFactorValue);
}, 'Stored factor value does not match its discriminator');

export type StoredAggregationMetrics = FactorAggregationMetrics;

export const AggregationMetricsSchema = new Schema<StoredAggregationMetrics>(
  {
    confidence: { type: Number, required: true, min: 0, max: 1, immutable: true },
    coverage: { type: Number, required: true, min: 0, max: 1, immutable: true },
    freshness: { type: Number, required: true, min: 0, max: 1, immutable: true },
    consistency: { type: Number, required: true, min: 0, max: 1, immutable: true },
    evidenceCount: { type: Number, required: true, min: 0, immutable: true },
  },
  { _id: false }
);

export type StoredSnapshotVersions = SnapshotVersions;

export type StoredSnapshotInterval = {
  calculatedAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
};

export const validateStoredSnapshotInterval = (
  interval: StoredSnapshotInterval
): boolean => {
  if (
    !(interval.calculatedAt instanceof Date) ||
    !(interval.effectiveFrom instanceof Date) ||
    (interval.effectiveUntil !== undefined &&
      !(interval.effectiveUntil instanceof Date))
  ) {
    return false;
  }
  const calculatedAt = interval.calculatedAt.getTime();
  const effectiveFrom = interval.effectiveFrom.getTime();
  const effectiveUntil = interval.effectiveUntil?.getTime();
  if (!Number.isFinite(calculatedAt) || !Number.isFinite(effectiveFrom)) {
    return false;
  }
  if (
    calculatedAt !== effectiveFrom ||
    canonicalSnapshotCalculatedAt(interval.calculatedAt).getTime() !==
      calculatedAt
  ) {
    return false;
  }
  return (
    effectiveUntil === undefined ||
    (Number.isFinite(effectiveUntil) && effectiveUntil > effectiveFrom)
  );
};

const SnapshotVersionReferenceSchema = new Schema<
  SnapshotVersions['measurementRefs'][number]
>(
  {
    key: { type: String, required: true, immutable: true },
    version: { type: Number, required: true, min: 1, immutable: true },
  },
  { _id: false }
);

const validateCanonicalVersionReferences = (
  references: SnapshotVersions['measurementRefs']
): boolean =>
  Array.isArray(references) &&
  references.every(
    (reference, index) =>
      Boolean(reference.key.trim()) &&
      Number.isInteger(reference.version) &&
      reference.version >= 1 &&
      (index === 0 ||
        references[index - 1].key.localeCompare(reference.key) < 0 ||
        (references[index - 1].key === reference.key &&
          references[index - 1].version < reference.version))
  );

export const SnapshotVersionsSchema = new Schema<StoredSnapshotVersions>(
  {
    registryVersion: { type: Number, required: true, min: 1, immutable: true },
    definitionVersion: { type: Number, required: true, min: 1, immutable: true },
    algorithmVersion: { type: Number, required: true, min: 1, immutable: true },
    snapshotVersion: { type: Number, required: true, min: 1, immutable: true },
    displayVersion: { type: Number, required: true, min: 1, immutable: true },
    measurementRefs: {
      type: [SnapshotVersionReferenceSchema],
      required: true,
      immutable: true,
      validate: {
        validator: validateCanonicalVersionReferences,
        message: 'Snapshot measurement refs must be sorted and unique',
      },
    },
    instrumentRefs: {
      type: [SnapshotVersionReferenceSchema],
      required: true,
      immutable: true,
      validate: {
        validator: validateCanonicalVersionReferences,
        message: 'Snapshot instrument refs must be sorted and unique',
      },
    },
  },
  { _id: false }
);

export type StoredEvidenceVersions = EvidenceVersions;

export const EvidenceVersionsSchema = new Schema<StoredEvidenceVersions>(
  {
    registryVersion: { type: Number, required: true, min: 1, immutable: true },
    definitionVersion: { type: Number, required: true, min: 1, immutable: true },
    measurementVersion: { type: Number, required: true, min: 1, immutable: true },
    instrumentVersion: { type: Number, required: true, min: 1, immutable: true },
    algorithmVersion: { type: Number, required: true, min: 1, immutable: true },
  },
  { _id: false }
);

export type StoredDirectionalFit = {
  aAcceptsB: number;
  bAcceptsA: number;
};

const DirectionalFitSchema = new Schema<StoredDirectionalFit>(
  {
    aAcceptsB: { type: Number, required: true, min: 0, max: 1, immutable: true },
    bAcceptsA: { type: Number, required: true, min: 0, max: 1, immutable: true },
  },
  { _id: false }
);

export type StoredRoleMetrics = {
  coverage: number;
  loadImbalance: number;
  preferenceSatisfaction: number;
};

const RoleMetricsSchema = new Schema<StoredRoleMetrics>(
  {
    coverage: { type: Number, required: true, min: 0, max: 1, immutable: true },
    loadImbalance: { type: Number, required: true, min: 0, max: 1, immutable: true },
    preferenceSatisfaction: { type: Number, required: true, min: 0, max: 1, immutable: true },
  },
  { _id: false }
);

export type StoredPairEvaluation = {
  strategy: PairStrategyType;
  context: RelationshipContext;
  status: PairEvaluationStatus;
  internalFit?: number;
  confidence: number;
  reasonCodes: PairEvaluationReasonCode[];
  actionability: PairActionability;
  directionalFit?: StoredDirectionalFit;
  roleMetrics?: StoredRoleMetrics;
};

export const PairEvaluationSchema = new Schema<StoredPairEvaluation>(
  {
    strategy: {
      type: String,
      enum: [
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
      ],
      required: true,
      immutable: true,
    },
    context: {
      type: String,
      enum: [
        'SELF',
        'DATING',
        'EARLY_RELATIONSHIP',
        'COMMITTED_RELATIONSHIP',
        'COHABITATION',
        'MARRIAGE_PLANNING',
        'PARENTING_PLANNING',
        'PARENTING',
      ],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: [
        'ALIGNED',
        'COMPLEMENTARY',
        'WORKABLE_DIFFERENCE',
        'TENSION',
        'CONSTRAINT_CONFLICT',
        'REQUIRES_DISCUSSION',
        'INSUFFICIENT_DATA',
      ],
      required: true,
      immutable: true,
    },
    internalFit: { type: Number, min: 0, max: 1, immutable: true },
    confidence: { type: Number, required: true, min: 0, max: 1, immutable: true },
    reasonCodes: { type: [String], required: true, immutable: true },
    actionability: {
      type: String,
      enum: [
        'NONE',
        'AWARENESS',
        'NEGOTIATION',
        'SKILL_BUILDING',
        'ROLE_REDISTRIBUTION',
        'DECISION_REQUIRED',
      ],
      required: true,
      immutable: true,
    },
    directionalFit: { type: DirectionalFitSchema, immutable: true },
    roleMetrics: { type: RoleMetricsSchema, immutable: true },
  },
  { _id: false }
);

export const FACTOR_AGGREGATION_STATUSES: readonly FactorAggregationStatus[] = [
  'AVAILABLE',
  'MISSING',
  'INVALID',
  'UNKNOWN',
  'INSUFFICIENT_DATA',
];
