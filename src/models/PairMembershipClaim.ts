import mongoose, { Schema, Types } from 'mongoose';

export interface PairMembershipClaimType {
  userId: string;
  pairId: Types.ObjectId;
  inviteId: Types.ObjectId;
  pairKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const pairMembershipClaimSchema = new Schema<PairMembershipClaimType>(
  {
    userId: { type: String, required: true, trim: true },
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    inviteId: { type: Schema.Types.ObjectId, ref: 'PairInvite', required: true },
    pairKey: { type: String, required: true },
  },
  { collection: 'pair_membership_claims', timestamps: true }
);

pairMembershipClaimSchema.index(
  { userId: 1 },
  { unique: true, name: 'one_pair_membership_claim_per_user' }
);
pairMembershipClaimSchema.index({ pairId: 1 });
pairMembershipClaimSchema.index({ inviteId: 1 });

export const PairMembershipClaim =
  (mongoose.models.PairMembershipClaim as mongoose.Model<PairMembershipClaimType>) ||
  mongoose.model<PairMembershipClaimType>(
    'PairMembershipClaim',
    pairMembershipClaimSchema
  );
