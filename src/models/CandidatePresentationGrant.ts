import mongoose, { Schema, Types } from "mongoose";

export interface CandidatePresentationGrantType {
  _id: Types.ObjectId;
  tokenHash: string;
  requesterId: string;
  candidateId: string;
  evaluationId: string;
  requesterProfileRevision: number;
  candidateProfileRevision: number;
  requesterCardRevision: number;
  candidateCardRevision: number;
  requesterPreferenceRevision: number;
  candidatePreferenceRevision: number;
  registryVersion: number;
  algorithmVersion: number;
  expiresAt: Date;
  revokedAt?: Date;
  usedByLikeId?: Types.ObjectId;
  runId?: string;
  createdAt: Date;
}

const candidatePresentationGrantSchema =
  new Schema<CandidatePresentationGrantType>(
    {
      tokenHash: {
        type: String,
        required: true,
        immutable: true,
        select: false,
        minlength: 64,
        maxlength: 64,
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
      evaluationId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },
      requesterProfileRevision: {
        type: Number,
        required: true,
        min: 0,
        immutable: true,
      },
      candidateProfileRevision: {
        type: Number,
        required: true,
        min: 0,
        immutable: true,
      },
      requesterCardRevision: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
      },
      candidateCardRevision: {
        type: Number,
        required: true,
        min: 1,
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
      registryVersion: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
      },
      algorithmVersion: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
      },
      expiresAt: { type: Date, required: true, immutable: true },
      revokedAt: { type: Date },
      usedByLikeId: { type: Schema.Types.ObjectId, ref: "Like" },
      runId: { type: String, trim: true, select: false, immutable: true },
    },
    {
      collection: "candidate_presentation_grants",
      timestamps: { createdAt: true, updatedAt: false },
      versionKey: false,
    },
  );

candidatePresentationGrantSchema.index(
  { tokenHash: 1 },
  { unique: true, name: "candidate_grant_token" },
);
candidatePresentationGrantSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "candidate_grant_expiry" },
);
candidatePresentationGrantSchema.index(
  { requesterId: 1, candidateId: 1, expiresAt: -1 },
  { name: "candidate_grant_requester_candidate" },
);

export const CandidatePresentationGrant =
  (mongoose.models
    .CandidatePresentationGrant as mongoose.Model<CandidatePresentationGrantType>) ||
  mongoose.model<CandidatePresentationGrantType>(
    "CandidatePresentationGrant",
    candidatePresentationGrantSchema,
  );
