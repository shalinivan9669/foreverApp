import mongoose, { Schema } from 'mongoose';

export type EconomyPairCollectionType = {
  _id: string;
  pairId: string;
  userId: string;
  itemId: string;
  quantity: number;
  contributedAt: Date;
};

// One owner/item row per Pair context keeps privacy cleanup owner-scoped.
const schema = new Schema<EconomyPairCollectionType>({
  _id: { type: String, required: true, immutable: true },
  pairId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  itemId: { type: String, required: true, immutable: true },
  quantity: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
  contributedAt: { type: Date, required: true, immutable: true },
}, { collection: 'economy_pair_collection', versionKey: false });
schema.index({ pairId: 1 }, { name: 'economy_pair_collection_context' });
schema.index({ userId: 1 }, { name: 'economy_pair_collection_owner' });

export const EconomyPairCollection = (mongoose.models.EconomyPairCollection as mongoose.Model<EconomyPairCollectionType>) ||
  mongoose.model<EconomyPairCollectionType>('EconomyPairCollection', schema);
