import mongoose, { Schema } from 'mongoose';
import type {
  PairStrategyDefinition,
  PairStrategyType,
  RelationshipContext,
} from '@/domain/model/pair/strategyTypes';
import {
  PairEvaluationSchema,
  SnapshotVersionsSchema,
  type StoredPairEvaluation,
  type StoredSnapshotVersions,
  validateStoredSnapshotInterval,
} from '@/models/factorEngineSchemas';

export interface PairFactorEvaluationSnapshotType {
  snapshotId: string;
  pairId: string;
  memberAId: string;
  memberBId: string;
  factorKey: string;
  context: RelationshipContext;
  strategy: PairStrategyType;
  strategyVersion: number;
  directionality: PairStrategyDefinition['directionality'];
  revision: number;
  evaluation: StoredPairEvaluation;
  individualSnapshotIds: [string, string];
  pairSnapshotId?: string;
  versions: StoredSnapshotVersions;
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
}

const pairFactorEvaluationSnapshotSchema =
  new Schema<PairFactorEvaluationSnapshotType>(
    {
      snapshotId: { type: String, required: true, immutable: true },
      pairId: { type: String, required: true, immutable: true },
      memberAId: { type: String, required: true, immutable: true },
      memberBId: { type: String, required: true, immutable: true },
      factorKey: { type: String, required: true, immutable: true },
      context: {
        type: String,
        enum: [
          'SELF',
          'DATING',
          'EARLY_RELATIONSHIP',
          'COMMITTED_RELATIONSHIP',
          'COHABITATION',
          'MARRIAGE_PLANNING',
          'PARENTING_PLANNING',
          'PARENTING',
        ],
        required: true,
        immutable: true,
      },
      strategy: {
        type: String,
        enum: [
          'SIMILARITY',
          'BOUNDED_GAP',
          'TARGET_RANGE',
          'COMPLEMENT',
          'BOUNDED_COMPLEMENT',
          'MINIMUM_BOTH',
          'ROLE_COVERAGE',
          'DIRECTIONAL_EXPECTATION',
          'CUSTOM_MATRIX',
          'HARD_CONSTRAINT',
        ],
        required: true,
        immutable: true,
      },
      strategyVersion: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
      },
      directionality: {
        type: String,
        enum: ['SYMMETRIC', 'DIRECTIONAL'],
        required: true,
        immutable: true,
      },
      revision: { type: Number, required: true, min: 0, immutable: true },
      evaluation: { type: PairEvaluationSchema, required: true, immutable: true },
      individualSnapshotIds: {
        type: [String],
        required: true,
        immutable: true,
        validate: {
          validator: (ids: string[]) => ids.length === 2 && ids[0] !== ids[1],
          message: 'Pair evaluation requires two different individual snapshots',
        },
      },
      pairSnapshotId: { type: String, immutable: true },
      versions: { type: SnapshotVersionsSchema, required: true, immutable: true },
      inputHash: { type: String, required: true, immutable: true },
      outputHash: { type: String, required: true, immutable: true },
      calculatedAt: { type: Date, required: true, immutable: true },
      effectiveFrom: { type: Date, required: true, immutable: true },
      effectiveUntil: { type: Date, immutable: true },
    },
    { collection: 'pair_factor_evaluation_snapshots', versionKey: false }
  );

pairFactorEvaluationSnapshotSchema.pre('validate', function () {
  if (!validateStoredSnapshotInterval(this)) {
    this.invalidate(
      'effectiveFrom',
      'Snapshot effective interval must be canonical and non-empty'
    );
  }
});

pairFactorEvaluationSnapshotSchema.index({ snapshotId: 1 }, { unique: true });
pairFactorEvaluationSnapshotSchema.index(
  { pairId: 1, factorKey: 1, context: 1, strategy: 1, revision: 1 },
  { unique: true }
);
pairFactorEvaluationSnapshotSchema.index(
  {
    pairId: 1,
    factorKey: 1,
    context: 1,
    strategy: 1,
    inputHash: 1,
    'versions.algorithmVersion': 1,
    'versions.snapshotVersion': 1,
  },
  { unique: true }
);
pairFactorEvaluationSnapshotSchema.index({ pairId: 1, calculatedAt: -1 });
pairFactorEvaluationSnapshotSchema.index({
  pairId: 1,
  factorKey: 1,
  context: 1,
  strategy: 1,
  strategyVersion: 1,
  directionality: 1,
  effectiveFrom: -1,
  effectiveUntil: 1,
});
pairFactorEvaluationSnapshotSchema.index(
  {
    pairId: 1,
    factorKey: 1,
    context: 1,
    strategy: 1,
    strategyVersion: 1,
    directionality: 1,
    revision: -1,
  },
  { name: 'pair_factor_evaluation_current_history' }
);

export const PairFactorEvaluationSnapshot =
  (mongoose.models.PairFactorEvaluationSnapshot as mongoose.Model<PairFactorEvaluationSnapshotType>) ||
  mongoose.model<PairFactorEvaluationSnapshotType>(
    'PairFactorEvaluationSnapshot',
    pairFactorEvaluationSnapshotSchema
  );
