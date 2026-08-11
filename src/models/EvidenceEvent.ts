import mongoose, { Schema } from 'mongoose';
import type {
  EvidenceSourceType,
  PrivacyClass,
} from '@/domain/model/definitions/definitionTypes';
import {
  EVIDENCE_REJECTION_CODES,
  type EvidenceCaptureMode,
  type EvidenceObservationScope,
  type EvidencePurpose,
  type EvidenceRejectionCode,
  type EvidenceRetentionClass,
  type EvidenceSubjectKind,
} from '@/domain/model/evidence/evidence';
import type { RelationshipContext } from '@/domain/model/pair/strategyTypes';
import {
  EvidenceVersionsSchema,
  FactorValueSchema,
  type StoredEvidenceVersions,
  type StoredFactorValue,
} from '@/models/factorEngineSchemas';

type EvidenceEventBaseType = {
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
  submittedValue: StoredFactorValue;
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
  versions: StoredEvidenceVersions;
  inputHash: string;
};

export type EvidenceEventType = EvidenceEventBaseType &
  (
    | {
        status: 'ACCEPTED';
        normalizedValue: StoredFactorValue;
        rejectionCode?: never;
      }
    | {
        status: 'REJECTED';
        normalizedValue?: never;
        rejectionCode: EvidenceRejectionCode;
      }
  );

const evidenceEventSchema = new Schema<EvidenceEventType>(
  {
    eventId: { type: String, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    actorId: { type: String, required: true, immutable: true },
    subjectKind: {
      type: String,
      enum: ['INDIVIDUAL', 'PAIR'],
      required: true,
      immutable: true,
    },
    subjectId: { type: String, required: true, immutable: true },
    pairId: { type: String, immutable: true },
    observationScope: {
      type: String,
      enum: ['SELF', 'PAIR_DYAD', 'OBSERVER_REPORT'],
      required: true,
      immutable: true,
    },
    observedSubjectId: { type: String, immutable: true },
    factorKey: { type: String, required: true, immutable: true },
    measurementKey: { type: String, required: true, immutable: true },
    instrumentKey: { type: String, required: true, immutable: true },
    sourceType: {
      type: String,
      enum: [
        'QUESTIONNAIRE',
        'CHECK_IN',
        'TASK',
        'TASK_RESULT',
        'REFLECTION',
        'EXPLICIT_PROFILE',
        'PAIR_ACTIVITY',
        'FEEDBACK',
        'OBSERVED_OUTCOME',
      ],
      required: true,
      immutable: true,
    },
    sourceRef: { type: String, required: true, immutable: true },
    sourceRevision: { type: String, required: true, immutable: true },
    sourceHash: { type: String, required: true, immutable: true },
    submittedValue: { type: FactorValueSchema, required: true, immutable: true },
    normalizedValue: { type: FactorValueSchema, immutable: true },
    reliability: { type: Number, required: true, min: 0, max: 1, immutable: true },
    observedAt: { type: Date, required: true, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
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
    purpose: {
      type: String,
      enum: [
        'OWNER_PROFILE',
        'PAIR_MODEL',
        'MATCHING',
        'RECOMMENDATION',
        'SAFETY',
      ],
      required: true,
      immutable: true,
    },
    privacyClass: {
      type: String,
      enum: ['NORMAL', 'PRIVATE', 'SENSITIVE', 'MATCHING_ONLY'],
      required: true,
      immutable: true,
    },
    captureMode: {
      type: String,
      enum: ['PRIVATE', 'PAIR_MODEL_ONLY', 'SHARED', 'SYSTEM_ONLY'],
      required: true,
      immutable: true,
    },
    policyVersion: { type: String, required: true, immutable: true },
    consentRevision: { type: String, required: true, immutable: true },
    retentionClass: {
      type: String,
      enum: ['OWNER_CONTROLLED', 'PAIR_CONTEXT', 'SAFETY_CRITICAL'],
      required: true,
      immutable: true,
    },
    versions: { type: EvidenceVersionsSchema, required: true, immutable: true },
    inputHash: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['ACCEPTED', 'REJECTED'],
      required: true,
      immutable: true,
    },
    rejectionCode: {
      type: String,
      enum: EVIDENCE_REJECTION_CODES,
      immutable: true,
    },
  },
  { collection: 'factor_evidence_events', versionKey: false }
);

evidenceEventSchema.path('status').validate(function validateEvidenceStatusFields(
  status: EvidenceEventType['status']
) {
  if (this instanceof mongoose.Query) return true;
  const hasNormalizedValue = this.normalizedValue != null;
  return status === 'REJECTED'
    ? Boolean(this.rejectionCode) && !hasNormalizedValue
    : !this.rejectionCode && hasNormalizedValue;
}, 'Evidence rejection fields do not match status');

evidenceEventSchema.index({ eventId: 1 }, { unique: true });
evidenceEventSchema.index(
  { subjectKind: 1, subjectId: 1, idempotencyKey: 1 },
  { unique: true }
);
evidenceEventSchema.index({ subjectKind: 1, subjectId: 1, factorKey: 1, observedAt: 1 });
evidenceEventSchema.index({ factorKey: 1, 'versions.registryVersion': 1 });
evidenceEventSchema.index({ status: 1, recordedAt: 1 });
evidenceEventSchema.index({ sourceHash: 1, factorKey: 1 });
evidenceEventSchema.index({ pairId: 1, captureMode: 1, purpose: 1, observedAt: -1 });
evidenceEventSchema.index(
  {
    subjectKind: 1,
    subjectId: 1,
    pairId: 1,
    factorKey: 1,
    'versions.registryVersion': 1,
    'versions.algorithmVersion': 1,
    'versions.definitionVersion': 1,
    observedAt: -1,
    eventId: -1,
  },
  { name: 'factor_evidence_bounded_subject_history' }
);

export const EvidenceEvent =
  (mongoose.models.EvidenceEvent as mongoose.Model<EvidenceEventType>) ||
  mongoose.model<EvidenceEventType>('EvidenceEvent', evidenceEventSchema);
