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
  activeActivity?: ActiveActivity;  // опционально
  progress?: Progress;              // опционально
  passport?: {
    strongSides: { axis: string; facets: string[] }[];
    riskZones:   { axis: string; facets: string[]; severity: 1|2|3 }[];
    complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
    levelDelta:  { axis: string; delta: number }[];
  };
  fatigue?:   { score: number; updatedAt: Date };
  readiness?: { score: number; updatedAt: Date };
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
      validate: (a: unknown[]) => Array.isArray(a) && a.length === 2,
    },
    key:    { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active' },

    // ВАЖНО: никаких default: undefined
    activeActivity: { type: ActiveActivitySchema, required: false },
    progress:       { type: ProgressSchema,     required: false },

    passport: {
      strongSides:   [{ axis: String, facets: [String] }],
      riskZones:     [{ axis: String, facets: [String], severity: { type: Number, enum: [1,2,3] } }],
      complementMap: [{ axis: String, A_covers_B: [String], B_covers_A: [String] }],
      levelDelta:    [{ axis: String, delta: Number }],
    },

    fatigue:   { score: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } },
    readiness: { score: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } },
  },
  { timestamps: true, collection: 'pairs' }
);

PairSchema.index({ members: 1, status: 1 });
PairSchema.index({ key: 1 }, { unique: true });

export const Pair =
  (mongoose.models.Pair as mongoose.Model<PairType>) ||
  mongoose.model<PairType>('Pair', PairSchema);
