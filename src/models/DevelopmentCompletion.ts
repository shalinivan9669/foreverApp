import mongoose, { Schema } from "mongoose";

export type DevelopmentCompletionType = {
  _id: string;
  userId: string;
  runId: string;
  contentKey: string;
  contentRevision: number;
  answers: Array<{ question: number; value: number | null }>;
  feedback: "HELPFUL" | "NEUTRAL" | "NOT_FOR_ME";
  privateNote: string;
  payloadHash: string;
  createdAt: Date;
};
const schema = new Schema<DevelopmentCompletionType>(
  {
    _id: { type: String, required: true, immutable: true },
    userId: { type: String, required: true, immutable: true },
    runId: { type: String, required: true, immutable: true },
    contentKey: { type: String, required: true, immutable: true },
    contentRevision: { type: Number, required: true, immutable: true },
    answers: {
      type: [
        {
          _id: false,
          question: { type: Number, required: true },
          value: { type: Number, min: 0, max: 3, default: null },
        },
      ],
      default: [],
      immutable: true,
    },
    feedback: {
      type: String,
      enum: ["HELPFUL", "NEUTRAL", "NOT_FOR_ME"],
      required: true,
      immutable: true,
    },
    privateNote: {
      type: String,
      maxlength: 2000,
      default: "",
      immutable: true,
    },
    payloadHash: { type: String, required: true, immutable: true },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { collection: "development_completions", versionKey: false },
);
schema.index({ userId: 1, runId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
export const DevelopmentCompletion =
  (mongoose.models
    .DevelopmentCompletion as mongoose.Model<DevelopmentCompletionType>) ||
  mongoose.model<DevelopmentCompletionType>("DevelopmentCompletion", schema);
