import { createHash } from 'node:crypto';
import type {
  EvidenceSourceType,
  FactorDefinition,
  InstrumentDefinition,
  MeasurementDefinition,
  PrivacyClass,
} from '@/domain/model/definitions/definitionTypes';
import type { RelationshipContext } from '@/domain/model/pair/strategyTypes';
import {
  isAvailableFactorValue,
  validateFactorValue,
  type FactorValue,
  type InvalidFactorValue,
} from '@/domain/model/values/factorValue';

export type EvidenceSubjectKind = 'INDIVIDUAL' | 'PAIR';
export type EvidenceObservationScope = 'SELF' | 'PAIR_DYAD' | 'OBSERVER_REPORT';
export type EvidencePurpose =
  | 'OWNER_PROFILE'
  | 'PAIR_MODEL'
  | 'MATCHING'
  | 'RECOMMENDATION'
  | 'SAFETY';
export type EvidenceCaptureMode =
  | 'PRIVATE'
  | 'PAIR_MODEL_ONLY'
  | 'SHARED'
  | 'SYSTEM_ONLY';
export type EvidenceRetentionClass =
  | 'OWNER_CONTROLLED'
  | 'PAIR_CONTEXT'
  | 'SAFETY_CRITICAL';

export type EvidenceVersions = {
  registryVersion: number;
  definitionVersion: number;
  measurementVersion: number;
  instrumentVersion: number;
  algorithmVersion: number;
};

type EvidenceEventBase = {
  eventId: string;
  idempotencyKey: string;
  actorId: string;
  subjectKind: EvidenceSubjectKind;
  subjectId: string;
  pairId?: string;
  observationScope: EvidenceObservationScope;
  observedSubjectId?: string;
  factorKey: string;
  measurementKey: string;
  instrumentKey: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  sourceRevision: string;
  sourceHash: string;
  submittedValue: FactorValue;
  reliability: number;
  observedAt: Date;
  recordedAt: Date;
  context: RelationshipContext;
  purpose: EvidencePurpose;
  privacyClass: PrivacyClass;
  captureMode: EvidenceCaptureMode;
  policyVersion: string;
  consentRevision: string;
  retentionClass: EvidenceRetentionClass;
  versions: EvidenceVersions;
  inputHash: string;
};

export type AcceptedEvidenceEvent = EvidenceEventBase & {
  status: 'ACCEPTED';
  normalizedValue: FactorValue;
};

export const EVIDENCE_REJECTION_CODES = [
  'FACTOR_REFERENCE_MISMATCH',
  'SOURCE_TYPE_MISMATCH',
  'MEASUREMENT_VERSION_MISMATCH',
  'INSTRUMENT_REFERENCE_MISMATCH',
  'VALUE_INVALID',
  'NORMALIZATION_UNSUPPORTED',
  'ACTOR_SUBJECT_VIOLATION',
  'PAIR_SUBJECT_VIOLATION',
  'OBSERVER_SCOPE_VIOLATION',
  'RELIABILITY_INVALID',
  'CONTEXT_VIOLATION',
  'PRIVACY_CLASS_MISMATCH',
  'CAPTURE_POLICY_VIOLATION',
  'PROVENANCE_INVALID',
] as const;

export type EvidenceRejectionCode =
  (typeof EVIDENCE_REJECTION_CODES)[number];

export type RejectedEvidenceEvent = EvidenceEventBase & {
  status: 'REJECTED';
  rejectionCode: EvidenceRejectionCode;
};

export type EvidenceEvent = AcceptedEvidenceEvent | RejectedEvidenceEvent;

export type CreateEvidenceEventInput = {
  eventId: string;
  idempotencyKey: string;
  actorId: string;
  subjectKind: EvidenceSubjectKind;
  subjectId: string;
  pairId?: string;
  observationScope: EvidenceObservationScope;
  observedSubjectId?: string;
  factorKey: string;
  measurementKey: string;
  instrumentKey: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  sourceRevision: string;
  submittedValue: FactorValue;
  reliabilityMultiplier: number;
  observedAt: Date;
  recordedAt: Date;
  context: RelationshipContext;
  purpose: EvidencePurpose;
  privacyClass: PrivacyClass;
  captureMode: EvidenceCaptureMode;
  policyVersion: string;
  consentRevision: string;
  retentionClass: EvidenceRetentionClass;
  registryVersion: number;
  algorithmVersion: number;
};

