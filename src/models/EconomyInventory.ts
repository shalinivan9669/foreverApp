import mongoose, { Schema } from 'mongoose';

export type EconomyInventoryType = {
  _id: string;
  userId: string;
  itemId: string;
  quantity: number;
  acquiredAt: Date;
};
const schema = new Schema<EconomyInventoryType>({
  _id: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  itemId: { type: String, required: true, immutable: true },
  quantity: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
  acquiredAt: { type: Date, required: true, immutable: true },
}, { collection: 'economy_inventory', versionKey: false });
schema.index({ userId: 1, itemId: 1 }, { name: 'economy_inventory_owner' });

export const EconomyInventory = (mongoose.models.EconomyInventory as mongoose.Model<EconomyInventoryType>) ||
  mongoose.model<EconomyInventoryType>('EconomyInventory', schema);
