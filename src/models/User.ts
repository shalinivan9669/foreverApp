import mongoose, { Schema, Types } from 'mongoose';

export interface UserType {
  id: string;
  username: string;
  avatar: string;
  personal: {
    gender: 'male' | 'female' | 'other';
    age: number;
    city: string;
    relationshipStatus: 'seeking' | 'in_relationship';
  };
  vectors: Record<string, {
    level: number;
    positives: string[];
    negatives: string[];
  }>;
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
  };
  createdAt?: Date;
  updatedAt?: Date;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
}

const EMBEDDING_DIM = 768;

const vectorSchema = new Schema(
  {
    level:     { type: Number, required: true, default: 0 },
    positives: { type: [String], default: [] },
    negatives: { type: [String], default: [] },
  },
  { _id: false }
);

const userSchema = new Schema<UserType>(
  {
    id:       { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar:   { type: String, required: true },
    personal: {
      gender:             { type: String, enum: ['male','female','other'], required: true },
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
    embeddings: {
      type: Schema.Types.Mixed,
    },
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
      onboarding: {
        seeking: {
          valuedQualities: { type: [String], validate: (a: string[]) => a.length === 3 },
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
userSchema.index({ embeddings: { type: 'knnVector', dimensions: EMBEDDING_DIM, similarity: 'cosine' } } as any);

export const User =
  (mongoose.models.User as mongoose.Model<UserType>) ||
  mongoose.model<UserType>('User', userSchema);
