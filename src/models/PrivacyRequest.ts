import mongoose, { Schema } from 'mongoose';

export const PRIVACY_REQUEST_KINDS = ['ACCOUNT_DELETION'] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

export const PRIVACY_REQUEST_STATUSES = [
  'PENDING_POLICY_REVIEW',
  'CANCELLED',
] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export interface PrivacyRequestType {
  ownerUserId: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  requestVersion: 'privacy-request-v1';
  policyReasonCode: 'SHARED_ARTIFACT_RETENTION_REQUIRED';
  requestedAt: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const privacyRequestSchema = new Schema<PrivacyRequestType>(
  {
    ownerUserId: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 128,
      immutable: true,
    },
    kind: {
      type: String,
      enum: PRIVACY_REQUEST_KINDS,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: PRIVACY_REQUEST_STATUSES,
      required: true,
      default: 'PENDING_POLICY_REVIEW',
    },
    requestVersion: {
      type: String,
      enum: ['privacy-request-v1'],
      required: true,
      default: 'privacy-request-v1',
      immutable: true,
    },
    policyReasonCode: {
      type: String,
      enum: ['SHARED_ARTIFACT_RETENTION_REQUIRED'],
      required: true,
      default: 'SHARED_ARTIFACT_RETENTION_REQUIRED',
      immutable: true,
    },
    requestedAt: { type: Date, required: true, default: Date.now, immutable: true },
    cancelledAt: { type: Date },
  },
  {
    collection: 'privacy_requests',
    timestamps: true,
    versionKey: false,
  }
);

privacyRequestSchema.index(
  { ownerUserId: 1, kind: 1, status: 1 },
  {
    unique: true,
    name: 'privacy_request_one_pending_per_owner',
    partialFilterExpression: { status: 'PENDING_POLICY_REVIEW' },
  }
);
privacyRequestSchema.index(
  { ownerUserId: 1, kind: 1, createdAt: -1 },
  { name: 'privacy_request_owner_history' }
);

export const PrivacyRequest =
  (mongoose.models.PrivacyRequest as mongoose.Model<PrivacyRequestType>) ||
  mongoose.model<PrivacyRequestType>('PrivacyRequest', privacyRequestSchema);
