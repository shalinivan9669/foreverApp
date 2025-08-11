import mongoose, { Schema } from 'mongoose';

export type LikeStatus = 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';

export interface LikeType {
  fromId: string;  // Discord id отправителя
  toId:   string;  // Discord id получателя
  agreements: [boolean, boolean, boolean]; // 3 согласия
  answers:    [string, string];            // 2 ответа
  cardSnapshot: {
    requirements: [string, string, string];
    questions:    [string, string];
    updatedAt?: Date;
  };
  matchScore: number;     // скор на момент лайка
  status: LikeStatus;     // sent|viewed|accepted|rejected|expired
  createdAt?: Date;
  updatedAt?: Date;
}

const LikeSchema = new Schema<LikeType>(
  {
    fromId: { type: String, required: true, index: true },
    toId:   { type: String, required: true, index: true },
    agreements: {
      type: [Boolean],
      validate: (a: unknown[]) => Array.isArray(a) && a.length === 3,
      required: true,
    },
    answers: {
      type: [String],
      validate: (a: unknown[]) => Array.isArray(a) && a.length === 2,
      required: true,
    },
    cardSnapshot: {
      requirements: {
        type: [String],
        validate: (a: unknown[]) => Array.isArray(a) && a.length === 3,
        required: true,
      },
      questions: {
        type: [String],
        validate: (a: unknown[]) => Array.isArray(a) && a.length === 2,
        required: true,
      },
      updatedAt: { type: Date }
    },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    status:     { type: String, enum: ['sent','viewed','accepted','rejected','expired'], default: 'sent', index: true },
  },
  { timestamps: true }
);

// Inbox сорт
LikeSchema.index({ toId: 1, status: 1, createdAt: -1 });

// Один активный sent от A к B
LikeSchema.index(
  { fromId: 1, toId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'sent' } }
);

export const Like =
  (mongoose.models.Like as mongoose.Model<LikeType>) ||
  mongoose.model<LikeType>('Like', LikeSchema);
