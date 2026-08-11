import mongoose, { Schema } from 'mongoose';
import {
  AggregationMetricsSchema,
  FACTOR_AGGREGATION_STATUSES,
  FactorValueSchema,
  SnapshotVersionsSchema,
  type StoredAggregationMetrics,
  type StoredFactorValue,
  type StoredSnapshotVersions,
  validateStoredSnapshotInterval,
} from '@/models/factorEngineSchemas';
import type { FactorAggregationStatus } from '@/domain/model/aggregation/factorAggregation';
import type { EvidencePurpose } from '@/domain/model/evidence/evidence';

export interface IndividualFactorSnapshotType {
  snapshotId: string;
  subjectId: string;
  contextPairId?: string;
  projectionPurpose: EvidencePurpose;
  factorKey: string;
  revision: number;
  status: FactorAggregationStatus;
  value: StoredFactorValue;
  metrics: StoredAggregationMetrics;
  evidenceIds: string[];
  versions: StoredSnapshotVersions;
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
}

const individualFactorSnapshotSchema =
  new Schema<IndividualFactorSnapshotType>(
    {
      snapshotId: { type: String, required: true, immutable: true },
      subjectId: { type: String, required: true, immutable: true },
      contextPairId: { type: String, immutable: true },
      projectionPurpose: {
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
      factorKey: { type: String, required: true, immutable: true },
      revision: { type: Number, required: true, min: 0, immutable: true },
      status: {
        type: String,
        enum: FACTOR_AGGREGATION_STATUSES,
        required: true,
        immutable: true,
      },
      value: { type: FactorValueSchema, required: true, immutable: true },
      metrics: { type: AggregationMetricsSchema, required: true, immutable: true },
      evidenceIds: { type: [String], required: true, immutable: true },
      versions: { type: SnapshotVersionsSchema, required: true, immutable: true },
      inputHash: { type: String, required: true, immutable: true },
      outputHash: { type: String, required: true, immutable: true },
      calculatedAt: { type: Date, required: true, immutable: true },
      effectiveFrom: { type: Date, required: true, immutable: true },
      effectiveUntil: { type: Date, immutable: true },
    },
    { collection: 'individual_factor_snapshots', versionKey: false }
  );

individualFactorSnapshotSchema.pre('validate', function () {
  if (!validateStoredSnapshotInterval(this)) {
    this.invalidate(
      'effectiveFrom',
      'Snapshot effective interval must be canonical and non-empty'
    );
  }
});

individualFactorSnapshotSchema.index({ snapshotId: 1 }, { unique: true });
individualFactorSnapshotSchema.index(
  {
    subjectId: 1,
    contextPairId: 1,
    projectionPurpose: 1,
    factorKey: 1,
    revision: 1,
  },
  { unique: true }
);
individualFactorSnapshotSchema.index(
  {
    subjectId: 1,
    contextPairId: 1,
    projectionPurpose: 1,
    factorKey: 1,
    inputHash: 1,
    'versions.algorithmVersion': 1,
    'versions.snapshotVersion': 1,
  },
  { unique: true }
);
individualFactorSnapshotSchema.index({
  subjectId: 1,
  contextPairId: 1,
  projectionPurpose: 1,
  factorKey: 1,
  revision: -1,
});
individualFactorSnapshotSchema.index({
  subjectId: 1,
  contextPairId: 1,
  projectionPurpose: 1,
  factorKey: 1,
  effectiveFrom: -1,
  effectiveUntil: 1,
});
individualFactorSnapshotSchema.index(
  {
    subjectId: 1,
    projectionPurpose: 1,
    factorKey: 1,
    calculatedAt: -1,
    revision: -1,
  },
  { name: 'owner_factor_profile_latest' }
);

export const IndividualFactorSnapshot =
  (mongoose.models.IndividualFactorSnapshot as mongoose.Model<IndividualFactorSnapshotType>) ||
  mongoose.model<IndividualFactorSnapshotType>(
    'IndividualFactorSnapshot',
    individualFactorSnapshotSchema
  );
