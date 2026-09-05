import mongoose, { Schema, Types } from 'mongoose';

export interface UserType {
  id: string;
  publicId?: string;
  entryCohort?: 'SOLO' | 'EXISTING_PARTNER';
  entryCompletedAt?: Date;
  locationSource?: 'CITY_CATALOG' | 'DEVICE' | 'NONE';
  username: string;
  avatar: string;
  pairMembershipRevision?: number;
  personal: {
    gender: 'male' | 'female';
    age: number;
    city: string;
    relationshipStatus: 'seeking' | 'in_relationship';
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
      questions: string[];    // legacy 2 / canonical matching mirror 3, ≤120
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
        { validator: (items: string[]) => items.length === 2 || items.length === 3, msg: 'questions must have length 2 or 3' },
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
    publicId: { type: String, immutable: true },
    entryCohort: { type: String, enum: ['SOLO', 'EXISTING_PARTNER'] },
    entryCompletedAt: { type: Date },
    locationSource: { type: String, enum: ['CITY_CATALOG', 'DEVICE', 'NONE'] },
    username: { type: String, required: true },
    avatar:   { type: String, required: true },
    pairMembershipRevision: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    personal: {
      gender:             { type: String, enum: ['male','female'], required: true },
      age:                { type: Number, required: true },
      city:               { type: String, required: true },
      relationshipStatus: { type: String, enum: ['seeking','in_relationship'], required: true },
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
userSchema.index({ publicId: 1 }, { unique: true, sparse: true, name: 'user_public_pairing_id' });
userSchema.index({ 'personal.gender': 1, 'personal.relationshipStatus': 1 });
userSchema.index({ location: '2dsphere' });

export const User =
  (mongoose.models.User as mongoose.Model<UserType>) ||
  mongoose.model<UserType>('User', userSchema);
