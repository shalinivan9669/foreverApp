import mongoose, { Schema, Types } from 'mongoose';

export type PersonalDailyMood =
  | 'calm'
  | 'warm'
  | 'tired'
  | 'anxious'
  | 'sad'
  | 'irritated'
  | 'closed'
  | 'open';

export type PersonalTodayMode =
  | 'low_data'
  | 'stable'
  | 'low_resource'
  | 'closeness'
  | 'conflict_risk'
  | 'repair'
  | 'growth';

export type RelationshipLensType =
  | 'feminine'
  | 'masculine'
  | 'balanced'
  | 'custom';

export type RelationshipLensSource = 'gender_default' | 'user_setting';

export type PersonalDailyAnswers = {
  mood: PersonalDailyMood;
  energy: number;
  stress: number;
  closenessNeed: number;
  spaceNeed: number;
  supportNeed: number;
  conflictSensitivity: number;
  conversationReadiness: number;
};

export type PersonalDailyContext = {
  sleep?: 'good' | 'medium' | 'bad';
  workload?: 'low' | 'medium' | 'high';
  body?: {
    enabled: boolean;
    type?: 'cycle' | 'pain' | 'fatigue' | 'health' | 'other';
    note?: string;
    visibility: 'private';
  };
  customTags?: string[];
};

export type PersonalDailyCheckInType = {
  userId: string;
  pairId?: string | Types.ObjectId;
  dateKey: string;
  timezoneOffsetMin?: number;
  lens: {
    type: RelationshipLensType;
    source: RelationshipLensSource;
  };
  answers: PersonalDailyAnswers;
  context?: PersonalDailyContext;
  privateJournal?: {
    text?: string;
    updatedAt?: Date;
  };
  share: {
    partnerSignal: {
      enabled: boolean;
      text?: string;
      status: 'none' | 'draft' | 'sent' | 'hidden';
      sentSignalId?: string | Types.ObjectId;
      sentAt?: Date;
    };
    pairMap: {
      enabled: boolean;
      visibility: 'none' | 'aggregate_only';
    };
  };
  computed: {
    mode: PersonalTodayMode;
    metrics: {
      resource: number;
      closeness: number;
      tension: number;
      supportNeed: number;
      conversationReadiness: number;
      irritationRisk: number;
      initiative: number;
      repair: number;
    };
    focusTitle: string;
    focusSubtitle: string;
    ruleIds: string[];
    source: 'daily_checkin' | 'weekly_fallback' | 'profile_fallback' | 'low_data';
    computedVersion: 'personal-today-v1';
    generatedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

const answersSchema = new Schema<PersonalDailyAnswers>(
  {
    mood: {
      type: String,
      enum: ['calm', 'warm', 'tired', 'anxious', 'sad', 'irritated', 'closed', 'open'],
      required: true,
    },
    energy: { type: Number, required: true, min: 0, max: 1 },
    stress: { type: Number, required: true, min: 0, max: 1 },
    closenessNeed: { type: Number, required: true, min: 0, max: 1 },
    spaceNeed: { type: Number, required: true, min: 0, max: 1 },
    supportNeed: { type: Number, required: true, min: 0, max: 1 },
    conflictSensitivity: { type: Number, required: true, min: 0, max: 1 },
    conversationReadiness: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const contextSchema = new Schema<PersonalDailyContext>(
  {
    sleep: { type: String, enum: ['good', 'medium', 'bad'] },
    workload: { type: String, enum: ['low', 'medium', 'high'] },
    body: {
      enabled: { type: Boolean, default: false },
      type: { type: String, enum: ['cycle', 'pain', 'fatigue', 'health', 'other'] },
      note: { type: String, maxlength: 500 },
      visibility: { type: String, enum: ['private'], default: 'private' },
    },
    customTags: { type: [String], default: [], maxlength: 12 },
  },
  { _id: false }
);

const metricsSchema = new Schema<PersonalDailyCheckInType['computed']['metrics']>(
  {
    resource: { type: Number, required: true, min: 0, max: 1 },
    closeness: { type: Number, required: true, min: 0, max: 1 },
    tension: { type: Number, required: true, min: 0, max: 1 },
    supportNeed: { type: Number, required: true, min: 0, max: 1 },
    conversationReadiness: { type: Number, required: true, min: 0, max: 1 },
    irritationRisk: { type: Number, required: true, min: 0, max: 1 },
    initiative: { type: Number, required: true, min: 0, max: 1 },
    repair: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const personalDailyCheckInSchema = new Schema<PersonalDailyCheckInType>(
  {
    userId: { type: String, required: true },
    pairId: { type: Schema.Types.Mixed },
    dateKey: {
      type: String,
      required: true,
      validate: (value: string) => dateKeyRegex.test(value),
    },
    timezoneOffsetMin: { type: Number },
    lens: {
      type: {
        type: String,
        enum: ['feminine', 'masculine', 'balanced', 'custom'],
        required: true,
      },
      source: {
        type: String,
        enum: ['gender_default', 'user_setting'],
        required: true,
      },
    },
    answers: { type: answersSchema, required: true },
    context: { type: contextSchema },
    privateJournal: {
      text: { type: String, maxlength: 2000 },
      updatedAt: { type: Date },
    },
    share: {
      partnerSignal: {
        enabled: { type: Boolean, default: false },
        text: { type: String, maxlength: 300 },
        status: {
          type: String,
          enum: ['none', 'draft', 'sent', 'hidden'],
          default: 'none',
        },
        sentSignalId: { type: Schema.Types.Mixed },
        sentAt: { type: Date },
      },
      pairMap: {
        enabled: { type: Boolean, default: false },
        visibility: {
          type: String,
          enum: ['none', 'aggregate_only'],
          default: 'none',
        },
      },
    },
    computed: {
      mode: {
        type: String,
        enum: [
          'low_data',
          'stable',
          'low_resource',
          'closeness',
          'conflict_risk',
          'repair',
          'growth',
        ],
        required: true,
      },
      metrics: { type: metricsSchema, required: true },
      focusTitle: { type: String, required: true },
      focusSubtitle: { type: String, required: true },
      ruleIds: { type: [String], default: [] },
      source: {
        type: String,
        enum: ['daily_checkin', 'weekly_fallback', 'profile_fallback', 'low_data'],
        required: true,
      },
      computedVersion: {
        type: String,
        enum: ['personal-today-v1'],
        default: 'personal-today-v1',
        required: true,
      },
      generatedAt: { type: Date, required: true },
    },
  },
  { collection: 'personal_daily_checkins', timestamps: true }
);

personalDailyCheckInSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
personalDailyCheckInSchema.index({ pairId: 1, dateKey: 1 });
personalDailyCheckInSchema.index({ userId: 1, createdAt: -1 });

export const PersonalDailyCheckIn =
  (mongoose.models.PersonalDailyCheckIn as mongoose.Model<PersonalDailyCheckInType>) ||
  mongoose.model<PersonalDailyCheckInType>(
    'PersonalDailyCheckIn',
    personalDailyCheckInSchema
  );
