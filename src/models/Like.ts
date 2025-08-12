import mongoose, { Schema, Types } from 'mongoose';

export type LikeStatus =
  | 'sent'                  // инициатор отправил
  | 'viewed'                // получатель открыл
  | 'awaiting_initiator'    // получатель согласился и ответил, ждём инициатора
  | 'mutual_ready'          // оба согласны, можно создать пару
  | 'paired'                // пара создана
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
  fromCardSnapshot: CardSnapshot;
  recipientResponse?: RecipientResponse;    // ответы получателя
  recipientDecision?: Decision;             // фиксируем согласие получателя
  initiatorDecision?: Decision;             // решение инициатора
  status: LikeStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const CardSchema = new Schema<CardSnapshot>(
  {
    requirements: { type: [String], required: true },
    questions: { type: [String], required: true },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const DecisionSchema = new Schema<Decision>(
  {
    accepted: { type: Boolean, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const LikeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    matchScore: { type: Number, required: true },
    fromCardSnapshot: { type: CardSchema, required: true },
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
