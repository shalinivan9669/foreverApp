import mongoose, { Schema, Types } from 'mongoose';
import type { Axis } from '@/domain/vectors';

export type WeeklyCheckInAnswers = {
  closeness: number;
  fatigue: number;
  irritation: number;
  readiness: number;
  unresolvedTopic: boolean;
  note?: string;
};

export type WeeklyCheckInComputed = {
  userStateDelta: Partial<Record<Axis, number>>;
  pairRiskDelta?: number;
  generatedInsightIds: string[];
};

export const WEEKLY_CHECK_IN_FINALIZATION_VERSION =
  'weekly-checkin-finalization-v1' as const;

export type WeeklyCheckInFinalizationState =
  | 'pending'
  | 'processing'
  | 'effects_applied'
  | 'completed'
  | 'failed';

export type WeeklyCheckInFinalization = {
  version: typeof WEEKLY_CHECK_IN_FINALIZATION_VERSION;
  state: WeeklyCheckInFinalizationState;
  attemptCount: number;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  lastFailureCode?: string;
  completedAt?: Date;
};

export interface WeeklyCheckInType {
  userId: string;
  pairId?: string | Types.ObjectId;
  weekKey: string;
  answers: WeeklyCheckInAnswers;
  computed: WeeklyCheckInComputed;
  /** Missing on legacy rows, whose side effects were already finalized pre-v1. */
  finalization?: WeeklyCheckInFinalization;
  createdAt: Date;
  updatedAt: Date;
}

const answersSchema = new Schema<WeeklyCheckInAnswers>(
  {
    closeness: { type: Number, required: true, min: 0, max: 1 },
    fatigue: { type: Number, required: true, min: 0, max: 1 },
    irritation: { type: Number, required: true, min: 0, max: 1 },
    readiness: { type: Number, required: true, min: 0, max: 1 },
    unresolvedTopic: { type: Boolean, required: true },
    note: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const computedSchema = new Schema<WeeklyCheckInComputed>(
  {
    userStateDelta: { type: Schema.Types.Mixed, required: true, default: {} },
    pairRiskDelta: { type: Number },
    generatedInsightIds: { type: [String], default: [] },
  },
  { _id: false }
);

const finalizationSchema = new Schema<WeeklyCheckInFinalization>(
  {
    version: {
      type: String,
      enum: [WEEKLY_CHECK_IN_FINALIZATION_VERSION],
      required: true,
      default: WEEKLY_CHECK_IN_FINALIZATION_VERSION,
    },
    state: {
      type: String,
      enum: ['pending', 'processing', 'effects_applied', 'completed', 'failed'],
      required: true,
      default: 'pending',
    },
    attemptCount: { type: Number, required: true, min: 0, default: 0 },
    leaseOwner: { type: String, required: false },
    leaseExpiresAt: { type: Date, required: false },
    lastFailureCode: { type: String, required: false, maxlength: 100 },
    completedAt: { type: Date, required: false },
  },
  { _id: false }
);

const weeklyCheckInSchema = new Schema<WeeklyCheckInType>(
  {
    userId: { type: String, required: true },
    pairId: { type: Schema.Types.Mixed },
    weekKey: { type: String, required: true },
    answers: { type: answersSchema, required: true },
    computed: { type: computedSchema, required: true, default: () => ({}) },
    finalization: {
      type: finalizationSchema,
      required: true,
      default: () => ({
        version: WEEKLY_CHECK_IN_FINALIZATION_VERSION,
        state: 'pending',
        attemptCount: 0,
      }),
    },
  },
  { collection: 'weekly_checkins', timestamps: true }
);

weeklyCheckInSchema.index({ userId: 1, pairId: 1, weekKey: 1 }, { unique: true });
weeklyCheckInSchema.index({ pairId: 1, weekKey: 1 });
weeklyCheckInSchema.index({ userId: 1, weekKey: 1 });

export const WeeklyCheckIn =
  (mongoose.models.WeeklyCheckIn as mongoose.Model<WeeklyCheckInType>) ||
  mongoose.model<WeeklyCheckInType>('WeeklyCheckIn', weeklyCheckInSchema);
