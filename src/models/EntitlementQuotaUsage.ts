import mongoose, { Schema } from 'mongoose';
import type { QuotaKey, QuotaWindow } from '@/lib/entitlements/types';

export interface EntitlementQuotaUsageType {
  subjectId: string;
  quotaKey: QuotaKey;
  window: QuotaWindow;
  windowStart: Date;
  count: number;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const EntitlementQuotaUsageSchema = new Schema<EntitlementQuotaUsageType>(
  {
    subjectId: { type: String, required: true },
    quotaKey: { type: String, required: true },
    window: { type: String, enum: ['day', 'week', 'month'], required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'entitlement_quota_usage', timestamps: true }
);

EntitlementQuotaUsageSchema.index(
  { subjectId: 1, quotaKey: 1, window: 1, windowStart: 1 },
  { unique: true }
);
EntitlementQuotaUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EntitlementQuotaUsage =
  (mongoose.models.EntitlementQuotaUsage as mongoose.Model<EntitlementQuotaUsageType>) ||
  mongoose.model<EntitlementQuotaUsageType>(
    'EntitlementQuotaUsage',
    EntitlementQuotaUsageSchema
  );
