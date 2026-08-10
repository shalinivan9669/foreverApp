import { Schema, Types } from 'mongoose';

export const RECOMMENDATION_PROVENANCE_VERSION =
  'recommendation-provenance-v1' as const;
export const RECOMMENDATION_RULE_VERSION = 'recommendation-rule-v2' as const;
export const ACTIVITY_CONTENT_VERSION = 'activity-content-v1' as const;

export type RecommendationSummaryContext = {
  cycleId: Types.ObjectId;
  cycleKey: string;
  snapshotId: Types.ObjectId;
  snapshotRevision: number;
  inputHash: string;
  inputDefinitionVersion: string;
  pairStateAlgorithmVersion: string;
};

export type RecommendationProvenanceType = RecommendationSummaryContext & {
  version: typeof RECOMMENDATION_PROVENANCE_VERSION;
  recommendationRuleVersion: typeof RECOMMENDATION_RULE_VERSION;
  activityContentVersion: typeof ACTIVITY_CONTENT_VERSION;
  activityContentHash: string;
};

export const RecommendationProvenanceSchema =
  new Schema<RecommendationProvenanceType>(
    {
      version: {
        type: String,
        enum: [RECOMMENDATION_PROVENANCE_VERSION],
        required: true,
        immutable: true,
      },
      cycleId: {
        type: Schema.Types.ObjectId,
        ref: 'WeeklyCycle',
        required: true,
        immutable: true,
      },
      cycleKey: { type: String, required: true, immutable: true },
      snapshotId: {
        type: Schema.Types.ObjectId,
        ref: 'PairStateSnapshot',
        required: true,
        immutable: true,
      },
      snapshotRevision: {
        type: Number,
        required: true,
        min: 0,
        immutable: true,
      },
      inputHash: { type: String, required: true, immutable: true },
      inputDefinitionVersion: {
        type: String,
        required: true,
        immutable: true,
      },
      pairStateAlgorithmVersion: {
        type: String,
        required: true,
        immutable: true,
      },
      recommendationRuleVersion: {
        type: String,
        enum: [RECOMMENDATION_RULE_VERSION],
        required: true,
        immutable: true,
      },
      activityContentVersion: {
        type: String,
        enum: [ACTIVITY_CONTENT_VERSION],
        required: true,
        immutable: true,
      },
      activityContentHash: {
        type: String,
        required: true,
        immutable: true,
      },
    },
    { _id: false }
  );
