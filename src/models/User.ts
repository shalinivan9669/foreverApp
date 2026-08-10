import mongoose, { Schema, Types } from 'mongoose';

export type VectorLayer = 'trait' | 'state' | 'matching' | 'displayed';

export interface UserVectorLayerData {
  level: number;
  confidence: number;
  evidenceCount: number;
  positives: string[];
  negatives: string[];
  lastQuestionnaireId?: Types.ObjectId | string;
  lastSessionId?: Types.ObjectId | string;
  scoringVersion: string;
  updatedAt?: Date;
}

export interface UserDisplayedVectorData {
  level: number;
  confidence: number;
  source: 'trait' | 'state_adjusted' | 'insufficient_data';
  updatedAt?: Date;
}

export interface UserAxisVector {
  level: number;
  positives: string[];
  negatives: string[];
  trait?: UserVectorLayerData;
  state?: UserVectorLayerData;
  matching?: UserVectorLayerData;
  displayed?: UserDisplayedVectorData;
}

export interface UserType {
  id: string;
  username: string;
  avatar: string;
  personal: {
    gender: 'male' | 'female';
    age: number;
    city: string;
    relationshipStatus: 'seeking' | 'in_relationship';
  };
  vectors: Record<string, UserAxisVector>;
  vectorsMeta?: {
    personalQuestionnaireCooldowns?: Record<string, Date | string> | Map<string, Date | string>;
  };
  embeddings?: Record<string, number[]>;
  preferences: {
    desiredAgeRange: { min: number; max: number };
    maxDistanceKm: number;
  };
  matchMeta?: {
    recentMatches: {
      candidateId: Types.ObjectId;
      score: number;
      computedAt: Date;
    }[];
  };
  readiness?: { score: number; updatedAt: Date };
  fatigue?: { score: number; updatedAt: Date };
  profile?: {
    relationshipLens?: {
      defaultLens?: 'feminine' | 'masculine' | 'balanced' | 'custom';
      source?: 'gender_default' | 'user_setting';
      preferredSupportStyle?:
        | 'listen'
        | 'solve'
        | 'hug'
        | 'space'
        | 'practical_help'
        | 'soft_presence';
      conflictPattern?:
        | 'withdraw'
        | 'argue'
        | 'freeze'
        | 'explain'
        | 'please'
        | 'avoid';
      privacyDefaults?: {
        dailyStatePrivate?: boolean;
        journalPrivate?: boolean;
        bodyContextPrivate?: boolean;
        partnerSignalsEnabled?: boolean;
        pairMapContributionEnabled?: boolean;
      };
    };
    onboarding?: {
      seeking?: {
        valuedQualities: string[];
        relationshipPriority:
          'emotional_intimacy' | 'shared_interests' | 'financial_stability' | 'other';
        minExperience: 'none' | '1-2_years' | 'more_2_years';
        dealBreakers: string;
        firstDateSetting: 'cafe' | 'walk' | 'online' | 'other';
        weeklyTimeCommitment: '<5h' | '5-10h' | '>10h';
      };
      inRelationship?: {
        satisfactionRating: number;
        communicationFrequency: 'daily' | 'weekly' | 'less';
        jointBudgeting: 'shared' | 'separate';
        conflictResolutionStyle: 'immediate' | 'cool_off' | 'avoid';
        sharedActivitiesPerMonth: number;
        mainGrowthArea:
          'communication' | 'finance' | 'intimacy' | 'domestic' | 'emotional_support';
      };
    };
    matchCard?: {
      requirements: string[]; // 3 шт, ≤80
      give: string[];         // 3 шт, ≤80
      questions: string[];    // 2 шт, ≤120
      isActive: boolean;
      updatedAt?: Date;
    };
  };
  createdAt?: Date;
  updatedAt?: Date;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
}

