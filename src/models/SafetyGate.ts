import mongoose, { Schema, type Types } from 'mongoose';

export interface SafetyGateType {
  pairId: Types.ObjectId;
  ownerUserId: string;
  enabled: boolean;
  retentionClass: 'UNTIL_REVOKED_OR_PAIR_END';
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const safetyGateSchema = new Schema<SafetyGateType>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    ownerUserId: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: false },
    retentionClass: {
      type: String,
      enum: ['UNTIL_REVOKED_OR_PAIR_END'],
      required: true,
      default: 'UNTIL_REVOKED_OR_PAIR_END',
    },
    revokedAt: { type: Date },
  },
  { collection: 'safety_gates', timestamps: true, versionKey: false }
);

safetyGateSchema.index({ pairId: 1, ownerUserId: 1 }, { unique: true });
safetyGateSchema.index({ pairId: 1, enabled: 1 });

export const SafetyGate =
  (mongoose.models.SafetyGate as mongoose.Model<SafetyGateType>) ||
  mongoose.model<SafetyGateType>('SafetyGate', safetyGateSchema);
