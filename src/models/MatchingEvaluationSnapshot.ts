import mongoose, { Schema } from "mongoose";

export const MATCHING_FACTOR_RESULT_STATUSES = [
  "ALIGNED",
  "WORKABLE_DIFFERENCE",
  "COMPLEMENTARY",
  "ROLE_GAP",
  "FRICTION",
  "HARD_CONFLICT",
  "INSUFFICIENT_DATA",
] as const;

export interface StoredMatchingFactorResult {
  factorKey: string;
  status: (typeof MATCHING_FACTOR_RESULT_STATUSES)[number];
  requesterFit?: number;
  candidateFit?: number;
  mutualFit?: number;
  confidence: number;
  coverage: number;
  rankingContribution?: number;
  reasonCode: string;
  explanationKey?: string;
}

export interface MatchingEvaluationSnapshotType {
  evaluationId: string;
  requesterId: string;
  candidateId: string;
  requesterExpectationFit?: number;
  candidateExpectationFit?: number;
  mutualFactorFit?: number;
  eligible: boolean;
  eligibilityReasonCode: string;
  rankingScore?: number;
  confidence: number;
  coverage: number;
  factorResults: StoredMatchingFactorResult[];
  explanationKeys: string[];
  versions: {
    registryHash: string;
    registryVersion: number;
    algorithmVersion: number;
    requesterActualRevision: number;
    candidateActualRevision: number;
    requesterPreferenceRevision: number;
    candidatePreferenceRevision: number;
    requesterActualInputHash: string;
    candidateActualInputHash: string;
    requesterPreferenceInputHash: string;
    candidatePreferenceInputHash: string;
  };
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
  expiresAt: Date;
  runId?: string;
}

const bounded01 = {
  type: Number,
  required: true,
  min: 0,
  max: 1,
  immutable: true,
} as const;
const optionalBounded01 = {
  type: Number,
  min: 0,
  max: 1,
  immutable: true,
} as const;

const matchingFactorResultSchema = new Schema<StoredMatchingFactorResult>(
  {
    factorKey: { type: String, required: true, immutable: true, trim: true },
    status: {
      type: String,
      enum: MATCHING_FACTOR_RESULT_STATUSES,
      required: true,
      immutable: true,
    },
    requesterFit: { type: Number, min: 0, max: 1, immutable: true },
    candidateFit: { type: Number, min: 0, max: 1, immutable: true },
    mutualFit: { type: Number, min: 0, max: 1, immutable: true },
    confidence: bounded01,
    coverage: bounded01,
    rankingContribution: { type: Number, min: 0, max: 1, immutable: true },
    reasonCode: { type: String, required: true, immutable: true, trim: true },
    explanationKey: { type: String, immutable: true, trim: true },
  },
  { _id: false },
);

const versionsSchema = new Schema<MatchingEvaluationSnapshotType["versions"]>(
  {
    registryHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
    registryVersion: { type: Number, required: true, min: 1, immutable: true },
    algorithmVersion: { type: Number, required: true, min: 1, immutable: true },
    requesterActualRevision: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    candidateActualRevision: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    requesterPreferenceRevision: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    candidatePreferenceRevision: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    requesterActualInputHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
    candidateActualInputHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
    requesterPreferenceInputHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
    candidatePreferenceInputHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
  },
  { _id: false },
);

const matchingEvaluationSnapshotSchema =
  new Schema<MatchingEvaluationSnapshotType>(
    {
      evaluationId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },
      requesterId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },
      candidateId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },
      requesterExpectationFit: optionalBounded01,
      candidateExpectationFit: optionalBounded01,
      mutualFactorFit: optionalBounded01,
      eligible: { type: Boolean, required: true, immutable: true },
      eligibilityReasonCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },
      rankingScore: optionalBounded01,
      confidence: bounded01,
      coverage: bounded01,
      factorResults: {
        type: [matchingFactorResultSchema],
        required: true,
        immutable: true,
      },
      explanationKeys: {
        type: [String],
        required: true,
        immutable: true,
        validate: {
          validator: (values: string[]) => values.length <= 3,
          message: "At most three explanations are allowed",
        },
      },
      versions: { type: versionsSchema, required: true, immutable: true },
      inputHash: {
        type: String,
        required: true,
        minlength: 64,
        maxlength: 64,
        immutable: true,
      },
      outputHash: {
        type: String,
        required: true,
        minlength: 64,
        maxlength: 64,
        immutable: true,
      },
      calculatedAt: { type: Date, required: true, immutable: true },
      expiresAt: { type: Date, required: true, immutable: true },
      runId: { type: String, trim: true, select: false, immutable: true },
    },
    { collection: "matching_evaluation_snapshots", versionKey: false },
  );

matchingEvaluationSnapshotSchema.index(
  { evaluationId: 1 },
  { unique: true, name: "matching_evaluation_id" },
);
matchingEvaluationSnapshotSchema.index(
  { requesterId: 1, candidateId: 1, inputHash: 1 },
  { unique: true, name: "matching_evaluation_input" },
);
matchingEvaluationSnapshotSchema.index(
  { requesterId: 1, candidateId: 1, calculatedAt: -1 },
  { name: "matching_evaluation_latest" },
);
matchingEvaluationSnapshotSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "matching_evaluation_expiry" },
);

export const MatchingEvaluationSnapshot =
  (mongoose.models
    .MatchingEvaluationSnapshot as mongoose.Model<MatchingEvaluationSnapshotType>) ||
  mongoose.model<MatchingEvaluationSnapshotType>(
    "MatchingEvaluationSnapshot",
    matchingEvaluationSnapshotSchema,
  );
