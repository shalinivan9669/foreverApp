import mongoose, { Schema } from "mongoose";

export interface MatchingFeedSessionType {
  tokenHash: string;
  requesterId: string;
  queryHash: string;
  requesterProfileRevision: number;
  requesterPreferenceRevision: number;
  registryVersion: number;
  algorithmVersion: number;
  candidateIds: string[];
  expiresAt: Date;
  runId?: string;
  createdAt: Date;
}

const matchingFeedSessionSchema = new Schema<MatchingFeedSessionType>(
  {
    tokenHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      minlength: 64,
      maxlength: 64,
    },
    requesterId: { type: String, required: true, immutable: true, trim: true },
    queryHash: {
      type: String,
      required: true,
      immutable: true,
      minlength: 64,
      maxlength: 64,
    },
    requesterProfileRevision: {
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
    registryVersion: { type: Number, required: true, min: 1, immutable: true },
    algorithmVersion: { type: Number, required: true, min: 1, immutable: true },
    candidateIds: {
      type: [String],
      required: true,
      immutable: true,
      validate: {
        validator: (ids: string[]) => ids.length <= 200,
        message: "Feed session is bounded to 200 candidates",
      },
    },
    expiresAt: { type: Date, required: true, immutable: true },
    runId: { type: String, trim: true, select: false, immutable: true },
  },
  {
    collection: "matching_feed_sessions",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

matchingFeedSessionSchema.index(
  { tokenHash: 1 },
  { unique: true, name: "matching_feed_session_token" },
);
matchingFeedSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "matching_feed_session_expiry" },
);
matchingFeedSessionSchema.index(
  { requesterId: 1, createdAt: -1 },
  { name: "matching_feed_session_requester" },
);

export const MatchingFeedSession =
  (mongoose.models
    .MatchingFeedSession as mongoose.Model<MatchingFeedSessionType>) ||
  mongoose.model<MatchingFeedSessionType>(
    "MatchingFeedSession",
    matchingFeedSessionSchema,
  );
