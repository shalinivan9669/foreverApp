import mongoose, { Schema } from "mongoose";

export const MATCHING_IMPORTANCE = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;
export const MATCHING_FLEXIBILITY = [
  "FLEXIBLE",
  "PREFER",
  "IMPORTANT",
  "NON_NEGOTIABLE",
] as const;
export const MATCHING_CONSTRAINT_MODES = ["NONE", "SOFT", "HARD"] as const;
export const MATCHING_TARGET_KINDS = [
  "SCALAR_RANGE",
  "CATEGORICAL_SET",
  "CONSTRAINT_SET",
  "ROLE_TARGET",
] as const;

export type StoredPartnerPreference = {
  factorKey: string;
  targetKind: (typeof MATCHING_TARGET_KINDS)[number];
  minimum?: number;
  maximum?: number;
  allowedValues?: string[];
  importance: (typeof MATCHING_IMPORTANCE)[number];
  flexibility: (typeof MATCHING_FLEXIBILITY)[number];
  constraintMode: (typeof MATCHING_CONSTRAINT_MODES)[number];
};

export interface PartnerPreferenceProfileType {
  ownerId: string;
  revision: number;
  registryKey: string;
  registryVersion: number;
  registryHash: string;
  preferences: StoredPartnerPreference[];
  inputHash: string;
  operationKeyHash?: string;
  operationRequestHash?: string;
  runId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const preferenceSchema = new Schema<StoredPartnerPreference>(
  {
    factorKey: { type: String, required: true, immutable: true, trim: true },
    targetKind: {
      type: String,
      enum: MATCHING_TARGET_KINDS,
      required: true,
      immutable: true,
    },
    minimum: { type: Number, immutable: true },
    maximum: { type: Number, immutable: true },
    allowedValues: { type: [String], immutable: true },
    importance: {
      type: String,
      enum: MATCHING_IMPORTANCE,
      required: true,
      immutable: true,
    },
    flexibility: {
      type: String,
      enum: MATCHING_FLEXIBILITY,
      required: true,
      immutable: true,
    },
    constraintMode: {
      type: String,
      enum: MATCHING_CONSTRAINT_MODES,
      required: true,
      immutable: true,
    },
  },
  { _id: false },
);

preferenceSchema.pre("validate", function () {
  const rangeTarget =
    this.targetKind === "SCALAR_RANGE" || this.targetKind === "ROLE_TARGET";
  if (rangeTarget) {
    if (
      !Number.isFinite(this.minimum) ||
      !Number.isFinite(this.maximum) ||
      Number(this.minimum) > Number(this.maximum)
    ) {
      this.invalidate("minimum", "Matching range target is invalid");
    }
    if ((this.allowedValues?.length ?? 0) > 0)
      this.invalidate("allowedValues", "Range targets cannot contain values");
    return;
  }
  if (
    !this.allowedValues?.length ||
    new Set(this.allowedValues).size !== this.allowedValues.length
  ) {
    this.invalidate("allowedValues", "Set target must contain unique values");
  }
  if (this.minimum !== undefined || this.maximum !== undefined)
    this.invalidate("minimum", "Set targets cannot contain a range");
});

const partnerPreferenceProfileSchema = new Schema<PartnerPreferenceProfileType>(
  {
    ownerId: { type: String, required: true, immutable: true, trim: true },
    revision: { type: Number, required: true, min: 1, immutable: true },
    registryKey: { type: String, required: true, immutable: true, trim: true },
    registryVersion: { type: Number, required: true, min: 1, immutable: true },
    registryHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
    preferences: { type: [preferenceSchema], required: true, immutable: true },
    inputHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
    },
    operationKeyHash: {
      type: String,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    operationRequestHash: {
      type: String,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    runId: { type: String, trim: true, select: false, immutable: true },
  },
  {
    collection: "partner_preference_profiles",
    timestamps: true,
    versionKey: false,
  },
);

partnerPreferenceProfileSchema.index(
  { ownerId: 1, revision: 1 },
  { unique: true, name: "partner_preferences_revision" },
);
partnerPreferenceProfileSchema.index(
  { ownerId: 1, operationKeyHash: 1 },
  {
    unique: true,
    name: "partner_preferences_operation_identity",
    partialFilterExpression: { operationKeyHash: { $type: "string" } },
  },
);
partnerPreferenceProfileSchema.index(
  { ownerId: 1, registryKey: 1, registryVersion: 1, revision: -1 },
  { name: "partner_preferences_latest" },
);
partnerPreferenceProfileSchema.index(
  { ownerId: 1, inputHash: 1, registryVersion: 1 },
  { name: "partner_preferences_input_lookup" },
);

export const PartnerPreferenceProfile =
  (mongoose.models
    .PartnerPreferenceProfile as mongoose.Model<PartnerPreferenceProfileType>) ||
  mongoose.model<PartnerPreferenceProfileType>(
    "PartnerPreferenceProfile",
    partnerPreferenceProfileSchema,
  );
