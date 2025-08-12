// src/models/Like.ts
import mongoose, { Schema, Types } from 'mongoose';

export type LikeStatus =
  | 'sent'
  | 'viewed'
  | 'awaiting_initiator'
  | 'mutual_ready'
  | 'paired'
  | 'rejected'
  | 'expired';

export interface CardSnapshot {
  requirements: [string, string, string];
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
  matchScore: number;

  /** ↓ то, что пишет инициатор при лайке (как в твоём роуте) */
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  cardSnapshot: CardSnapshot;               // снапшот карточки получателя (to)

  /** ↓ снапшот карточки инициатора (может понадобиться позже) */
  fromCardSnapshot?: CardSnapshot;

  recipientResponse?: RecipientResponse;
  recipientDecision?: Decision;
  initiatorDecision?: Decision;

  status: LikeStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const CardSchema = new Schema<CardSnapshot>(
  {
    requirements: { type: [String], required: true },
    questions:    { type: [String], required: true },
    updatedAt:    { type: Date },
  },
  { _id: false }
);

const DecisionSchema = new Schema<Decision>(
  {
    accepted: { type: Boolean, required: true },
    at:       { type: Date, required: true },
  },
  { _id: false }
);

const LikeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId:   { type: String, required: true, index: true },
    matchScore: { type: Number, required: true },

    // то, что реально создаёт /api/match/like
    agreements: {
      type: [Boolean],
      required: true,
      validate: (v: boolean[]) => Array.isArray(v) && v.length === 3,
    },
    answers: {
      type: [String],
      required: true,
      validate: (v: string[]) => Array.isArray(v) && v.length === 2,
    },
    cardSnapshot: { type: CardSchema, required: true },

    // делаем не обязательным, чтобы не падать сейчас
    fromCardSnapshot: { type: CardSchema },

    recipientResponse: { type: Schema.Types.Mixed },
    recipientDecision: { type: DecisionSchema },
    initiatorDecision: { type: DecisionSchema },

    status: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

LikeSchema.index({ fromId: 1, toId: 1, createdAt: -1 });

export const Like =
  (mongoose.models.Like as mongoose.Model<LikeType>) ||
  mongoose.model<LikeType>('Like', LikeSchema);
