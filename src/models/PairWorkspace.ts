import mongoose, { Schema } from "mongoose";
import type {
  SharedLifeEntryInput,
  SharedLifeSettings,
} from "@/lib/contracts/sharedLife";

export type SharedLifeRecord = {
  id: string;
  data: SharedLifeEntryInput;
  createdBy: "A" | "B";
  updatedBy: "A" | "B";
  createdAt: Date;
  updatedAt: Date;
};
export type PairWorkspaceType = {
  _id: string;
  revision: number;
  entries: SharedLifeRecord[];
  settings: SharedLifeSettings;
  changes: Array<{
    revision: number;
    action: "SAVE" | "DELETE" | "SETTINGS";
    actor: "A" | "B";
    entryId?: string;
    at: Date;
  }>;
};
// Input uses a strict discriminated union. Explicit nested paths avoid Mixed/raw payload persistence.
const dataSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["EVENT", "TASK", "SHOPPING", "GOAL", "BUDGET", "MEMORY"],
      required: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    note: { type: String, maxlength: 2000 },
    date: String,
    repeat: { type: String, enum: ["NONE", "WEEKLY", "MONTHLY", "YEARLY"] },
    lastCompletedDate: String,
    place: String,
    status: { type: String, enum: ["OPEN", "DONE"] },
    assignee: { type: String, enum: ["A", "B", "BOTH"] },
    effortMinutes: Number,
    quantity: String,
    reservedBy: { type: String, enum: ["A", "B", "NONE"] },
    milestones: {
      type: [
        { _id: false, title: { type: String, maxlength: 160 }, done: Boolean },
      ],
      default: undefined,
    },
    direction: { type: String, enum: ["INCOME", "EXPENSE", "CONTRIBUTION"] },
    amountMinor: Number,
    currency: String,
    photoLink: String,
  },
  { _id: false, strict: "throw" },
);
const schema = new Schema<PairWorkspaceType>(
  {
    _id: { type: String, required: true },
    revision: { type: Number, default: 0 },
    entries: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          data: { type: dataSchema, required: true },
          createdBy: String,
          updatedBy: String,
          createdAt: Date,
          updatedAt: Date,
        },
      ],
      default: [],
    },
    settings: {
      type: new Schema(
        {
          relationshipStartDate: String,
          holidaysEnabled: Boolean,
          authorEventsEnabled: Boolean,
          reminderLeadDays: Number,
          defaultCurrency: String,
        },
        { _id: false },
      ),
      required: true,
    },
    changes: {
      type: [
        {
          _id: false,
          revision: Number,
          action: String,
          actor: String,
          entryId: String,
          at: Date,
        },
      ],
      default: [],
    },
  },
  { collection: "pair_workspaces", versionKey: false },
);
export const PairWorkspace =
  (mongoose.models.PairWorkspace as mongoose.Model<PairWorkspaceType>) ||
  mongoose.model<PairWorkspaceType>("PairWorkspace", schema);
