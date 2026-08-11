import mongoose, { Schema, Types } from 'mongoose';

export type PartnerSignalTone =
  | 'support'
  | 'space'
  | 'closeness'
  | 'repair'
  | 'low_resource'
  | 'neutral';

export type PartnerSignalType = {
  pairId: string | Types.ObjectId;
  fromUserId: string;
  toUserId: string;
  sourceCheckInId: string | Types.ObjectId;
  dateKey: string;
  text: string;
  tone: PartnerSignalTone;
  status: 'sent' | 'read' | 'hidden_by_sender' | 'dismissed_by_receiver';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  readAt?: Date;
};

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

const partnerSignalSchema = new Schema<PartnerSignalType>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    fromUserId: { type: String, required: true },
    toUserId: { type: String, required: true },
    sourceCheckInId: {
      type: Schema.Types.ObjectId,
      ref: 'PersonalDailyCheckIn',
      required: true,
      immutable: true,
    },
    dateKey: {
      type: String,
      required: true,
      validate: (value: string) => dateKeyRegex.test(value),
    },
    text: { type: String, required: true, maxlength: 300 },
    tone: {
      type: String,
      enum: ['support', 'space', 'closeness', 'repair', 'low_resource', 'neutral'],
      required: true,
      default: 'neutral',
    },
    status: {
      type: String,
      enum: ['sent', 'read', 'hidden_by_sender', 'dismissed_by_receiver'],
      required: true,
      default: 'sent',
    },
    readAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'partner_signals', timestamps: true }
);

partnerSignalSchema.index({ toUserId: 1, createdAt: -1 });
partnerSignalSchema.index({ pairId: 1, dateKey: 1 });
partnerSignalSchema.index(
  { sourceCheckInId: 1 },
  { unique: true, name: 'one_partner_signal_per_daily_checkin' }
);
partnerSignalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PartnerSignal =
  (mongoose.models.PartnerSignal as mongoose.Model<PartnerSignalType>) ||
  mongoose.model<PartnerSignalType>('PartnerSignal', partnerSignalSchema);
