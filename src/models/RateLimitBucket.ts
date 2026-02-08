import mongoose, { Schema } from 'mongoose';

export interface RateLimitBucketType {
  key: string;
  route: string;
  windowMs: number;
  windowStart: Date;
  count: number;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const RateLimitBucketSchema = new Schema<RateLimitBucketType>(
  {
    key: { type: String, required: true },
    route: { type: String, required: true },
    windowMs: { type: Number, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'rate_limit_buckets', timestamps: true }
);

RateLimitBucketSchema.index(
  { key: 1, route: 1, windowMs: 1, windowStart: 1 },
  { unique: true }
);
RateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitBucket =
  (mongoose.models.RateLimitBucket as mongoose.Model<RateLimitBucketType>) ||
  mongoose.model<RateLimitBucketType>('RateLimitBucket', RateLimitBucketSchema);