const encodeFactorValue = (value: FactorValue): string => {
  switch (value.kind) {
    case 'SCALAR':
      return `SCALAR:${value.value}`;
    case 'BOOLEAN':
      return `BOOLEAN:${value.value ? '1' : '0'}`;
    case 'CATEGORY':
      return `CATEGORY:${value.value}`;
    case 'ORDINAL':
      return `ORDINAL:${value.rank}:${value.value}`;
    case 'CONSTRAINT':
      return `CONSTRAINT:${value.value}`;
    case 'RANGE':
      return `RANGE:${value.low}:${value.high}`;
    case 'MASTERY':
      return `MASTERY:${value.score01}:${value.level}`;
    case 'SET':
      return `SET:${[...value.values].sort().join(',')}`;
    case 'TEXT':
      return `TEXT:${value.value}`;
    case 'MISSING':
    case 'INVALID':
    case 'UNKNOWN':
    case 'INSUFFICIENT_DATA':
      return `${value.kind}:${value.reasonCode}`;
  }
};

const evidenceSourceHash = (input: CreateEvidenceEventInput): string =>
  createHash('sha256')
    .update(
      [
        input.sourceType,
        input.sourceRef,
        input.sourceRevision,
        encodeFactorValue(input.submittedValue),
      ].join('|')
    )
    .digest('hex');

const evidenceInputHash = (
  input: CreateEvidenceEventInput,
  measurement: MeasurementDefinition,
  instrument: InstrumentDefinition,
  sourceHash: string
): string =>
  createHash('sha256')
    .update(
      [
        input.eventId,
        input.idempotencyKey,
        input.actorId,
        input.subjectKind,
        input.subjectId,
        input.pairId ?? '',
        input.observationScope,
        input.observedSubjectId ?? '',
        input.factorKey,
        input.measurementKey,
        input.instrumentKey,
        input.sourceType,
        input.sourceRef,
        input.sourceRevision,
        sourceHash,
        input.reliabilityMultiplier,
        input.observedAt.toISOString(),
        input.context,
        input.purpose,
        input.privacyClass,
        input.captureMode,
        input.policyVersion,
        input.consentRevision,
        input.retentionClass,
        input.registryVersion,
        input.algorithmVersion,
        measurement.measurementVersion,
        instrument.instrumentVersion,
      ].join('|')
    )
    .digest('hex');

const applyNormalization = (
  value: FactorValue,
  measurement: MeasurementDefinition
): FactorValue | InvalidFactorValue => {
  if (!isAvailableFactorValue(value)) return value;
  switch (measurement.normalization.type) {
    case 'IDENTITY':
      return value;
    case 'LINEAR_SCALE': {
      if (value.kind !== 'SCALAR') {
        return { kind: 'INVALID', reasonCode: 'TYPE_MISMATCH' };
      }
      const rule = measurement.normalization;
      if (rule.inputMax <= rule.inputMin || rule.outputMax <= rule.outputMin) {
        return { kind: 'INVALID', reasonCode: 'INVALID_RANGE' };
      }
      const ratio = (value.value - rule.inputMin) / (rule.inputMax - rule.inputMin);
      return {
        kind: 'SCALAR',
        value: rule.outputMin + ratio * (rule.outputMax - rule.outputMin),
      };
    }
    case 'REVERSE_SCALAR':
      return value.kind === 'SCALAR'
        ? {
            kind: 'SCALAR',
            value:
              measurement.normalization.max +
              measurement.normalization.min -
              value.value,
          }
        : { kind: 'INVALID', reasonCode: 'TYPE_MISMATCH' };
  }
};

const isolationRejection = (
  input: CreateEvidenceEventInput
): EvidenceRejectionCode | undefined => {
  if (input.observationScope === 'SELF') {
    return input.subjectKind === 'INDIVIDUAL' &&
      input.subjectId === input.actorId &&
      !input.observedSubjectId
      ? undefined
      : 'ACTOR_SUBJECT_VIOLATION';
  }
  if (input.observationScope === 'PAIR_DYAD') {
    return input.subjectKind === 'PAIR' &&
      input.pairId === input.subjectId &&
      !input.observedSubjectId
      ? undefined
      : 'PAIR_SUBJECT_VIOLATION';
  }
  return input.subjectKind === 'INDIVIDUAL' &&
    input.subjectId === input.actorId &&
    Boolean(input.observedSubjectId) &&
    input.observedSubjectId !== input.actorId
    ? undefined
    : 'OBSERVER_SCOPE_VIOLATION';
};

