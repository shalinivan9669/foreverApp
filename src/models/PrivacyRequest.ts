import mongoose, { Schema } from 'mongoose';

export const PRIVACY_REQUEST_KINDS = ['ACCOUNT_DELETION'] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

export const PRIVACY_REQUEST_STATUSES = [
  'PENDING_CONFIRMATION',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
  'CANCELLED',
] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export interface PrivacyRequestType {
  ownerUserId: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  requestVersion: 'privacy-request-v2';
  policyReasonCode: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION';
  ownerSubjectHash: string;
  requestedAt: Date;
  confirmedAt?: Date;
  executedAt?: Date;
  failureCode?: 'DELETION_EXECUTION_FAILED';
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
      default: 'PENDING_CONFIRMATION',
    },
    requestVersion: {
      type: String,
      enum: ['privacy-request-v2'],
      required: true,
      default: 'privacy-request-v2',
      immutable: true,
    },
    policyReasonCode: {
      type: String,
      enum: ['PRIVACY_MINIMAL_IMMEDIATE_DELETION'],
      required: true,
      default: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION',
      immutable: true,
    },
    ownerSubjectHash: { type: String, required: true, immutable: true },
    requestedAt: { type: Date, required: true, default: Date.now, immutable: true },
    confirmedAt: { type: Date },
    executedAt: { type: Date },
    failureCode: { type: String, enum: ['DELETION_EXECUTION_FAILED'] },
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
    name: 'privacy_request_one_confirmable_per_owner_v2',
    partialFilterExpression: { status: 'PENDING_CONFIRMATION' },
  }
);
privacyRequestSchema.index(
  { ownerUserId: 1, kind: 1, createdAt: -1 },
  { name: 'privacy_request_owner_history' }
);

export const PrivacyRequest =
  (mongoose.models.PrivacyRequest as mongoose.Model<PrivacyRequestType>) ||
  mongoose.model<PrivacyRequestType>('PrivacyRequest', privacyRequestSchema);
