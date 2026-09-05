import mongoose, { Schema } from "mongoose";
import type { MatchingAnswers } from "@/domain/model/matching/socialContract";

export type MatchingCard = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: MatchingAnswers;
  boundaries?: [string, string, string];
  boundaryDealbreakers?: [boolean, boolean, boolean];
  cardVersion?: 1 | 2;
};

export type MatchingActualInput = {
  relationshipIntent?:
    "GETTING_TO_KNOW" | "OPEN_TO_RELATIONSHIP" | "LOOKING_FOR_LONG_TERM";
  childrenIntent?: "YES" | "NO" | "UNSURE";
  structurePreference?: number;
  socialActivityPreference?: number;
  cleaningPreference?: number;
  repairSkill?: number;
  relationshipPriority?: number;
};

export interface MatchingProfileType {
  userId: string;
  card: MatchingCard;
  discoveryRequested: boolean;
  active: boolean;
  requiredDataReady: boolean;
  desiredAgeRange: { min: number; max: number };
  maxDistanceKm: number;
  soughtGender?: "ANY" | "male" | "female";
  city?: string;
  publicCardRevision: number;
  actualProfileRevision: number;
  preferenceRevision: number;
  registryVersion: number;
  algorithmVersion: number;
  projectionHash: string;
  lastCardOperationKeyHash?: string;
  lastCardOperationRequestHash?: string;
  runId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const nonEmptyText = (maximum: number) => ({
  validator: (value: string) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 && normalized.length <= maximum;
  },
  message: `Text must contain 1..${maximum} characters`,
});

const exactLength = (length: number) => ({
  validator: (values: string[]) =>
    Array.isArray(values) && values.length === length,
  message: `Array must contain exactly ${length} values`,
});

const matchingCardSchema = new Schema<MatchingCard>(
  {
    requirements: {
      type: [String],
      required: true,
      validate: [
        exactLength(3),
        {
          validator: (values: string[]) =>
            values.every((value) => nonEmptyText(80).validator(value)),
          message: "Requirement text is invalid",
        },
      ],
    },
    give: {
      type: [String],
      required: true,
      validate: [
        exactLength(3),
        {
          validator: (values: string[]) =>
            values.every((value) => nonEmptyText(80).validator(value)),
          message: "Offer text is invalid",
        },
      ],
    },
    boundaries: { type: [String], default: undefined },
    boundaryDealbreakers: { type: [Boolean], default: undefined },
    cardVersion: { type: Number, enum: [1, 2], default: 1 },
    questions: {
      type: [String],
      required: true,
      validate: [
        { validator: (values: string[]) => [2, 3].includes(values.length), message: "Two legacy or three current questions required" },
        {
          validator: (values: string[]) =>
            values.every((value) => nonEmptyText(120).validator(value)),
          message: "Question text is invalid",
        },
      ],
    },
  },
  { _id: false },
);

const matchingProfileSchema = new Schema<MatchingProfileType>(
  {
    userId: { type: String, required: true, immutable: true, trim: true },
    card: { type: matchingCardSchema, required: true, validate: { validator: (card: MatchingCard) => card.cardVersion !== 2 || (card.questions.length === 3 && card.boundaries?.length === 3 && card.boundaryDealbreakers?.length === 3 && card.boundaries.every((text) => nonEmptyText(80).validator(text))), message: "Current cards require three questions, three boundaries and explicit dealbreaker flags" } },
    discoveryRequested: { type: Boolean, required: true, default: false },
    active: { type: Boolean, required: true, default: false },
    requiredDataReady: { type: Boolean, required: true, default: false },
    desiredAgeRange: {
      min: { type: Number, required: true, min: 18, max: 120 },
      max: { type: Number, required: true, min: 18, max: 120 },
    },
    maxDistanceKm: { type: Number, required: true, min: 1, max: 20_000 },
    soughtGender: { type: String, enum: ["ANY", "male", "female"], default: "ANY" },
    city: { type: String, trim: true, maxlength: 120 },
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
    lastCardOperationKeyHash: {
      type: String,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
    lastCardOperationRequestHash: {
      type: String,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
    runId: { type: String, trim: true, select: false },
  },
  { collection: "matching_profiles", timestamps: true, versionKey: false },
);

matchingProfileSchema.pre("validate", function () {
  if (this.desiredAgeRange.min > this.desiredAgeRange.max) {
    this.invalidate("desiredAgeRange", "Minimum age cannot exceed maximum age");
  }
  if (this.active && (!this.discoveryRequested || !this.requiredDataReady)) {
    this.invalidate(
      "active",
      "Active matching requires requested discovery and ready required data",
    );
  }
});

matchingProfileSchema.index(
  { userId: 1 },
  { unique: true, name: "matching_profile_user" },
);
matchingProfileSchema.index(
  { active: 1, requiredDataReady: 1, updatedAt: -1, userId: 1 },
  {
    name: "matching_profile_active_discovery",
    partialFilterExpression: { active: true, requiredDataReady: true },
  },
);

export const MatchingProfile =
  (mongoose.models.MatchingProfile as mongoose.Model<MatchingProfileType>) ||
  mongoose.model<MatchingProfileType>("MatchingProfile", matchingProfileSchema);