const capturePolicyRejection = (
  input: CreateEvidenceEventInput
): EvidenceRejectionCode | undefined => {
  if (
    !input.sourceRef.trim() ||
    !input.sourceRevision.trim() ||
    !input.policyVersion.trim() ||
    !input.consentRevision.trim()
  ) {
    return 'PROVENANCE_INVALID';
  }
  if (input.captureMode === 'PRIVATE') {
    return input.purpose === 'OWNER_PROFILE' &&
      input.retentionClass === 'OWNER_CONTROLLED'
      ? undefined
      : 'CAPTURE_POLICY_VIOLATION';
  }
  if (input.captureMode === 'PAIR_MODEL_ONLY') {
    return (input.purpose === 'PAIR_MODEL' ||
      input.purpose === 'RECOMMENDATION' ||
      input.purpose === 'MATCHING') &&
      input.retentionClass ===
        (input.pairId ? 'PAIR_CONTEXT' : 'OWNER_CONTROLLED')
      ? undefined
      : 'CAPTURE_POLICY_VIOLATION';
  }
  if (input.captureMode === 'SHARED') {
    return input.purpose !== 'SAFETY' &&
      input.retentionClass !== 'SAFETY_CRITICAL'
      ? undefined
      : 'CAPTURE_POLICY_VIOLATION';
  }
  return input.purpose === 'SAFETY' &&
    input.retentionClass === 'SAFETY_CRITICAL'
    ? undefined
    : 'CAPTURE_POLICY_VIOLATION';
};

export function createEvidenceEvent(
  input: CreateEvidenceEventInput,
  factor: FactorDefinition,
  measurement: MeasurementDefinition,
  instrument: InstrumentDefinition
): EvidenceEvent {
  const versions: EvidenceVersions = {
    registryVersion: input.registryVersion,
    definitionVersion: factor.definitionVersion,
    measurementVersion: measurement.measurementVersion,
    instrumentVersion: instrument.instrumentVersion,
    algorithmVersion: input.algorithmVersion,
  };
  const reliability = measurement.reliability * input.reliabilityMultiplier;
  const sourceHash = evidenceSourceHash(input);
  const base: EvidenceEventBase = {
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    actorId: input.actorId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    pairId: input.pairId,
    observationScope: input.observationScope,
    observedSubjectId: input.observedSubjectId,
    factorKey: input.factorKey,
    measurementKey: input.measurementKey,
    instrumentKey: input.instrumentKey,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    sourceHash,
    submittedValue: input.submittedValue,
    reliability,
    observedAt: new Date(input.observedAt.getTime()),
    recordedAt: new Date(input.recordedAt.getTime()),
    context: input.context,
    purpose: input.purpose,
    privacyClass: input.privacyClass,
    captureMode: input.captureMode,
    policyVersion: input.policyVersion,
    consentRevision: input.consentRevision,
    retentionClass: input.retentionClass,
    versions,
    inputHash: evidenceInputHash(input, measurement, instrument, sourceHash),
  };

  let rejectionCode: EvidenceRejectionCode | undefined;
  if (input.factorKey !== factor.key || measurement.factorKey !== factor.key) {
    rejectionCode = 'FACTOR_REFERENCE_MISMATCH';
  } else if (input.measurementKey !== measurement.key) {
    rejectionCode = 'MEASUREMENT_VERSION_MISMATCH';
  } else if (input.sourceType !== measurement.sourceType) {
    rejectionCode = 'SOURCE_TYPE_MISMATCH';
  } else if (
    input.instrumentKey !== instrument.key ||
    !instrument.measurementKeys.includes(measurement.key)
  ) {
    rejectionCode = 'INSTRUMENT_REFERENCE_MISMATCH';
  } else if (
    input.context !== instrument.context ||
    !factor.contexts.includes(input.context)
  ) {
    rejectionCode = 'CONTEXT_VIOLATION';
  } else if (input.privacyClass !== factor.privacyClass) {
    rejectionCode = 'PRIVACY_CLASS_MISMATCH';
  } else if (!Number.isFinite(reliability) || reliability < 0 || reliability > 1) {
    rejectionCode = 'RELIABILITY_INVALID';
  } else {
    rejectionCode =
      isolationRejection(input) ?? capturePolicyRejection(input);
  }

  const submittedValidation = validateFactorValue(
    measurement.valueSchema,
    input.submittedValue
  );
  if (!rejectionCode && !submittedValidation.valid) {
    rejectionCode = 'VALUE_INVALID';
  }
  const normalized = submittedValidation.valid
    ? applyNormalization(submittedValidation.value, measurement)
    : submittedValidation.value;
  const normalizedValidation = validateFactorValue(factor.valueSchema, normalized);
  if (!rejectionCode && !normalizedValidation.valid) {
    rejectionCode = 'NORMALIZATION_UNSUPPORTED';
  }

  if (rejectionCode) {
    return {
      ...base,
      status: 'REJECTED',
      rejectionCode,
    };
  }
  return {
    ...base,
    status: 'ACCEPTED',
    normalizedValue: normalizedValidation.value,
  };
}
