import mongoose, { Schema } from 'mongoose';
import type { Axis } from './ActivityTemplate';

export interface Passport {
  strongSides: Array<{ axis: Axis; facets: string[]; reason?: string }>;
  riskZones:   Array<{ axis: Axis; facets: string[]; reason?: string; severity: 1|2|3 }>;
  complementMap: Array<{ axis: Axis; A_covers_B: string[]; B_covers_A: string[] }>;
  levelDelta:  Array<{ axis: Axis; delta: number }>;
}

export interface PairType {
  members: [string, string];              // Discord IDs, отсортированы
  key: string;                             // "A|B"
  status: 'active'|'paused'|'ended';

  passport?: Passport;
  fatigue?: { score: number; updatedAt?: Date };
  readiness?: { score: number; updatedAt?: Date };
  prefs?: { challengeIntensity?: 'low'|'med'|'high' };

  activeActivity?: { type: 'task'|'reminder'|'challenge'|null; id?: string; axis?: Axis; step?: number; pct?: number };
  progress?: { streak: number; completed: number };

  createdAt?: Date;
  updatedAt?: Date;
}

const PassportSchema = new Schema<Passport>({
  strongSides: [{ axis:String, facets:[String], reason:String }],
  riskZones:   [{ axis:String, facets:[String], reason:String, severity:{ type:Number, enum:[1,2,3] } }],
  complementMap:[{ axis:String, A_covers_B:[String], B_covers_A:[String] }],
  levelDelta:  [{ axis:String, delta:Number }],
},{ _id:false });

const PairSchema = new Schema<PairType>({
  members: { type:[String], required:true, validate:(a:unknown[]) => Array.isArray(a) && a.length===2 },
  key: { type:String, required:true, unique:true },
  status: { type:String, enum:['active','paused','ended'], default:'active' },

  passport: { type: PassportSchema, default: undefined },
  fatigue: { type: { score:{ type:Number, default:0 }, updatedAt:Date }, default: undefined },
  readiness: { type: { score:{ type:Number, default:0 }, updatedAt:Date }, default: undefined },
  prefs: { type: { challengeIntensity:{ type:String, enum:['low','med','high'], default:'med' } }, default: undefined },

  activeActivity: { type: { type:String, enum:['task','reminder','challenge',null], default:null, }, default: undefined },
  progress: { type: { streak:{ type:Number, default:0 }, completed:{ type:Number, default:0 } }, default: undefined },
},{ timestamps:true });

PairSchema.index({ members:1, status:1 });
PairSchema.index({ key:1 }, { unique:true });

export const Pair =
  (mongoose.models.Pair as mongoose.Model<PairType>)
  || mongoose.model<PairType>('Pair', PairSchema);
