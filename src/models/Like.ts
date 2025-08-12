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
  agreements: [boolean, boolean, boolean];     // согласия получателя на условия инициатора
  answers: [string, string];                   // ответы получателя на вопросы инициатора
  initiatorCardSnapshot: CardSnapshot;         // слепок карточки инициатора на момент ответа
  at: Date;
}

export interface Decision {
  accepted: boolean;
  at: Date;
}

export interface LikeType {
  _id: Types.ObjectId;
  fromId: string;                 // кто отправил лайк (инициатор)
  toId: string;                   // кому отправил лайк (получатель)
  matchScore: number;

  // === слепок карточки получателя + то, что заполнил инициатор ===
  cardSnapshot: CardSnapshot;                         // карточка получателя на момент лайка
  agreements: [boolean, boolean, boolean];            // инициатор согласился с условиями
  answers: [string, string];                          // инициатор ответил на вопросы

  // опционально (для обратной совместимости/аналитики)
  fromCardSnapshot?: CardSnapshot;

  // === ответ получателя на карточку инициатора ===
  recipientResponse?: RecipientResponse;
  recipientDecision?: Decision;   // итоговое решение получателя
  initiatorDecision?: Decision;   // итоговое решение инициатора

  status: LikeStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

/* ── subdocs ─────────────────────────────────────────── */

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
    at:       { type: Date,    required: true },
  },
  { _id: false }
);

const RecipientResponseSchema = new Schema<RecipientResponse>(
  {
    agreements: {
      type: [Boolean],
      required: true,
      validate: { validator: (a: unknown[]) => Array.isArray(a) && a.length === 3 }
    },
    answers: {
      type: [String],
      required: true,
      validate: { validator: (a: unknown[]) => Array.isArray(a) && a.length === 2 }
    },
    initiatorCardSnapshot: { type: CardSchema, required: true },
    at: { type: Date, required: true }
  },
  { _id: false }
);

/* ── root ────────────────────────────────────────────── */

const LikeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId:   { type: String, required: true, index: true },

    matchScore: { type: Number, required: true },

    cardSnapshot: { type: CardSchema, required: true },
    agreements: {
      type: [Boolean],
      required: true,
      validate: { validator: (a: unknown[]) => Array.isArray(a) && a.length === 3 }
    },
    answers: {
      type: [String],
      required: true,
      validate: { validator: (a: unknown[]) => Array.isArray(a) && a.length === 2 }
    },

    fromCardSnapshot: { type: CardSchema },

    recipientResponse: { type: RecipientResponseSchema },
    recipientDecision: { type: DecisionSchema },
    initiatorDecision: { type: DecisionSchema },

    status: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// Часто нужен «последний лайк между A и B»
LikeSchema.index({ fromId: 1, toId: 1, createdAt: -1 });

export const Like =
  (mongoose.models.Like as mongoose.Model<LikeType>) ||
  mongoose.model<LikeType>('Like', LikeSchema);
