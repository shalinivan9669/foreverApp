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

export interface WeeklyCheckInType {
  userId: string;
  pairId?: string | Types.ObjectId;
  weekKey: string;
  answers: WeeklyCheckInAnswers;
  computed: WeeklyCheckInComputed;
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

const weeklyCheckInSchema = new Schema<WeeklyCheckInType>(
  {
    userId: { type: String, required: true },
    pairId: { type: Schema.Types.Mixed },
    weekKey: { type: String, required: true },
    answers: { type: answersSchema, required: true },
    computed: { type: computedSchema, required: true, default: () => ({}) },
  },
  { collection: 'weekly_checkins', timestamps: true }
);

weeklyCheckInSchema.index({ userId: 1, pairId: 1, weekKey: 1 }, { unique: true });
weeklyCheckInSchema.index({ pairId: 1, weekKey: 1 });
weeklyCheckInSchema.index({ userId: 1, weekKey: 1 });

export const WeeklyCheckIn =
  (mongoose.models.WeeklyCheckIn as mongoose.Model<WeeklyCheckInType>) ||
  mongoose.model<WeeklyCheckInType>('WeeklyCheckIn', weeklyCheckInSchema);
