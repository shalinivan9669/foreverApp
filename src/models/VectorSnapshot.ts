import mongoose, { Schema, Types } from 'mongoose';
import type { Axis } from '@/domain/vectors';
import type { VectorLayer } from '@/models/User';

export type VectorSnapshotReasonSource =
  | 'onboarding'
  | 'baseline_questionnaire'
  | 'state_questionnaire'
  | 'pair_questionnaire'
  | 'weekly_checkin'
  | 'manual_recalculation'
  | 'migration';

export interface VectorSnapshotType {
  userId: string | Types.ObjectId;
  pairId?: string | Types.ObjectId;
  layer: VectorLayer;
  axis: Axis;
  before: {
    level: number;
    confidence: number;
    evidenceCount: number;
  };
  after: {
    level: number;
    confidence: number;
    evidenceCount: number;
  };
  delta: number;
  reason: {
    source: VectorSnapshotReasonSource;
    questionnaireId?: string | Types.ObjectId;
    sessionId?: string | Types.ObjectId;
    questionIds?: Array<string | Types.ObjectId>;
  };
  scoringVersion: string;
  createdAt: Date;
}

const vectorSnapshotPointSchema = new Schema(
  {
    level: { type: Number, required: true, min: 0, max: 1 },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    evidenceCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const vectorSnapshotSchema = new Schema<VectorSnapshotType>(
  {
    userId: { type: Schema.Types.Mixed, required: true },
    pairId: { type: Schema.Types.Mixed },
    layer: {
      type: String,
      enum: ['trait', 'state', 'matching', 'displayed'],
      required: true,
    },
    axis: {
      type: String,
      enum: ['communication', 'domestic', 'personalViews', 'finance', 'sexuality', 'psyche'],
      required: true,
    },
    before: { type: vectorSnapshotPointSchema, required: true },
    after: { type: vectorSnapshotPointSchema, required: true },
    delta: { type: Number, required: true },
    reason: {
      source: {
        type: String,
        enum: [
          'onboarding',
          'baseline_questionnaire',
          'state_questionnaire',
          'pair_questionnaire',
          'weekly_checkin',
          'manual_recalculation',
          'migration',
        ],
        required: true,
      },
      questionnaireId: { type: Schema.Types.Mixed },
      sessionId: { type: Schema.Types.Mixed },
      questionIds: { type: [Schema.Types.Mixed], default: [] },
    },
    scoringVersion: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'vector_snapshots', versionKey: false }
);

vectorSnapshotSchema.index({ userId: 1, createdAt: -1 });
vectorSnapshotSchema.index({ userId: 1, axis: 1, layer: 1, createdAt: -1 });
vectorSnapshotSchema.index({ pairId: 1, createdAt: -1 });

export const VectorSnapshot =
  (mongoose.models.VectorSnapshot as mongoose.Model<VectorSnapshotType>) ||
  mongoose.model<VectorSnapshotType>('VectorSnapshot', vectorSnapshotSchema);
