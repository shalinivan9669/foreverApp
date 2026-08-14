import mongoose, { Schema, Types } from "mongoose";

export type LikeStatus =
  | "SENT"
  | "VIEWED"
  | "RESPONDED"
  | "MATCHED"
  | "DECLINED"
  | "EXPIRED"
  | "BLOCKED"
  | "sent"
  | "viewed"
  | "awaiting_initiator"
  | "mutual_ready"
  | "paired"
  | "rejected"
  | "expired";

export interface CardSnapshot {
  requirements: [string, string, string];
  give?: [string, string, string];
  questions: [string, string];
  updatedAt?: Date;
}

export interface RecipientResponse {
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  initiatorCardSnapshot: CardSnapshot;
  at: Date;
}

export interface Decision {
  accepted: boolean;
  at: Date;
}

export interface LikeType {
  _id: Types.ObjectId;
  fromId: string;
  toId: string;
  /** Legacy-only. New matching runtime never writes or returns this value. */
  matchScore?: number;
  revision?: number;
  creationKeyHash?: string;
  creationRequestHash?: string;
  interactionKey?: string;

  /** новая схема */
  fromCardSnapshot?: CardSnapshot;
  senderCardRevision?: number;
  targetCardSnapshot?: CardSnapshot;
  targetCardRevision?: number;
  candidateGrantId?: Types.ObjectId;

  /** ответы получателя на карточку инициатора */
  recipientResponse?: RecipientResponse;

  /** решения сторон */
  recipientDecision?: Decision;
  initiatorDecision?: Decision;
  declinedUntil?: Date;
  connectionId?: Types.ObjectId;

  status: LikeStatus;
  createdAt?: Date;
  updatedAt?: Date;

  /** устаревшие поля — только для обратной совместимости */
  agreements?: [boolean, boolean, boolean];
  answers?: [string, string];
  cardSnapshot?: CardSnapshot;
}

const CardSchema = new Schema<CardSnapshot>(
  {
    requirements: { type: [String], required: true },
    give: { type: [String], required: false },
    questions: { type: [String], required: true },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const DecisionSchema = new Schema<Decision>(
  {
    accepted: { type: Boolean, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const RecipientResponseSchema = new Schema<RecipientResponse>(
  {
    agreements: { type: [Boolean], required: true },
    answers: { type: [String], required: true },
    initiatorCardSnapshot: {
      type: CardSchema,
      required: true,
      immutable: true,
    },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const LikeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    matchScore: { type: Number, required: false, select: false },
    revision: { type: Number, required: false, min: 0, default: 0 },
    creationKeyHash: {
      type: String,
      required: false,
      select: false,
      minlength: 64,
      maxlength: 64,
    },
    creationRequestHash: {
      type: String,
      required: false,
      select: false,
      minlength: 64,
      maxlength: 64,
    },
    interactionKey: {
      type: String,
      required: false,
      immutable: true,
      trim: true,
    },

    // новая схема
    fromCardSnapshot: { type: CardSchema, required: false, immutable: true },
    senderCardRevision: {
      type: Number,
      required: false,
      min: 1,
      immutable: true,
    },
    targetCardSnapshot: { type: CardSchema, required: false, immutable: true },
    targetCardRevision: {
      type: Number,
      required: false,
      min: 1,
      immutable: true,
    },
    candidateGrantId: {
      type: Schema.Types.ObjectId,
      ref: "CandidatePresentationGrant",
      required: false,
      select: false,
    },

    recipientResponse: { type: RecipientResponseSchema, required: false },
    recipientDecision: { type: DecisionSchema, required: false },
    initiatorDecision: { type: DecisionSchema, required: false },
    declinedUntil: { type: Date, required: false },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "MatchingConnection",
      required: false,
    },

    status: { type: String, required: true, index: true },

    // устаревшие поля — делаем необязательными
    agreements: { type: [Boolean], required: false, select: false },
    answers: { type: [String], required: false, select: false },
    cardSnapshot: { type: CardSchema, required: false, select: false },
  },
  { timestamps: true },
);

LikeSchema.index({ fromId: 1, toId: 1, createdAt: -1 });
LikeSchema.index(
  { interactionKey: 1 },
  {
    name: "uniq_active_matching_like_direction",
    unique: true,
    partialFilterExpression: {
      interactionKey: { $type: "string" },
      status: { $in: ["SENT", "VIEWED", "RESPONDED", "MATCHED"] },
    },
  },
);
LikeSchema.index({ toId: 1, status: 1, updatedAt: -1, _id: -1 });
LikeSchema.index({ fromId: 1, status: 1, updatedAt: -1, _id: -1 });
LikeSchema.index({ fromId: 1, toId: 1, declinedUntil: 1 });
LikeSchema.index(
  { fromId: 1, creationKeyHash: 1 },
  {
    name: "uniq_like_creation_key",
    unique: true,
    partialFilterExpression: { creationKeyHash: { $type: "string" } },
  },
);

/** Мягкая миграция: если в документе есть legacy `cardSnapshot`, а нового нет — копируем. */
type LegacyDoc = mongoose.HydratedDocument<
  LikeType & { cardSnapshot?: CardSnapshot }
>;

LikeSchema.pre("validate", function (next) {
  const doc = this as LegacyDoc;
  if (!doc.fromCardSnapshot && doc.cardSnapshot) {
    doc.fromCardSnapshot = doc.cardSnapshot;
  }
  next();
});

export const Like =
  (mongoose.models.Like as mongoose.Model<LikeType>) ||
  mongoose.model<LikeType>("Like", LikeSchema);
