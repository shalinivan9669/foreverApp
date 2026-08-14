import mongoose, { Schema, Types } from "mongoose";

export const MATCHING_CONNECTION_STAGES = [
  "MATCHED",
  "TALKING",
  "DATING",
  "COUPLE_CONFIRMED",
] as const;
export const MATCHING_CONNECTION_STATUSES = [
  "ACTIVE",
  "CLOSED",
  "BLOCKED",
] as const;

export interface MatchingConnectionType {
  _id: Types.ObjectId;
  participantIds: [string, string];
  participantKey: string;
  sourceLikeIds: string[];
  stage: (typeof MATCHING_CONNECTION_STAGES)[number];
  status: (typeof MATCHING_CONNECTION_STATUSES)[number];
  coupleConfirmation: {
    requestedBy?: string;
    requestedAt?: Date;
    confirmedBy: string[];
    revision: number;
  };
  pairId?: Types.ObjectId;
  revision: number;
  runId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const confirmationSchema = new Schema<
  MatchingConnectionType["coupleConfirmation"]
>(
  {
    requestedBy: { type: String, trim: true },
    requestedAt: { type: Date },
    confirmedBy: { type: [String], required: true, default: [] },
    revision: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

const matchingConnectionSchema = new Schema<MatchingConnectionType>(
  {
    participantIds: {
      type: [String],
      required: true,
      immutable: true,
      validate: {
        validator: (values: string[]) =>
          values.length === 2 &&
          values[0] !== values[1] &&
          values[0] < values[1],
        message:
          "Connection participants must be unique and canonically sorted",
      },
    },
    participantKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },
    sourceLikeIds: { type: [String], required: true },
    stage: {
      type: String,
      enum: MATCHING_CONNECTION_STAGES,
      required: true,
      default: "MATCHED",
    },
    status: {
      type: String,
      enum: MATCHING_CONNECTION_STATUSES,
      required: true,
      default: "ACTIVE",
    },
    coupleConfirmation: {
      type: confirmationSchema,
      required: true,
      default: () => ({ confirmedBy: [], revision: 0 }),
    },
    pairId: { type: Schema.Types.ObjectId, ref: "Pair" },
    revision: { type: Number, required: true, min: 0, default: 0 },
    runId: { type: String, trim: true, select: false },
  },
  { collection: "matching_connections", timestamps: true, versionKey: false },
);

matchingConnectionSchema.index(
  { participantKey: 1 },
  {
    unique: true,
    name: "matching_connection_active_participants",
    partialFilterExpression: { status: "ACTIVE" },
  },
);
matchingConnectionSchema.index(
  { participantIds: 1, status: 1, updatedAt: -1 },
  { name: "matching_connection_participant_status" },
);
matchingConnectionSchema.index(
  { pairId: 1 },
  {
    unique: true,
    name: "matching_connection_pair",
    partialFilterExpression: { pairId: { $type: "objectId" } },
  },
);

export const MatchingConnection =
  (mongoose.models
    .MatchingConnection as mongoose.Model<MatchingConnectionType>) ||
  mongoose.model<MatchingConnectionType>(
    "MatchingConnection",
    matchingConnectionSchema,
  );