const vectorLayerSchema = new Schema<UserVectorLayerData>(
  {
    level: { type: Number, required: true, default: 0, min: 0, max: 1 },
    confidence: { type: Number, required: true, default: 0, min: 0, max: 1 },
    evidenceCount: { type: Number, required: true, default: 0, min: 0 },
    positives: { type: [String], default: [] },
    negatives: { type: [String], default: [] },
    lastQuestionnaireId: { type: Schema.Types.Mixed },
    lastSessionId: { type: Schema.Types.Mixed },
    scoringVersion: { type: String, required: true, default: 'scoring_v1' },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const displayedVectorSchema = new Schema<UserDisplayedVectorData>(
  {
    level: { type: Number, required: true, default: 0, min: 0, max: 1 },
    confidence: { type: Number, required: true, default: 0, min: 0, max: 1 },
    source: {
      type: String,
      enum: ['trait', 'state_adjusted', 'insufficient_data'],
      required: true,
      default: 'insufficient_data',
    },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const vectorSchema = new Schema<UserAxisVector>(
  {
    level:     { type: Number, required: true, default: 0, min: 0, max: 1 },
    positives: { type: [String], default: [] },
    negatives: { type: [String], default: [] },
    trait:     { type: vectorLayerSchema, default: () => ({}) },
    state:     { type: vectorLayerSchema, default: () => ({}) },
    matching:  { type: vectorLayerSchema, default: () => ({}) },
    displayed: { type: displayedVectorSchema, default: () => ({}) },
  },
  { _id: false }
);

// валидаторы длины
const arrLen =
  (n: number) => (a: unknown[]) => Array.isArray(a) && a.length === n;
const strLimit =
  (max: number) => (s: unknown) =>
    typeof s === 'string' && s.trim().length > 0 && s.trim().length <= max;

// схемы под карточку
const matchCardSchema = new Schema(
  {
    requirements: {
      type: [String],
      default: ['', '', ''],
      validate: [
        { validator: arrLen(3), msg: 'requirements must have length 3' },
        {
          validator: (a: string[]) => a.every(strLimit(80)),
          msg: 'requirements items must be 1..80 chars'
        }
      ]
    },
    give: {
      type: [String],
      default: ['', '', ''],
      validate: [
        { validator: arrLen(3), msg: 'give must have length 3' },
        {
          validator: (a: string[]) => a.every(strLimit(80)),
          msg: 'give items must be 1..80 chars'
        }
      ]
    },
    questions: {
      type: [String],
      default: ['', ''],
      validate: [
        { validator: arrLen(2), msg: 'questions must have length 2' },
        {
          validator: (a: string[]) => a.every(strLimit(120)),
          msg: 'questions items must be 1..120 chars'
        }
      ]
    },
    isActive: { type: Boolean, default: true },
    updatedAt:{ type: Date }
  },
  { _id: false }
);

const relationshipLensSchema = new Schema(
  {
    defaultLens: {
      type: String,
      enum: ['feminine', 'masculine', 'balanced', 'custom'],
    },
    source: {
      type: String,
      enum: ['gender_default', 'user_setting'],
    },
    preferredSupportStyle: {
      type: String,
      enum: ['listen', 'solve', 'hug', 'space', 'practical_help', 'soft_presence'],
    },
    conflictPattern: {
      type: String,
      enum: ['withdraw', 'argue', 'freeze', 'explain', 'please', 'avoid'],
    },
    privacyDefaults: {
      dailyStatePrivate: { type: Boolean },
      journalPrivate: { type: Boolean },
      bodyContextPrivate: { type: Boolean },
      partnerSignalsEnabled: { type: Boolean },
      pairMapContributionEnabled: { type: Boolean },
    },
  },
  { _id: false }
);

const userSchema = new Schema<UserType>(
  {
    id:       { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar:   { type: String, required: true },
    personal: {
      gender:             { type: String, enum: ['male','female'], required: true },
      age:                { type: Number, required: true },
      city:               { type: String, required: true },
      relationshipStatus: { type: String, enum: ['seeking','in_relationship'], required: true },
    },
    vectors: {
      communication:  { type: vectorSchema, required: true, default: () => ({}) },
      domestic:       { type: vectorSchema, required: true, default: () => ({}) },
      personalViews:  { type: vectorSchema, required: true, default: () => ({}) },
      finance:        { type: vectorSchema, required: true, default: () => ({}) },
      sexuality:      { type: vectorSchema, required: true, default: () => ({}) },
      psyche:         { type: vectorSchema, required: true, default: () => ({}) },
    },
    vectorsMeta: {
      personalQuestionnaireCooldowns: {
        type: Map,
        of: Date,
        default: {},
      },
    },
    embeddings: { type: Schema.Types.Mixed },
    preferences: {
      desiredAgeRange: {
        min: { type: Number, required: true, default: 18 },
        max: { type: Number, required: true, default: 99 },
      },
      maxDistanceKm: { type: Number, required: true, default: 50 },
    },
    matchMeta: {
      recentMatches: [
        {
          candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          score:       { type: Number, required: true },
          computedAt:  { type: Date, required: true },
        }
      ],
    },
    readiness: {
      score: { type: Number, default: 0, min: 0, max: 1 },
      updatedAt: { type: Date, default: Date.now },
    },
    fatigue: {
      score: { type: Number, default: 0, min: 0, max: 1 },
      updatedAt: { type: Date, default: Date.now },
    },
    profile: {
      relationshipLens: { type: relationshipLensSchema },
      onboarding: {
        seeking: {
          valuedQualities: {
            type: [String],
            default: ['', '', ''],
            validate: (a: string[]) =>
              Array.isArray(a) && a.length === 3 && a.every((v) => v.trim() !== ''),
          },
          relationshipPriority: {
            type: String,
            enum: ['emotional_intimacy','shared_interests','financial_stability','other'],
          },
          minExperience: { type: String, enum: ['none','1-2_years','more_2_years'] },
          dealBreakers: { type: String },
          firstDateSetting: { type: String, enum: ['cafe','walk','online','other'] },
          weeklyTimeCommitment: { type: String, enum: ['<5h','5-10h','>10h'] },
        },
        inRelationship: {
          satisfactionRating: { type: Number, min: 1, max: 5 },
          communicationFrequency: { type: String, enum: ['daily','weekly','less'] },
          jointBudgeting: { type: String, enum: ['shared','separate'] },
          conflictResolutionStyle: { type: String, enum: ['immediate','cool_off','avoid'] },
          sharedActivitiesPerMonth: { type: Number },
          mainGrowthArea: {
            type: String,
            enum: ['communication','finance','intimacy','domestic','emotional_support'],
          },
        },
      },
      matchCard: { type: matchCardSchema }
    },
    location: {
      type:        { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
  },
  { timestamps: true }
);

userSchema.index({ 'personal.city': 1 });
userSchema.index({ 'personal.gender': 1, 'personal.relationshipStatus': 1 });
userSchema.index({ location: '2dsphere' });

export const User =
  (mongoose.models.User as mongoose.Model<UserType>) ||
  mongoose.model<UserType>('User', userSchema);
