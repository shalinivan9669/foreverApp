import mongoose, { Schema } from 'mongoose';

export type ScoringVersionStatus = 'draft' | 'active' | 'deprecated';

export type ScoringConfigNested = Record<string, string | number | boolean | null>;

export type ScoringConfigValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | ScoringConfigNested;

export interface ScoringVersionType {
  key: string;
  status: ScoringVersionStatus;
  config: { [key: string]: ScoringConfigValue };
  notes?: string;
  activatedAt?: Date;
  deprecatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const scoringVersionSchema = new Schema<ScoringVersionType>(
  {
    key: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'deprecated'],
      required: true,
      default: 'draft',
    },
    config: { type: Schema.Types.Mixed, required: true },
    notes: { type: String },
    activatedAt: { type: Date },
    deprecatedAt: { type: Date },
  },
  { collection: 'scoring_versions', timestamps: true }
);

scoringVersionSchema.index({ status: 1 });

export const ScoringVersion =
  (mongoose.models.ScoringVersion as mongoose.Model<ScoringVersionType>) ||
  mongoose.model<ScoringVersionType>('ScoringVersion', scoringVersionSchema);
