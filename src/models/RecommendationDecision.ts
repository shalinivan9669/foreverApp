import mongoose, { Schema, Types } from 'mongoose';
import {
  RecommendationProvenanceSchema,
  type RecommendationProvenanceType,
} from '@/models/RecommendationProvenance';

export type RecommendationDecisionStatus =
  | 'OFFERED'
  | 'ACCEPTED'
  | 'SKIPPED'
  | 'REPLACED'
  | 'EXPIRED';

export type RecommendationReasonCode =
  | 'CURRENT_CYCLE_SUPPORT'
  | 'ALTERNATIVE_REQUESTED';

export interface RecommendationDecisionType {
  pairId: Types.ObjectId;
  cycleKey: string;
  activityId: Types.ObjectId;
  templateId?: string;
  status: RecommendationDecisionStatus;
  reasonCode: RecommendationReasonCode;
  decisionVersion: 'recommendation-decision-v1';
  provenance?: RecommendationProvenanceType;
  replacementDepth: 0 | 1;
  previousDecisionId?: Types.ObjectId;
  successorDecisionId?: Types.ObjectId;
  expiresAt?: Date;
  acceptedAt?: Date;
  skippedAt?: Date;
  replacedAt?: Date;
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const RecommendationDecisionSchema = new Schema<RecommendationDecisionType>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    cycleKey: { type: String, required: true },
    activityId: {
      type: Schema.Types.ObjectId,
      ref: 'PairActivity',
      required: true,
    },
    templateId: { type: String },
    status: {
      type: String,
      enum: ['OFFERED', 'ACCEPTED', 'SKIPPED', 'REPLACED', 'EXPIRED'],
      required: true,
      default: 'OFFERED',
    },
    reasonCode: {
      type: String,
      enum: ['CURRENT_CYCLE_SUPPORT', 'ALTERNATIVE_REQUESTED'],
      required: true,
    },
    decisionVersion: {
      type: String,
      enum: ['recommendation-decision-v1'],
      required: true,
      default: 'recommendation-decision-v1',
    },
    provenance: {
      type: RecommendationProvenanceSchema,
      immutable: true,
    },
    replacementDepth: { type: Number, enum: [0, 1], required: true, default: 0 },
    previousDecisionId: {
      type: Schema.Types.ObjectId,
      ref: 'RecommendationDecision',
    },
    successorDecisionId: {
      type: Schema.Types.ObjectId,
      ref: 'RecommendationDecision',
    },
    expiresAt: { type: Date },
    acceptedAt: { type: Date },
    skippedAt: { type: Date },
    replacedAt: { type: Date },
    expiredAt: { type: Date },
  },
  { collection: 'recommendation_decisions', timestamps: true }
);

RecommendationDecisionSchema.index({ activityId: 1 }, { unique: true });
RecommendationDecisionSchema.index(
  { pairId: 1, cycleKey: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OFFERED' },
    name: 'one_offered_recommendation_per_pair_cycle',
  }
);
RecommendationDecisionSchema.index({ pairId: 1, createdAt: -1 });
RecommendationDecisionSchema.index({ status: 1, expiresAt: 1 });

export const RecommendationDecision =
  (mongoose.models.RecommendationDecision as mongoose.Model<RecommendationDecisionType>) ||
  mongoose.model<RecommendationDecisionType>(
    'RecommendationDecision',
    RecommendationDecisionSchema
  );
