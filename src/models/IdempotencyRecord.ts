import mongoose, { Schema } from 'mongoose';
import type { StoredIdempotencyEnvelope, IdempotencyRecordState } from '@/lib/idempotency/types';

export interface IdempotencyRecordType {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  state: IdempotencyRecordState;
  status: number;
  responseEnvelope?: StoredIdempotencyEnvelope;
  createdAt: Date;
  updatedAt?: Date;
}

const IdempotencyRecordSchema = new Schema<IdempotencyRecordType>(
  {
    key: { type: String, required: true },
    route: { type: String, required: true },
    userId: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: {
      type: String,
      enum: ['in_progress', 'completed'],
      required: true,
      default: 'in_progress',
    },
    status: { type: Number, required: true, default: 0 },
    responseEnvelope: { type: Schema.Types.Mixed, required: false },
  },
  { collection: 'idempotency_records', timestamps: true }
);

IdempotencyRecordSchema.index({ userId: 1, route: 1, key: 1 }, { unique: true });
IdempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

export const IdempotencyRecord =
  (mongoose.models.IdempotencyRecord as mongoose.Model<IdempotencyRecordType>) ||
  mongoose.model<IdempotencyRecordType>('IdempotencyRecord', IdempotencyRecordSchema);