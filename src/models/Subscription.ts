import mongoose, { Schema } from 'mongoose';
import {
  PLAN_VALUES,
  SUBSCRIPTION_STATUS_VALUES,
  type Plan,
  type SubscriptionStatus,
} from '@/lib/entitlements/types';

type SubscriptionMetaScalar = string | number | boolean | null;
type SubscriptionMeta = Record<string, SubscriptionMetaScalar>;

export interface SubscriptionType {
  userId: string;
  plan: Plan;
  status: SubscriptionStatus;
  periodEnd?: Date;
  meta?: SubscriptionMeta;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriptionSchema = new Schema<SubscriptionType>(
  {
    userId: { type: String, required: true, index: true },
    plan: {
      type: String,
      enum: PLAN_VALUES,
      required: true,
      default: 'FREE',
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUS_VALUES,
      required: true,
      default: 'active',
    },
    periodEnd: { type: Date, required: false },
    meta: { type: Schema.Types.Mixed, required: false },
  },
  { collection: 'subscriptions', timestamps: true }
);

SubscriptionSchema.index({ userId: 1, status: 1, periodEnd: -1 });
SubscriptionSchema.index({ userId: 1, updatedAt: -1 });

export const Subscription =
  (mongoose.models.Subscription as mongoose.Model<SubscriptionType>) ||
  mongoose.model<SubscriptionType>('Subscription', SubscriptionSchema);
