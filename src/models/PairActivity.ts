import mongoose, { Schema, Types } from 'mongoose';
import {
  ActionDefinitionRefSchema,
  CheckInSchema,
  type ActionDefinitionRef,
  type CheckInTpl as CheckIn,
} from './ActivityTemplate';
import {
  RecommendationProvenanceSchema,
  type RecommendationProvenanceType,
} from './RecommendationProvenance';
import type { EvidenceCaptureMode } from '@/domain/model/evidence/evidence';

export interface Answer {
  checkInId: string;
  by: 'A' | 'B';
  ui: number;
  at: Date;
  feedbackRevision: number;
  captureMode: Extract<EvidenceCaptureMode, 'PRIVATE' | 'PAIR_MODEL_ONLY'>;
  policyVersion: string;
  consentRevision: string;
}

export type ActivityCompletedStatus =
  | 'completed_success'
  | 'completed_partial'
  | 'failed';

export type ActivityLifecycleVersion =
  | 'activity-lifecycle-v1'
  | 'activity-lifecycle-v2'
  | 'activity-lifecycle-v3';

export type ActivityFeedbackSchemaVersion =
  | 'activity-feedback-v1'
  | 'activity-feedback-v2';

export interface ActivityFactorEvidenceProvenance {
  taskResultEventIds: string[];
  pairActivityEventIds: string[];
  individualSnapshotIds: string[];
  pairSnapshotIds: string[];
  pairEvaluationSnapshotIds: string[];
  recordedAt: Date;
}

export interface ActivityResultSummary {
  submittedBy: Array<'A' | 'B'>;
  submittedCount: number;
  bothSubmitted: boolean;
  successScore: number;
  status: ActivityCompletedStatus;
  usefulnessAvg?: number;
  comfortAvg?: number;
  tensionAvg?: number;
  wantsSimilarRatio?: number;
  participationRatio?: number;
  subjectiveChangeAvg?: number;
  difficultyAvg?: number;
  feedbackSchemaVersion: ActivityFeedbackSchemaVersion;
  factorEvidenceRecorded: boolean;
  factorEvidence: ActivityFactorEvidenceProvenance;
  explanation: {
    ru: string;
    en?: string;
  };
  completedAt?: Date;
  resultVersion: 'activity-result-v2';
}

export interface PairActivityType {
  pairId: Types.ObjectId;
  members: [Types.ObjectId, Types.ObjectId];

  intent: 'improve' | 'celebrate';
  archetype:
    | 'micro_habit'
    | 'dialogue'
    | 'ritual'
    | 'date'
    | 'game'
    | 'education'
    | 'task';
  actionDefinition: ActionDefinitionRef;
  targetFactorKeys: string[];

  title: { ru: string; en: string };
  description?: { ru: string; en: string };
  why: { ru: string; en: string };

  mode: 'together' | 'soloA' | 'soloB';
  sync: 'sync' | 'async';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;

  timeEstimateMin?: number;
  costEstimate?: number;
  location?: 'home' | 'outdoor' | 'online' | 'any';
  materials?: string[];

  offeredAt: Date;
  acceptedAt?: Date;
  startedAt?: Date;
  windowStart?: Date;
  windowEnd?: Date;
  dueAt?: Date;
  recurrence?: string;
  cooldownDays?: number;

  requiresConsent?: boolean;
  consentA?: 'pending' | 'granted' | 'rejected';
  consentB?: 'pending' | 'granted' | 'rejected';
  visibility?: 'both' | 'privateA' | 'privateB';

  status:
    | 'suggested'
    | 'offered'
    | 'accepted'
    | 'in_progress'
    | 'awaiting_feedback'
    | 'awaiting_checkin'
    | 'completed_success'
    | 'completed_partial'
    | 'failed'
    | 'expired'
    | 'cancelled';
  lifecycleVersion?: ActivityLifecycleVersion;
  feedbackSchemaVersion?: ActivityFeedbackSchemaVersion;
  recommendationProvenance?: RecommendationProvenanceType;
  stateMeta?: Record<string, unknown>;

  checkIns: CheckIn[];
  answers?: Answer[];
  successScore?: number;
  factorEvidence?: ActivityFactorEvidenceProvenance;
  resultSummary?: ActivityResultSummary;

  createdBy: 'system' | 'curator' | 'user';
  createdAt?: Date;
  updatedAt?: Date;
}

const AnswerSchema = new Schema<Answer>(
  {
    checkInId: { type: String, required: true },
    by: { type: String, enum: ['A', 'B'], required: true },
    ui: { type: Number, required: true },
    at: { type: Date, required: true },
    feedbackRevision: { type: Number, required: true, min: 1, default: 1 },
    captureMode: {
      type: String,
      enum: ['PRIVATE', 'PAIR_MODEL_ONLY'],
      required: true,
      default: 'PRIVATE',
    },
    policyVersion: {
      type: String,
      required: true,
      default: 'activity-feedback-legacy-v1',
    },
    consentRevision: { type: String, required: true, default: 'not-granted' },
  },
  { _id: false }
);

const ActivityFactorEvidenceProvenanceSchema =
  new Schema<ActivityFactorEvidenceProvenance>(
    {
      taskResultEventIds: { type: [String], required: true, default: [] },
      pairActivityEventIds: { type: [String], required: true, default: [] },
      individualSnapshotIds: { type: [String], required: true, default: [] },
      pairSnapshotIds: { type: [String], required: true, default: [] },
      pairEvaluationSnapshotIds: { type: [String], required: true, default: [] },
      recordedAt: { type: Date, required: true },
    },
    { _id: false }
  );

