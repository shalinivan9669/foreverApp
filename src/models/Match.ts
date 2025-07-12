import mongoose, { Schema, Types } from 'mongoose';

export interface MatchCandidate {
  candidateId: Types.ObjectId;
  score: number;
}

export interface MatchType {
  userId: Types.ObjectId;
  candidates: MatchCandidate[];
  computedAt: Date;
}

const candidateSchema = new Schema<MatchCandidate>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score:       { type: Number, required: true },
  },
  { _id: false }
);

const matchSchema = new Schema<MatchType>(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    candidates:{ type: [candidateSchema], default: [] },
    computedAt:{ type: Date, required: true },
  },
  { timestamps: false }
);

matchSchema.index({ computedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const Match =
  (mongoose.models.Match as mongoose.Model<MatchType>) ||
  mongoose.model<MatchType>('Match', matchSchema);
