import mongoose, { Schema, Types } from 'mongoose';

export interface BillingWebhookEventType {
  provider: 'sandbox';
  eventId: string;
  payloadHash: string;
  pairId: Types.ObjectId;
  providerSubscriptionId: string;
  providerEventVersion: number;
  providerOccurredAt: Date;
  outcome?: 'APPLIED' | 'STALE' | 'EQUIVALENT';
  status: 'RECEIVED' | 'PROCESSED';
  receivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const billingWebhookEventSchema = new Schema<BillingWebhookEventType>(
  {
    provider: { type: String, enum: ['sandbox'], required: true },
    eventId: { type: String, required: true },
    payloadHash: { type: String, required: true },
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    providerSubscriptionId: { type: String, required: true },
    providerEventVersion: { type: Number, required: true, min: 0 },
    providerOccurredAt: { type: Date, required: true },
    outcome: {
      type: String,
      enum: ['APPLIED', 'STALE', 'EQUIVALENT'],
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSED'],
      required: true,
      default: 'RECEIVED',
    },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date },
  },
  { collection: 'billing_webhook_events', timestamps: true, versionKey: false }
);

billingWebhookEventSchema.index(
  { provider: 1, eventId: 1 },
  { unique: true, name: 'billing_provider_event_unique' }
);
billingWebhookEventSchema.index({ status: 1, receivedAt: 1 });
billingWebhookEventSchema.index({ pairId: 1, receivedAt: -1 });
billingWebhookEventSchema.index({
  provider: 1,
  providerSubscriptionId: 1,
  providerEventVersion: -1,
});

export const BillingWebhookEvent =
  (mongoose.models.BillingWebhookEvent as mongoose.Model<BillingWebhookEventType>) ||
  mongoose.model<BillingWebhookEventType>(
    'BillingWebhookEvent',
    billingWebhookEventSchema
  );
