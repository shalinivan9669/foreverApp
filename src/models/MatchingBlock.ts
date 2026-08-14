import mongoose, { Schema } from "mongoose";

export interface MatchingBlockType {
  blockerId: string;
  blockedId: string;
  participantKey: string;
  status: "ACTIVE" | "REVOKED";
  revokedAt?: Date;
  runId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const matchingBlockSchema = new Schema<MatchingBlockType>(
  {
    blockerId: { type: String, required: true, immutable: true, trim: true },
    blockedId: { type: String, required: true, immutable: true, trim: true },
    participantKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      required: true,
      default: "ACTIVE",
    },
    revokedAt: { type: Date },
    runId: { type: String, trim: true, select: false, immutable: true },
  },
  { collection: "matching_blocks", timestamps: true, versionKey: false },
);

matchingBlockSchema.pre("validate", function () {
  if (this.blockerId === this.blockedId)
    this.invalidate("blockedId", "A user cannot block themselves");
  if (this.status === "ACTIVE" && this.revokedAt)
    this.invalidate("revokedAt", "An active block cannot be revoked");
  if (this.status === "REVOKED" && !this.revokedAt)
    this.invalidate("revokedAt", "A revoked block requires a timestamp");
});
matchingBlockSchema.index(
  { blockerId: 1, blockedId: 1 },
  { unique: true, name: "matching_block_direction" },
);
matchingBlockSchema.index(
  { participantKey: 1, status: 1 },
  { name: "matching_block_pair_status" },
);
matchingBlockSchema.index(
  { blockedId: 1, status: 1, blockerId: 1 },
  { name: "matching_block_reverse" },
);

export const MatchingBlock =
  (mongoose.models.MatchingBlock as mongoose.Model<MatchingBlockType>) ||
  mongoose.model<MatchingBlockType>("MatchingBlock", matchingBlockSchema);
