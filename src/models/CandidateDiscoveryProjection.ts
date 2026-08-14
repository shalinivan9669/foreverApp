import mongoose, { Schema } from "mongoose";

export interface CandidateDiscoveryProjectionType {
  userId: string;
  active: boolean;
  requiredDataReady: boolean;
  age: number;
  city?: string;
  location?: { type: "Point"; coordinates: [number, number] };
  relationshipIntent: "SEEKING_RELATIONSHIP";
  publicCardRevision: number;
  actualProfileRevision: number;
  preferenceRevision: number;
  registryVersion: number;
  algorithmVersion: number;
  projectionHash: string;
  runId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const candidateDiscoveryProjectionSchema =
  new Schema<CandidateDiscoveryProjectionType>(
    {
      userId: { type: String, required: true, immutable: true, trim: true },
      active: { type: Boolean, required: true },
      requiredDataReady: { type: Boolean, required: true },
      age: { type: Number, required: true, min: 18, max: 120 },
      city: { type: String, trim: true, maxlength: 120 },
      location: {
        type: { type: String, enum: ["Point"] },
        coordinates: { type: [Number] },
      },
      relationshipIntent: {
        type: String,
        enum: ["SEEKING_RELATIONSHIP"],
        required: true,
      },
      publicCardRevision: { type: Number, required: true, min: 1 },
      actualProfileRevision: { type: Number, required: true, min: 0 },
      preferenceRevision: { type: Number, required: true, min: 0 },
      registryVersion: { type: Number, required: true, min: 1 },
      algorithmVersion: { type: Number, required: true, min: 1 },
      projectionHash: {
        type: String,
        required: true,
        minlength: 64,
        maxlength: 64,
      },
      runId: { type: String, trim: true, select: false },
    },
    {
      collection: "candidate_discovery_projections",
      timestamps: true,
      versionKey: false,
    },
  );

candidateDiscoveryProjectionSchema.index(
  { userId: 1 },
  { unique: true, name: "candidate_discovery_user" },
);
candidateDiscoveryProjectionSchema.index(
  {
    active: 1,
    requiredDataReady: 1,
    relationshipIntent: 1,
    age: 1,
    updatedAt: -1,
    userId: 1,
  },
  {
    name: "candidate_discovery_eligibility",
    partialFilterExpression: { active: true, requiredDataReady: true },
  },
);
candidateDiscoveryProjectionSchema.index(
  { city: 1, active: 1, requiredDataReady: 1, age: 1, userId: 1 },
  { name: "candidate_discovery_city" },
);
candidateDiscoveryProjectionSchema.index(
  { location: "2dsphere" },
  { name: "candidate_discovery_location", sparse: true },
);

export const CandidateDiscoveryProjection =
  (mongoose.models
    .CandidateDiscoveryProjection as mongoose.Model<CandidateDiscoveryProjectionType>) ||
  mongoose.model<CandidateDiscoveryProjectionType>(
    "CandidateDiscoveryProjection",
    candidateDiscoveryProjectionSchema,
  );
