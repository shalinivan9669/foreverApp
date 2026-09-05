import mongoose, { Schema } from 'mongoose';
import type { EconomySourceKind } from '@/domain/model/economy/catalog';

export type EconomyLedgerType = {
  _id: string;
  userId: string;
  kind: 'EARN' | 'SPEND' | 'CONTRIBUTE';
  delta: number;
  balanceAfter: number;
  sourceKind?: EconomySourceKind;
  sourceId: string;
  itemId?: string;
  outcomeItemId?: string;
  pairId?: string;
  reason: 'COMPLETION' | 'DAILY_LIMIT' | 'PURCHASE' | 'CONTRIBUTION';
  rulesVersion: number;
  catalogVersion: number;
  createdAt: Date;
};

const schema = new Schema<EconomyLedgerType>({
  _id: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  kind: { type: String, enum: ['EARN', 'SPEND', 'CONTRIBUTE'], required: true, immutable: true },
  delta: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  balanceAfter: { type: Number, min: 0, required: true, validate: Number.isSafeInteger, immutable: true },
  sourceKind: { type: String, enum: ['ONBOARDING', 'QUESTIONNAIRE', 'SOLO_PRACTICE', 'PAIR_ACTIVITY'], immutable: true },
  sourceId: { type: String, required: true, immutable: true },
  itemId: { type: String, immutable: true },
  outcomeItemId: { type: String, immutable: true },
  pairId: { type: String, immutable: true },
  reason: { type: String, enum: ['COMPLETION', 'DAILY_LIMIT', 'PURCHASE', 'CONTRIBUTION'], required: true, immutable: true },
  rulesVersion: { type: Number, required: true, immutable: true },
  catalogVersion: { type: Number, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
}, { collection: 'economy_ledger', versionKey: false });
schema.index({ userId: 1, createdAt: -1, _id: -1 }, { name: 'economy_ledger_owner_history' });

export const EconomyLedger = (mongoose.models.EconomyLedger as mongoose.Model<EconomyLedgerType>) ||
  mongoose.model<EconomyLedgerType>('EconomyLedger', schema);
