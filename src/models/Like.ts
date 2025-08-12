import mongoose, { Schema } from 'mongoose';

export type LikeStatus =
  | 'sent'               // A→B отправил, ждём B
  | 'viewed'             // B открыл
  | 'awaiting_initiator' // B ответил A, ждём финальное решение A
  | 'accepted'           // A подтвердил → создаём пару
  | 'rejected'           // кто-то отказал
  | 'expired';           // аннулировано

type Tri = [boolean, boolean, boolean];
type Duo = [string, string];

export interface CardSnapshot {
  requirements: [string, string, string];
  questions: [string, string];
  updatedAt?: Date;
}

export interface RecipientResponse {
  agreements: Tri;                   // B согласия с условиями A
  answers: Duo;                      // ответы B на вопросы A
  initiatorCardSnapshot: CardSnapshot; // слепок карточки A на момент ответа
  at: Date;
}

export interface LikeType {
  fromId: string;
  toId: string;
  agreements: Tri;        // согласия A с условиями B
  answers: Duo;           // ответы A на вопросы B
  cardSnapshot: CardSnapshot; // слепок карточки B на момент лайка
  recipientResponse?: RecipientResponse;
  matchScore: number;     // базовый скор
  status: LikeStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const cardSnapshot = new Schema<CardSnapshot>(
  {
    requirements: { type: [String], required: true },
    questions: { type: [String], required: true },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const recipientResponse = new Schema<RecipientResponse>(
  {
    agreements: { type: [Boolean], required: true },
    answers: { type: [String], required: true },
    initiatorCardSnapshot: { type: cardSnapshot, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const likeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    agreements: { type: [Boolean], required: true },
    answers: { type: [String], required: true },
    cardSnapshot: { type: cardSnapshot, required: true },
    recipientResponse: { type: recipientResponse, required: false },
    matchScore: { type: Number, required: true },
    status: {
      type: String,
      enum: ['sent', 'viewed', 'awaiting_initiator', 'accepted', 'rejected', 'expired'],
      required: true,
    },
  },
  { timestamps: true, collection: 'likes' }
);

// индексы
likeSchema.index({ toId: 1, status: 1, createdAt: -1 });
// запрет повторной активной заявки A→B
likeSchema.index(
  { fromId: 1, toId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'sent' } }
);

export const Like =
  (mongoose.models.Like as mongoose.Model<LikeType>) ||
  mongoose.model<LikeType>('Like', likeSchema);