const ActivityResultSummarySchema = new Schema<ActivityResultSummary>(
  {
    submittedBy: { type: [String], enum: ['A', 'B'], default: [] },
    submittedCount: { type: Number, required: true, min: 0, max: 2 },
    bothSubmitted: { type: Boolean, required: true },
    successScore: { type: Number, required: true, min: 0, max: 1 },
    status: {
      type: String,
      enum: ['completed_success', 'completed_partial', 'failed'],
      required: true,
    },
    usefulnessAvg: { type: Number, min: 0, max: 1 },
    comfortAvg: { type: Number, min: 0, max: 1 },
    tensionAvg: { type: Number, min: 0, max: 1 },
    wantsSimilarRatio: { type: Number, min: 0, max: 1 },
    participationRatio: { type: Number, min: 0, max: 1 },
    subjectiveChangeAvg: { type: Number, min: 0, max: 1 },
    difficultyAvg: { type: Number, min: 0, max: 1 },
    feedbackSchemaVersion: {
      type: String,
      enum: ['activity-feedback-v1', 'activity-feedback-v2'],
      required: true,
      default: 'activity-feedback-v2',
    },
    factorEvidenceRecorded: { type: Boolean, required: true, default: false },
    factorEvidence: {
      type: ActivityFactorEvidenceProvenanceSchema,
      required: true,
    },
    explanation: {
      ru: { type: String, required: true },
      en: { type: String },
    },
    completedAt: { type: Date },
    resultVersion: {
      type: String,
      enum: ['activity-result-v2'],
      required: true,
      default: 'activity-result-v2',
    },
  },
  { _id: false }
);

const PairActivitySchema = new Schema<PairActivityType>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    members: { type: [Schema.Types.ObjectId], ref: 'User', required: true },
    intent: { type: String, enum: ['improve', 'celebrate'], required: true },
    archetype: {
      type: String,
      enum: ['micro_habit', 'dialogue', 'ritual', 'date', 'game', 'education', 'task'],
      required: true,
    },
    actionDefinition: { type: ActionDefinitionRefSchema, required: true },
    targetFactorKeys: { type: [String], required: true },
    title: { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed },
    why: { type: Schema.Types.Mixed, required: true },
    mode: { type: String, enum: ['together', 'soloA', 'soloB'], required: true },
    sync: { type: String, enum: ['sync', 'async'], required: true },
    difficulty: { type: Number, enum: [1, 2, 3, 4, 5], required: true },
    intensity: { type: Number, enum: [1, 2, 3], required: true },
    timeEstimateMin: Number,
    costEstimate: Number,
    location: {
      type: String,
      enum: ['home', 'outdoor', 'online', 'any'],
      default: 'any',
    },
    materials: { type: [String], default: [] },
    offeredAt: { type: Date, required: true },
    acceptedAt: Date,
    startedAt: Date,
    windowStart: Date,
    windowEnd: Date,
    dueAt: Date,
    recurrence: String,
    cooldownDays: Number,
    requiresConsent: { type: Boolean, default: false },
    consentA: {
      type: String,
      enum: ['pending', 'granted', 'rejected'],
      default: 'pending',
    },
    consentB: {
      type: String,
      enum: ['pending', 'granted', 'rejected'],
      default: 'pending',
    },
    visibility: {
      type: String,
      enum: ['both', 'privateA', 'privateB'],
      default: 'both',
    },
    status: {
      type: String,
      enum: [
        'suggested',
        'offered',
        'accepted',
        'in_progress',
        'awaiting_feedback',
        'awaiting_checkin',
        'completed_success',
        'completed_partial',
        'failed',
        'expired',
        'cancelled',
      ],
      required: true,
    },
    lifecycleVersion: {
      type: String,
      enum: [
        'activity-lifecycle-v1',
        'activity-lifecycle-v2',
        'activity-lifecycle-v3',
      ],
      immutable: true,
    },
    feedbackSchemaVersion: {
      type: String,
      enum: ['activity-feedback-v1', 'activity-feedback-v2'],
      immutable: true,
    },
    recommendationProvenance: {
      type: RecommendationProvenanceSchema,
      immutable: true,
    },
    stateMeta: { type: Schema.Types.Mixed },
    checkIns: { type: [CheckInSchema], default: [] },
    answers: { type: [AnswerSchema], default: [] },
    successScore: Number,
    factorEvidence: { type: ActivityFactorEvidenceProvenanceSchema },
    resultSummary: { type: ActivityResultSummarySchema },
    createdBy: {
      type: String,
      enum: ['system', 'curator', 'user'],
      default: 'system',
    },
  },
  { collection: 'pair_activities', timestamps: true }
);

PairActivitySchema.pre('validate', function validateFactorBinding() {
  if (this.targetFactorKeys.length === 0) {
    throw new Error('Pair activity requires at least one target factor');
  }
});

PairActivitySchema.index({ pairId: 1, status: 1, dueAt: 1 });
PairActivitySchema.index(
  { pairId: 1, status: 1, offeredAt: -1, _id: -1 },
  { name: 'pair_activity_history_by_pair_status_offered' }
);
PairActivitySchema.index(
  { pairId: 1, 'actionDefinition.key': 1, offeredAt: -1 },
  { name: 'pair_activity_action_history' }
);
PairActivitySchema.index(
  { pairId: 1, 'stateMeta.offerKey': 1 },
  {
    name: 'pair_activity_offer_idempotency',
    unique: true,
    partialFilterExpression: { 'stateMeta.offerKey': { $type: 'string' } },
  }
);

export const PairActivity =
  (mongoose.models.PairActivity as mongoose.Model<PairActivityType>) ||
  mongoose.model<PairActivityType>('PairActivity', PairActivitySchema);
