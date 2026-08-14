import mongoose, { Schema } from "mongoose";

export interface MatchingUseGrantType {
  ownerId: string;
  factorKey: string;
  revision: number;
  allowed: boolean;
  consentRevision: string;
  grantedAt: Date;
  revokedAt?: Date;
  runId?: string;
  createdAt: Date;
}

const matchingUseGrantSchema = new Schema<MatchingUseGrantType>(
  {
    ownerId: { type: String, required: true, immutable: true, trim: true },
    factorKey: { type: String, required: true, immutable: true, trim: true },
    revision: { type: Number, required: true, min: 1, immutable: true },
    allowed: { type: Boolean, required: true, immutable: true },
    consentRevision: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },
    grantedAt: { type: Date, required: true, immutable: true },
    revokedAt: { type: Date, immutable: true },
    runId: { type: String, trim: true, select: false, immutable: true },
  },
  { collection: "matching_use_grants", versionKey: false },
);

matchingUseGrantSchema.pre("validate", function () {
  if (this.allowed && this.revokedAt)
    this.invalidate("revokedAt", "An active grant cannot be revoked");
  if (!this.allowed && !this.revokedAt)
    this.invalidate("revokedAt", "A denied grant requires revocation time");
});
matchingUseGrantSchema.index(
  { ownerId: 1, factorKey: 1, revision: 1 },
  { unique: true, name: "matching_use_grant_revision" },
);
matchingUseGrantSchema.index(
  { ownerId: 1, factorKey: 1, revision: -1 },
  { name: "matching_use_grant_latest" },
);

export const MatchingUseGrant =
  (mongoose.models.MatchingUseGrant as mongoose.Model<MatchingUseGrantType>) ||
  mongoose.model<MatchingUseGrantType>(
    "MatchingUseGrant",
    matchingUseGrantSchema,
  );
