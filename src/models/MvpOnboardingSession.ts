import mongoose, { Schema } from 'mongoose';

export type MvpOnboardingCapturePolicy =
  | 'PRIVATE'
  | 'PAIR_MODEL_ONLY'
  | 'SHARED';

export type MvpOnboardingAnswerValue = {
  kind: 'single' | 'multi' | 'boolean' | 'skipped';
  optionId?: string;
  optionIds?: string[];
  booleanValue?: boolean;
};

export type MvpOnboardingAnswer = {
  questionId: string;
  questionRevision: string;
  answerRevision: number;
  capturePolicy: MvpOnboardingCapturePolicy;
  value: MvpOnboardingAnswerValue;
  answeredAt: Date;
};

export type MvpOnboardingConsent = {
  adultConfirmed: boolean;
  voluntaryParticipationConfirmed: boolean;
  privacyAcknowledged: boolean;
  confirmedAt: Date;
};

export type MvpOnboardingSessionType = {
  userId: string;
  status: 'in_progress' | 'completed';
  contentRevision: string;
  policyVersion: string;
  consent: MvpOnboardingConsent;
  cursor: number;
  answers: MvpOnboardingAnswer[];
  factorEngine: {
    status: 'PENDING' | 'MATERIALIZED';
    registryVersion?: number;
    evidenceEventIds: string[];
    individualSnapshotIds: string[];
  };
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const answerValueSchema = new Schema<MvpOnboardingAnswerValue>(
  {
    kind: {
      type: String,
      enum: ['single', 'multi', 'boolean', 'skipped'],
      required: true,
    },
    optionId: { type: String },
    optionIds: { type: [String], default: undefined },
    booleanValue: { type: Boolean },
  },
  { _id: false }
);

const answerSchema = new Schema<MvpOnboardingAnswer>(
  {
    questionId: { type: String, required: true },
    questionRevision: { type: String, required: true },
    answerRevision: { type: Number, required: true, min: 1 },
    capturePolicy: {
      type: String,
      enum: ['PRIVATE', 'PAIR_MODEL_ONLY', 'SHARED'],
      required: true,
    },
    value: { type: answerValueSchema, required: true },
    answeredAt: { type: Date, required: true },
  },
  { _id: false }
);

const consentSchema = new Schema<MvpOnboardingConsent>(
  {
    adultConfirmed: { type: Boolean, required: true },
    voluntaryParticipationConfirmed: { type: Boolean, required: true },
    privacyAcknowledged: { type: Boolean, required: true },
    confirmedAt: { type: Date, required: true },
  },
  { _id: false }
);

const factorEngineSchema = new Schema<MvpOnboardingSessionType['factorEngine']>(
  {
    status: {
      type: String,
      enum: ['PENDING', 'MATERIALIZED'],
      required: true,
      default: 'PENDING',
    },
    registryVersion: { type: Number, min: 1 },
    evidenceEventIds: { type: [String], required: true, default: [] },
    individualSnapshotIds: { type: [String], required: true, default: [] },
  },
  { _id: false }
);

const mvpOnboardingSessionSchema = new Schema<MvpOnboardingSessionType>(
  {
    userId: { type: String, required: true },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      required: true,
      default: 'in_progress',
    },
    contentRevision: { type: String, required: true },
    policyVersion: { type: String, required: true },
    consent: { type: consentSchema, required: true },
    cursor: { type: Number, required: true, min: 0, default: 0 },
    answers: { type: [answerSchema], default: [] },
    factorEngine: {
      type: factorEngineSchema,
      required: true,
      default: () => ({
        status: 'PENDING',
        evidenceEventIds: [],
        individualSnapshotIds: [],
      }),
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { collection: 'mvp_onboarding_sessions', timestamps: true }
);

mvpOnboardingSessionSchema.index(
  { userId: 1, contentRevision: 1, policyVersion: 1 },
  { unique: true }
);
mvpOnboardingSessionSchema.index({ userId: 1, updatedAt: -1 });

export const MvpOnboardingSession =
  (mongoose.models.MvpOnboardingSession as mongoose.Model<MvpOnboardingSessionType>) ||
  mongoose.model<MvpOnboardingSessionType>(
    'MvpOnboardingSession',
    mvpOnboardingSessionSchema
  );
