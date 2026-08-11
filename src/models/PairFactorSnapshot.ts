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

export interface PairFactorSnapshotType {
  snapshotId: string;
  pairId: string;
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

const pairFactorSnapshotSchema = new Schema<PairFactorSnapshotType>(
  {
    snapshotId: { type: String, required: true, immutable: true },
    pairId: { type: String, required: true, immutable: true },
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
  { collection: 'pair_factor_snapshots', versionKey: false }
);

pairFactorSnapshotSchema.pre('validate', function () {
  if (!validateStoredSnapshotInterval(this)) {
    this.invalidate(
      'effectiveFrom',
      'Snapshot effective interval must be canonical and non-empty'
    );
  }
});

pairFactorSnapshotSchema.index({ snapshotId: 1 }, { unique: true });
pairFactorSnapshotSchema.index(
  { pairId: 1, factorKey: 1, revision: 1 },
  { unique: true }
);
pairFactorSnapshotSchema.index(
  {
    pairId: 1,
    factorKey: 1,
    inputHash: 1,
    'versions.algorithmVersion': 1,
    'versions.snapshotVersion': 1,
  },
  { unique: true }
);
pairFactorSnapshotSchema.index({ pairId: 1, factorKey: 1, revision: -1 });
pairFactorSnapshotSchema.index({
  pairId: 1,
  factorKey: 1,
  effectiveFrom: -1,
  effectiveUntil: 1,
});

export const PairFactorSnapshot =
  (mongoose.models.PairFactorSnapshot as mongoose.Model<PairFactorSnapshotType>) ||
  mongoose.model<PairFactorSnapshotType>(
    'PairFactorSnapshot',
    pairFactorSnapshotSchema
  );
