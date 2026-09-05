import mongoose, { Schema } from "mongoose";

export type DevelopmentRunType = {
  _id: string;
  contentKey: string;
  contentRevision: number;
  periodKey: string;
  pairId?: string;
  participantIds: string[];
  completedUserIds: string[];
  status: "ACTIVE" | "PARTIAL" | "COMPLETED";
  revision: number;
  createdAt: Date;
  completedAt?: Date;
};
const schema = new Schema<DevelopmentRunType>(
  {
    _id: { type: String, required: true },
    contentKey: { type: String, required: true, immutable: true },
    contentRevision: { type: Number, required: true, immutable: true },
    periodKey: { type: String, required: true, immutable: true },
    pairId: { type: String, immutable: true },
    participantIds: { type: [String], required: true, immutable: true },
    completedUserIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["ACTIVE", "PARTIAL", "COMPLETED"],
      default: "ACTIVE",
    },
    revision: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, immutable: true },
    completedAt: Date,
  },
  { collection: "development_runs", versionKey: false },
);
schema.index({ participantIds: 1, createdAt: -1 });
schema.index({ pairId: 1, createdAt: -1 });
export const DevelopmentRun =
  (mongoose.models.DevelopmentRun as mongoose.Model<DevelopmentRunType>) ||
  mongoose.model<DevelopmentRunType>("DevelopmentRun", schema);
