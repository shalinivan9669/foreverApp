import mongoose, { Schema, Types } from 'mongoose';

export const PAIR_INVITE_STATUSES = [
  'ACTIVE',
  'ACCEPTED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type PairInviteStatus = (typeof PAIR_INVITE_STATUSES)[number];

export interface PairInviteType {
  creatorUserId: string;
  tokenHash: string;
  status: PairInviteStatus;
  expiresAt: Date;
  acceptedByUserId?: string;
  acceptedAt?: Date;
  pairId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pairInviteSchema = new Schema<PairInviteType>(
  {
    creatorUserId: { type: String, required: true, trim: true },
    tokenHash: { type: String, required: true, unique: true, immutable: true },
    status: {
      type: String,
      enum: PAIR_INVITE_STATUSES,
      required: true,
      default: 'ACTIVE',
    },
    expiresAt: { type: Date, required: true },
    acceptedByUserId: { type: String, required: false },
    acceptedAt: { type: Date, required: false },
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: false },
  },
  { collection: 'pair_invites', timestamps: true }
);

pairInviteSchema.index(
  { creatorUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'one_active_pair_invite_per_creator',
  }
);
pairInviteSchema.index({ creatorUserId: 1, createdAt: -1 });
pairInviteSchema.index({ expiresAt: 1, status: 1 });

export const PairInvite =
  (mongoose.models.PairInvite as mongoose.Model<PairInviteType>) ||
  mongoose.model<PairInviteType>('PairInvite', pairInviteSchema);
