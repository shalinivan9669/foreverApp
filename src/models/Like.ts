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

  /** новая схема — снимок карточки, с которой согласился инициатор */
  fromCardSnapshot?: CardSnapshot;

  /** ответы получателя (на карточку инициатора) */
  recipientResponse?: RecipientResponse;

  /** решения сторон */
  recipientDecision?: Decision;
  initiatorDecision?: Decision;

  status: LikeStatus;
  createdAt?: Date;
  updatedAt?: Date;

  /** ↓↓↓ устаревшие поля, оставлены для совместимости со старой БД */
  agreements?: [boolean, boolean, boolean];
  answers?: [string, string];
  cardSnapshot?: CardSnapshot;
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

const RecipientResponseSchema = new Schema<RecipientResponse>(
  {
    agreements: { type: [Boolean], required: true },
    answers: { type: [String], required: true },
    initiatorCardSnapshot: { type: CardSchema, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const LikeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    matchScore: { type: Number, required: true },

    // новая схема
    fromCardSnapshot: { type: CardSchema, required: false },

    recipientResponse: { type: RecipientResponseSchema, required: false },
    recipientDecision: { type: DecisionSchema, required: false },
    initiatorDecision: { type: DecisionSchema, required: false },

    status: { type: String, required: true, index: true },

    // ↓↓↓ устаревшие поля — НЕ обязательные, чтобы валидация не падала
    agreements: { type: [Boolean], required: false, select: false },
    answers: { type: [String], required: false, select: false },
    cardSnapshot: { type: CardSchema, required: false, select: false },
  },
  { timestamps: true }
);

// индекс как был
LikeSchema.index({ fromId: 1, toId: 1, createdAt: -1 });

// миграционная защита: если в старом документе было cardSnapshot — переложим в fromCardSnapshot
LikeSchema.pre('validate', function (next) {
  const self = this as unknown as LikeType & { cardSnapshot?: CardSnapshot };
  if (!self.fromCardSnapshot && self.cardSnapshot) {
    // @ts-ignore
    this.fromCardSnapshot = self.cardSnapshot;
  }
  next();
});

export const Like =
  (mongoose.models.Like as mongoose.Model<LikeType>) ||
  mongoose.model<LikeType>('Like', LikeSchema);
