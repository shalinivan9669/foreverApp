import mongoose, { Schema } from 'mongoose';

export interface ActiveActivity {
  type: 'task' | 'reminder' | 'challenge' | null;
  id?: string;
  step?: number;
  pct?: number; // 0..1
}

export interface Progress {
  streak: number;
  completed: number;
}

export interface PairType {
  members: [string, string];        // Discord IDs, отсортированы
  key: string;                      // "A|B"
  status: 'active' | 'paused' | 'ended';
  contextVersion: 'pair-context-v1';
  lifecycleRevision?: number;
  endedAt?: Date;
  endedByUserId?: string;
  endReason?: 'MEMBER_REQUEST' | 'ACCOUNT_DELETION';
  activeActivity?: ActiveActivity;  // опционально
  progress?: Progress;              // опционально
  createdAt?: Date;
  updatedAt?: Date;
}

const ActiveActivitySchema = new Schema<ActiveActivity>(
  {
    type: { type: String, enum: ['task', 'reminder', 'challenge', null], default: null },
    id:   { type: String },
    step: { type: Number },
    pct:  { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false }
);

const ProgressSchema = new Schema<Progress>(
  { streak: { type: Number, default: 0 }, completed: { type: Number, default: 0 } },
  { _id: false }
);

const PairSchema = new Schema<PairType>(
  {
    members: {
      type: [String],
      required: true,
      validate: {
        validator: (members: string[]) =>
          Array.isArray(members) &&
          members.length === 2 &&
          String(members[0]) !== String(members[1]),
        message: 'Pair must contain two different members',
      },
    },
    // `key` groups the same two members. It is intentionally not unique: a
    // reconnect creates a new Pair document and therefore a new private
    // relationship context instead of reviving the ended one.
    key:    { type: String, required: true },
    status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active' },
    lifecycleRevision: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    contextVersion: {
      type: String,
      enum: ['pair-context-v1'],
      default: 'pair-context-v1',
      required: true,
      immutable: true,
    },
    endedAt: { type: Date },
    endedByUserId: { type: String },
    endReason: {
      type: String,
      enum: ['MEMBER_REQUEST', 'ACCOUNT_DELETION'],
    },

    // ВАЖНО: никаких default: undefined
    activeActivity: { type: ActiveActivitySchema, required: false },
    progress:       { type: ProgressSchema,     required: false },

  },
  { timestamps: true, collection: 'pairs' }
);

PairSchema.index({ members: 1, status: 1 });
PairSchema.index({ key: 1, createdAt: -1 }, { name: 'pair_contexts_by_member_key' });

export const Pair =
  (mongoose.models.Pair as mongoose.Model<PairType>) ||
  mongoose.model<PairType>('Pair', PairSchema);
