import mongoose, { Schema, Types } from 'mongoose';

export type WeeklyCycleStatus = 'OPEN' | 'EXPIRED';
export type WeeklyCycleMemberStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'SKIPPED'
  | 'EXPIRED';
export type WeeklyCyclePairReadiness =
  | 'NOT_READY'
  | 'PARTIAL'
  | 'ENOUGH'
  | 'INSUFFICIENT'
  | 'EXPIRED';

export type WeeklyCycleMemberCompletion = {
  userId: string;
  status: WeeklyCycleMemberStatus;
};

export type WeeklyCycleSubmissionClaim = {
  userId: string;
  token: string;
  expiresAt: Date;
};

export interface WeeklyCycleType {
  pairId: Types.ObjectId;
  cycleKey: string;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  timeZone: 'UTC';
  status: WeeklyCycleStatus;
  memberIds: [string, string];
  memberCompletion: WeeklyCycleMemberCompletion[];
  pairReadiness: WeeklyCyclePairReadiness;
  submissionCount: number;
  submissionClaims: WeeklyCycleSubmissionClaim[];
  inputDefinitionVersion: string;
  algorithmVersion: string;
  latestSnapshotId?: Types.ObjectId;
  latestSnapshotRevision?: number;
  createdAt: Date;
  updatedAt: Date;
}

const memberCompletionSchema = new Schema<WeeklyCycleMemberCompletion>(
  {
    userId: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'SKIPPED', 'EXPIRED'],
      required: true,
    },
  },
  { _id: false }
);

const submissionClaimSchema = new Schema<WeeklyCycleSubmissionClaim>(
  {
    userId: { type: String, required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const weeklyCycleSchema = new Schema<WeeklyCycleType>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    cycleKey: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    timeZone: {
      type: String,
      enum: ['UTC'],
      required: true,
      default: 'UTC',
      immutable: true,
    },
    status: { type: String, enum: ['OPEN', 'EXPIRED'], required: true },
    memberIds: {
      type: [String],
      required: true,
      validate: {
        validator: (memberIds: string[]) =>
          memberIds.length === 2 && memberIds[0] !== memberIds[1],
        message: 'Weekly cycle must contain two different pair members',
      },
    },
    memberCompletion: {
      type: [memberCompletionSchema],
      required: true,
      validate: {
        validator: (members: WeeklyCycleMemberCompletion[]) =>
          members.length === 2 && members[0].userId !== members[1].userId,
        message: 'Weekly cycle must track both pair members',
      },
    },
    pairReadiness: {
      type: String,
      enum: ['NOT_READY', 'PARTIAL', 'ENOUGH', 'INSUFFICIENT', 'EXPIRED'],
      required: true,
    },
    submissionCount: { type: Number, required: true, min: 0, max: 2 },
    submissionClaims: {
      type: [submissionClaimSchema],
      required: true,
      default: [],
      select: false,
    },
    inputDefinitionVersion: { type: String, required: true },
    algorithmVersion: { type: String, required: true },
    latestSnapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'PairStateSnapshot',
    },
    latestSnapshotRevision: { type: Number, min: 0 },
  },
  {
    collection: 'weekly_cycles',
    timestamps: true,
    versionKey: false,
  }
);

weeklyCycleSchema.index({ pairId: 1, cycleKey: 1 }, { unique: true });
weeklyCycleSchema.index({ pairId: 1, startsAt: -1 });
weeklyCycleSchema.index({ status: 1, endsAt: 1 });

export const WeeklyCycle =
  (mongoose.models.WeeklyCycle as mongoose.Model<WeeklyCycleType>) ||
  mongoose.model<WeeklyCycleType>('WeeklyCycle', weeklyCycleSchema);
