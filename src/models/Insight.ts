import mongoose, { Schema, Types } from 'mongoose';

export interface InsightType {
  userId: Types.ObjectId;
  partnerId?: Types.ObjectId;
  category: 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';
  message: string;
  isRead: boolean;
  createdAt: Date;
}

const insightSchema = new Schema<InsightType>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId:{ type: Schema.Types.ObjectId, ref: 'User' },
    category: { type: String, enum: ['communication','domestic','personalViews','finance','sexuality','psyche'], required: true },
    message:  { type: String, required: true },
    isRead:   { type: Boolean, default: false },
    createdAt:{ type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const Insight =
  (mongoose.models.Insight as mongoose.Model<InsightType>) ||
  mongoose.model<InsightType>('Insight', insightSchema);
