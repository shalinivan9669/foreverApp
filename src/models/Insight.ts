import mongoose, { Schema, Types } from 'mongoose';
import type { Axis } from '@/domain/vectors';

export type InsightOwnerType = 'user' | 'pair';
export type InsightStatus = 'active' | 'dismissed' | 'expired';
export type InsightSeverity = 1 | 2 | 3;

export type InsightRuleId =
  | 'both_conflict_avoidance'
  | 'finance_delta_high'
  | 'directness_asymmetry'
  | 'psyche_low_fatigue_high'
  | 'domestic_fairness_risk'
  | 'low_pair_readiness'
  | 'both_high_communication'
  | 'weekly_fatigue_increase'
  | 'shared_time_delta'
  | 'insufficient_data_axis';

export type InsightEvidenceScalar =
  | string
  | number
  | boolean
  | null
  | Date;

export type InsightEvidenceValue =
  | InsightEvidenceScalar
  | InsightEvidenceScalar[]
  | { [key: string]: InsightEvidenceScalar | InsightEvidenceScalar[] };

export interface InsightType {
  ownerType: InsightOwnerType;
  userId?: string;
  pairId?: string | Types.ObjectId;
  trigger: {
    ruleId: InsightRuleId;
    axis?: Axis;
    evidence?: InsightEvidenceValue;
  };
  severity: InsightSeverity;
  title: string;
  safeWording: string;
  recommendedAction: string;
  activityId?: string;
  questionnaireId?: string;
  visibility: {
    showToUserIds: string[];
    pairShared: boolean;
  };
  status: InsightStatus;
  cooldownUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

const insightSchema = new Schema<InsightType>(
  {
    ownerType: {
      type: String,
      enum: ['user', 'pair'],
      required: true,
    },
    userId: { type: String },
    pairId: { type: Schema.Types.Mixed },
    trigger: {
      ruleId: {
        type: String,
        enum: [
          'both_conflict_avoidance',
          'finance_delta_high',
          'directness_asymmetry',
          'psyche_low_fatigue_high',
          'domestic_fairness_risk',
          'low_pair_readiness',
          'both_high_communication',
          'weekly_fatigue_increase',
          'shared_time_delta',
          'insufficient_data_axis',
        ],
        required: true,
      },
      axis: {
        type: String,
        enum: ['communication', 'domestic', 'personalViews', 'finance', 'sexuality', 'psyche'],
      },
      evidence: { type: Schema.Types.Mixed },
    },
    severity: { type: Number, enum: [1, 2, 3], required: true },
    title: { type: String, required: true },
    safeWording: { type: String, required: true },
    recommendedAction: { type: String, required: true },
    activityId: { type: String },
    questionnaireId: { type: String },
    visibility: {
      showToUserIds: { type: [String], default: [] },
      pairShared: { type: Boolean, required: true, default: false },
    },
    status: {
      type: String,
      enum: ['active', 'dismissed', 'expired'],
      required: true,
      default: 'active',
    },
    cooldownUntil: { type: Date, required: true },
  },
  { collection: 'insights', timestamps: true }
);

insightSchema.index({ ownerType: 1, userId: 1, 'trigger.ruleId': 1, cooldownUntil: -1 });
insightSchema.index({ ownerType: 1, pairId: 1, 'trigger.ruleId': 1, cooldownUntil: -1 });
insightSchema.index({ 'visibility.showToUserIds': 1, status: 1, createdAt: -1 });

export const Insight =
  (mongoose.models.Insight as mongoose.Model<InsightType>) ||
  mongoose.model<InsightType>('Insight', insightSchema);
