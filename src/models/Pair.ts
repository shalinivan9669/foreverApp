import mongoose, { Schema } from 'mongoose';

export interface ActiveActivity {
  type: 'task' | 'reminder' | 'challenge' | null;
  id?: string;
  step?: number;
  pct?: number; // 0..1
}

export interface PairType {
  members: [string, string];    // Discord IDs, отсортированы
  key: string;                  // "A|B" в лексикографическом порядке
  status: 'active' | 'paused' | 'ended';
  activeActivity?: ActiveActivity;
  progress?: { streak: number; completed: number };
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

const PairSchema = new Schema<PairType>(
  {
    members: {
      type: [String],
      required: true,
      validate: (a: unknown[]) => Array.isArray(a) && a.length === 2,
    },
    key:    { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active' },
    activeActivity: { type: ActiveActivitySchema, default: undefined },
    progress: {
      streak:    { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
    } as any,
  },
  { timestamps: true }
);

// Быстрый поиск пары пользователя
PairSchema.index({ members: 1, status: 1 });
// Уникальность пары независимо от порядка
PairSchema.index({ key: 1 }, { unique: true });

export const Pair =
  (mongoose.models.Pair as mongoose.Model<PairType>) ||
  mongoose.model<PairType>('Pair', PairSchema);
