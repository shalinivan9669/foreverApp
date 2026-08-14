import mongoose, { Schema } from "mongoose";

export const MATCHING_SOCIAL_EFFECT_NAMES = [
  "LIKE_CREATED",
  "LIKE_VIEWED",
  "LIKE_RESPONDED",
  "LIKE_ACCEPTED",
  "LIKE_DECLINED",
  "MATCHING_BLOCKED",
  "MATCHING_UNBLOCKED",
  "CONNECTION_CREATED",
  "COUPLE_CONFIRMATION_REQUESTED",
  "COUPLE_CONFIRMATION_CONFIRMED",
  "COUPLE_CONFIRMATION_CANCELLED",
  "PAIR_FORMED_FROM_MATCHING",
] as const;

type SocialEffectName = (typeof MATCHING_SOCIAL_EFFECT_NAMES)[number];

export interface MatchingSocialEffectType {
  effectKey: string;
  name: SocialEffectName;
  actorId: string;
  participantIds: [string, string];
  resourceId: string;
  occurredAt: Date;
  expiresAt?: Date;
  createdAt: Date;
}

const matchingSocialEffectSchema = new Schema<MatchingSocialEffectType>(
  {
    effectKey: { type: String, required: true, immutable: true, trim: true },
    name: {
      type: String,
      enum: MATCHING_SOCIAL_EFFECT_NAMES,
      required: true,
      immutable: true,
      trim: true,
    },
    actorId: { type: String, required: true, immutable: true, trim: true },
    participantIds: {
      type: [String],
      required: true,
      immutable: true,
      validate: {
        validator: (values: string[]) =>
          values.length === 2 &&
          values[0] !== values[1] &&
          values[0] < values[1],
        message: "Social effect participants must be canonically sorted",
      },
    },
    resourceId: { type: String, required: true, immutable: true, trim: true },
    occurredAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, immutable: true },
  },
  {
    collection: "matching_social_effects",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

matchingSocialEffectSchema.index(
  { effectKey: 1 },
  { unique: true, name: "matching_social_effect_identity" },
);
matchingSocialEffectSchema.index({ actorId: 1, occurredAt: -1 });
matchingSocialEffectSchema.index({ participantIds: 1, occurredAt: -1 });
matchingSocialEffectSchema.index(
  { expiresAt: 1 },
  { name: "matching_effect_retention_ttl", expireAfterSeconds: 0 },
);

export const MatchingSocialEffect =
  (mongoose.models
    .MatchingSocialEffect as mongoose.Model<MatchingSocialEffectType>) ||
  mongoose.model<MatchingSocialEffectType>(
    "MatchingSocialEffect",
    matchingSocialEffectSchema,
  );
