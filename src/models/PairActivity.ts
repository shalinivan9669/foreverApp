import mongoose, { Schema, Types } from 'mongoose';
import { Axis, CheckInTpl as CheckIn, EffectTpl as Effect, CheckInSchema, EffectSchema } from './ActivityTemplate';
import {
  RecommendationProvenanceSchema,
  type RecommendationProvenanceType,
} from './RecommendationProvenance';

export interface Answer {
  checkInId: string;
  by: 'A' | 'B';
  ui: number;
  at: Date;
}

export type ActivityCompletedStatus =
  | 'completed_success'
  | 'completed_partial'
  | 'failed';

export type ActivityLifecycleVersion =
  | 'activity-lifecycle-v1'
  | 'activity-lifecycle-v2';

export type ActivityFeedbackSchemaVersion =
  | 'activity-feedback-v1'
  | 'activity-feedback-v2';

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
  effectApplied: boolean;
  effect: {
    fatigueDelta: number;
    readinessDelta: number;
    axisDeltas: Array<{
      axis: Axis;
      delta: number;
    }>;
  };
  effectExplanation: {
    ru: string;
    en?: string;
  };
  completedAt?: Date;
  resultVersion: 'activity-result-v1';
}

export interface PairActivityType {
  pairId: Types.ObjectId;
  members: [Types.ObjectId, Types.ObjectId];

  intent: 'improve'|'celebrate';
  archetype: 'micro_habit'|'dialogue'|'ritual'|'date'|'game'|'education'|'task';
  axis: Axis[];
  facetsTarget?: string[];

  title: { ru:string; en:string };
  description?: { ru:string; en:string };
  why: { ru:string; en:string };

  mode: 'together'|'soloA'|'soloB';
  sync: 'sync'|'async';
  difficulty: 1|2|3|4|5;
  intensity: 1|2|3;

  timeEstimateMin?: number;
  costEstimate?: number;
  location?: 'home'|'outdoor'|'online'|'any';
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
  consentA?: 'pending'|'granted'|'rejected';
  consentB?: 'pending'|'granted'|'rejected';
  visibility?: 'both'|'privateA'|'privateB';

  status:
    | 'suggested' | 'offered' | 'accepted' | 'in_progress'
    | 'awaiting_feedback' | 'awaiting_checkin'
    | 'completed_success' | 'completed_partial' | 'failed' | 'expired' | 'cancelled';
  lifecycleVersion?: ActivityLifecycleVersion;
  feedbackSchemaVersion?: ActivityFeedbackSchemaVersion;
  recommendationProvenance?: RecommendationProvenanceType;
  stateMeta?: Record<string,unknown>;

  checkIns: CheckIn[];
  answers?: Answer[];
  successScore?: number;
  effect?: Effect[];
  resultSummary?: ActivityResultSummary;

  fatigueDeltaOnComplete?: number;
  readinessDeltaOnComplete?: number;

  createdBy: 'system'|'curator'|'user';
  createdAt?: Date;
  updatedAt?: Date;
}

/* ── subdoc for answers ──────────────────────────────────── */
const AnswerSchema = new Schema<Answer>(
  {
    checkInId: { type: String, required: true },
    by:        { type: String, enum: ['A','B'], required: true },
    ui:        { type: Number, required: true },
    at:        { type: Date,   required: true },
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
      default: 'activity-feedback-v1',
    },
    effectApplied: { type: Boolean, required: true, default: false },
    effect: {
      fatigueDelta: { type: Number, required: true, default: 0 },
      readinessDelta: { type: Number, required: true, default: 0 },
      axisDeltas: {
        type: [
          new Schema(
            {
              axis: {
                type: String,
                enum: ['communication', 'domestic', 'personalViews', 'finance', 'sexuality', 'psyche'],
                required: true,
              },
              delta: { type: Number, required: true },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
    },
    effectExplanation: {
      ru: { type: String, required: true },
      en: { type: String },
    },
    completedAt: { type: Date },
    resultVersion: {
      type: String,
      enum: ['activity-result-v1'],
      required: true,
      default: 'activity-result-v1',
    },
  },
  { _id: false }
);

/* ── root schema ─────────────────────────────────────────── */
const PairActivitySchema = new Schema<PairActivityType>(
  {
    pairId:   { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    members:  { type: [Schema.Types.ObjectId], ref: 'User', required: true },

    intent:    { type: String, enum: ['improve','celebrate'], required: true },
    archetype: {
      type: String,
      enum: ['micro_habit','dialogue','ritual','date','game','education','task'],
      required: true
    },
    axis: {
      type: [String],
      enum: ['communication','domestic','personalViews','finance','sexuality','psyche'],
      required: true
    },
    facetsTarget: { type: [String], default: [] },

    title:       { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed },
    why:         { type: Schema.Types.Mixed, required: true },

    mode: { type: String, enum: ['together','soloA','soloB'], required: true },
    sync: { type: String, enum: ['sync','async'], required: true },
    difficulty: { type: Number, enum: [1,2,3,4,5], required: true },
    intensity:  { type: Number, enum: [1,2,3],     required: true },

    timeEstimateMin: { type: Number },
    costEstimate:    { type: Number },
    location: { type: String, enum: ['home','outdoor','online','any'], default: 'any' },
    materials: { type: [String], default: [] },

    offeredAt:   { type: Date, required: true },
    acceptedAt:  { type: Date },
    startedAt:   { type: Date },
    windowStart: { type: Date },
    windowEnd:   { type: Date },
    dueAt:       { type: Date },
    recurrence:  { type: String },
    cooldownDays:{ type: Number },

    requiresConsent: { type: Boolean, default: false },
    consentA: { type: String, enum: ['pending','granted','rejected'], default: 'pending' },
    consentB: { type: String, enum: ['pending','granted','rejected'], default: 'pending' },
    visibility:{ type: String, enum: ['both','privateA','privateB'], default: 'both' },

    status: {
      type: String,
      enum: [
        'suggested','offered','accepted','in_progress','awaiting_feedback','awaiting_checkin',
        'completed_success','completed_partial','failed','expired','cancelled'
      ],
      required: true
    },
    lifecycleVersion: {
      type: String,
      enum: ['activity-lifecycle-v1', 'activity-lifecycle-v2'],
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
    answers:  { type: [AnswerSchema],  default: [] },
    successScore: { type: Number },
    effect:      { type: [EffectSchema], default: [] },
    resultSummary: { type: ActivityResultSummarySchema },

    fatigueDeltaOnComplete:   { type: Number },
    readinessDeltaOnComplete: { type: Number },

    createdBy: { type: String, enum: ['system','curator','user'], default: 'system' },
  },
  { collection: 'pair_activities', timestamps: true }
);

PairActivitySchema.index({ pairId: 1, status: 1, dueAt: 1 });
PairActivitySchema.index(
  { pairId: 1, status: 1, offeredAt: -1, _id: -1 },
  { name: 'pair_activity_history_by_pair_status_offered' }
);

export const PairActivity =
  (mongoose.models.PairActivity as mongoose.Model<PairActivityType>) ||
  mongoose.model<PairActivityType>('PairActivity', PairActivitySchema);
