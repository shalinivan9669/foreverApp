import mongoose, { Schema, Types } from 'mongoose';
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
  pairId?: Types.ObjectId;
  billingOwnerUserId?: string;
  provider?: 'sandbox' | 'manual';
  providerSubscriptionId?: string;
  providerIsCurrent?: boolean;
  providerEventVersion?: number;
  providerEventOccurredAt?: Date;
  providerLastEventId?: string;
  providerLastPayloadHash?: string;
  providerLastEventType?: 'subscription.updated' | 'subscription.deleted';
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
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair' },
    billingOwnerUserId: { type: String },
    provider: { type: String, enum: ['sandbox', 'manual'] },
    providerSubscriptionId: { type: String },
    providerIsCurrent: { type: Boolean },
    providerEventVersion: { type: Number, min: 0 },
    providerEventOccurredAt: { type: Date },
    providerLastEventId: { type: String },
    providerLastPayloadHash: { type: String },
    providerLastEventType: {
      type: String,
      enum: ['subscription.updated', 'subscription.deleted'],
    },
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
SubscriptionSchema.index({ pairId: 1, status: 1, periodEnd: -1 });
SubscriptionSchema.index({
  pairId: 1,
  provider: 1,
  providerIsCurrent: -1,
  providerEventOccurredAt: -1,
  updatedAt: -1,
});
SubscriptionSchema.index(
  { pairId: 1, provider: 1, providerSubscriptionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pairId: { $exists: true },
      provider: { $exists: true },
      providerSubscriptionId: { $type: 'string' },
    },
    name: 'pair_provider_subscription_unique',
  }
);
SubscriptionSchema.index(
  { pairId: 1, provider: 1, providerIsCurrent: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pairId: { $exists: true },
      provider: { $exists: true },
      providerIsCurrent: true,
    },
    name: 'pair_provider_current_subscription_unique',
  }
);

export const Subscription =
  (mongoose.models.Subscription as mongoose.Model<SubscriptionType>) ||
  mongoose.model<SubscriptionType>('Subscription', SubscriptionSchema);
