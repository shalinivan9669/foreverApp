import mongoose, { Schema } from 'mongoose';
import type { EconomySourceKind } from '@/domain/model/economy/catalog';

export type EconomyDailyAwards = Record<EconomySourceKind, number>;
export type EconomyWalletType = {
  _id: string;
  balance: number;
  earnedTotal: number;
  spentTotal: number;
  revision: number;
  rewardDay: string;
  dailyAwards: EconomyDailyAwards;
  equippedItemId?: string;
};

const integerAmount = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };
const dailyAwardsSchema = new Schema<EconomyDailyAwards>({
  ONBOARDING: integerAmount,
  QUESTIONNAIRE: integerAmount,
  SOLO_PRACTICE: integerAmount,
  PAIR_ACTIVITY: integerAmount,
}, { _id: false });
const schema = new Schema<EconomyWalletType>({
  _id: { type: String, required: true },
  balance: integerAmount,
  earnedTotal: integerAmount,
  spentTotal: integerAmount,
  revision: integerAmount,
  rewardDay: { type: String, required: true },
  dailyAwards: { type: dailyAwardsSchema, required: true },
  equippedItemId: { type: String },
}, { collection: 'economy_wallets', versionKey: false });

// The owner identity uses MongoDB's built-in unique _id index: correctness does
// not depend on autoIndex or an unexecuted deployment migration.
export const EconomyWallet = (mongoose.models.EconomyWallet as mongoose.Model<EconomyWalletType>) ||
  mongoose.model<EconomyWalletType>('EconomyWallet', schema);
