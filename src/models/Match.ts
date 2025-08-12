// src/models/Match.ts
import mongoose, { Schema, Types } from 'mongoose';

/** Один кандидат в ленте */
export interface MatchCandidate {
  id: string;                 // discord id кандидата
  score: number;              // 0..100
  reasons?: string[];         // короткие пояснения: "совпадение по ...", "комплементарность ..."
}

/** Документ кэша рекомендаций для пользователя */
export interface MatchType {
  _id: Types.ObjectId;
  userId: string;             // для кого посчитан кэш (discord id)
  items: MatchCandidate[];    // отсортированный список кандидатов
  createdAt?: Date;
  updatedAt?: Date;
  /** Поле для TTL-очистки. Ставим время истечения кэша. */
  expireAt?: Date;
}

const CandidateSchema = new Schema<MatchCandidate>(
  {
    id: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    reasons: { type: [String], default: [] },
  },
  { _id: false }
);

const MatchSchema = new Schema<MatchType>(
  {
    userId: { type: String, required: true, index: true },
    items: { type: [CandidateSchema], default: [] },
    // TTL: документ автоматически удалится спустя время (см. индекс ниже)
    expireAt: { type: Date, default: () => new Date(Date.now() + 24 * 3600 * 1000) },
  },
  { collection: 'matches', timestamps: true }
);

// один актуальный кэш на пользователя (при желании можно убирать unique)
MatchSchema.index({ userId: 1 }, { unique: true });

// TTL-индекс (24 часа). Если хочешь другой срок — поменяй seconds.
MatchSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const Match =
  (mongoose.models.Match as mongoose.Model<MatchType>) ||
  mongoose.model<MatchType>('Match', MatchSchema);
