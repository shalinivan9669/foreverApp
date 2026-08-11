import mongoose, { Schema } from 'mongoose';

export type AccountState = 'ACTIVE' | 'DELETING' | 'DELETED';
export type AccountWriteLeaseKind =
  | 'AUTHENTICATED_REQUEST'
  | 'OAUTH_EXCHANGE'
  | 'SYSTEM_ADMIN'
  | 'BILLING_WEBHOOK';

export interface AccountWriteLeaseType {
  token: string;
  generation: string;
  kind: AccountWriteLeaseKind;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
}

export interface SessionSubjectType {
  subjectKey: string;
  version: string;
  revokedAt?: Date;
  accountState?: AccountState;
  writeLeaseRevision?: number;
  writeLeases?: AccountWriteLeaseType[];
  deletionStartedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const accountWriteLeaseSchema = new Schema<AccountWriteLeaseType>(
  {
    token: { type: String, required: true },
    generation: { type: String, required: true },
    kind: {
      type: String,
      enum: [
        'AUTHENTICATED_REQUEST',
        'OAUTH_EXCHANGE',
        'SYSTEM_ADMIN',
        'BILLING_WEBHOOK',
      ],
      required: true,
    },
    acquiredAt: { type: Date, required: true },
    heartbeatAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const sessionSubjectSchema = new Schema<SessionSubjectType>(
  {
    subjectKey: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    version: {
      type: String,
      required: true,
    },
    revokedAt: { type: Date },
    accountState: {
      type: String,
      enum: ['ACTIVE', 'DELETING', 'DELETED'],
      default: 'ACTIVE',
    },
    writeLeaseRevision: { type: Number, default: 0, min: 0 },
    writeLeases: { type: [accountWriteLeaseSchema], default: [] },
    deletionStartedAt: { type: Date },
    deletedAt: { type: Date },
  },
  {
    collection: 'session_subjects',
    timestamps: true,
    versionKey: false,
  }
);

sessionSubjectSchema.index(
  { subjectKey: 1 },
  { unique: true, name: 'session_subject_user' }
);
sessionSubjectSchema.index(
  { accountState: 1, deletionStartedAt: 1 },
  { name: 'session_subject_deletion_recovery' }
);

export const SessionSubject =
  (mongoose.models.SessionSubject as mongoose.Model<SessionSubjectType>) ||
  mongoose.model<SessionSubjectType>('SessionSubject', sessionSubjectSchema);
