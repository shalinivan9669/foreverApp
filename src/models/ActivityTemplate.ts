import mongoose, { Schema } from 'mongoose';

export type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

export interface CheckInTpl {
  id: string;
  scale: 'likert5' | 'bool';
  map: number[];                       // [-3,-1,0,1,3] / [-3,3]
  text: { ru: string; en: string };
  successThreshold?: number;           // 0..1
  weight?: number;                     // 0..1
}

export interface EffectTpl {
  axis: Axis;
  baseDelta: number;                   // 0..1
  facetsAdd?: string[];
  facetsRemove?: string[];
  riskFacetsGuard?: string[];
  target?: 'A' | 'B' | 'both';         // <- добавили, по умолчанию both
}

export interface ActivityTemplateType {
  _id: string;
  intent: 'improve' | 'celebrate';
  archetype: 'micro_habit' | 'dialogue' | 'ritual' | 'date' | 'game' | 'education' | 'task';
  axis: Axis[];                        // обычно одна ось
  facetsTarget?: string[];

  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;

  timeEstimateMin?: number;
  costEstimate?: number;
  location?: 'home' | 'outdoor' | 'online' | 'any';
  requiresConsent?: boolean;

  title: Record<string, string>;
  description: Record<string, string>;
  steps?: { ru: string[]; en: string[] };
  materials?: string[];

  checkIns: CheckInTpl[];
  effect: EffectTpl[];

  preconditions?: {
    minPairLevel?: Partial<Record<Axis, number>>;
    maxFatigue?: number;
    blockedIfRiskFacets?: string[];
    needsComplementarity?: boolean;
  };

  cooldownDays?: number;
}

/* subdocs */
const CheckInSchema = new Schema<CheckInTpl>(
  {
    id: { type: String, required: true },
    scale: { type: String, enum: ['likert5', 'bool'], required: true },
    map: { type: [Number], required: true },
    text: { type: Schema.Types.Mixed, required: true },
    successThreshold: Number,
    weight: Number,
  },
  { _id: false }
);

const EffectSchema = new Schema<EffectTpl>(
  {
    axis: {
      type: String,
      enum: ['communication','domestic','personalViews','finance','sexuality','psyche'],
      required: true,
    },
    baseDelta: { type: Number, required: true },
    facetsAdd: { type: [String], default: [] },
    facetsRemove: { type: [String], default: [] },
    riskFacetsGuard: { type: [String], default: [] },
    target: { type: String, enum: ['A','B','both'], default: 'both' },
  },
  { _id: false }
);

/* root */
const ActivityTemplateSchema = new Schema<ActivityTemplateType>(
  {
    _id: { type: String, required: true },
    intent: { type: String, enum: ['improve','celebrate'], required: true },
    archetype: {
      type: String,
      enum: ['micro_habit','dialogue','ritual','date','game','education','task'],
      required: true,
    },

    axis: {
      type: [String],
      enum: ['communication','domestic','personalViews','finance','sexuality','psyche'],
      required: true,
    },
    facetsTarget: { type: [String], default: [] },

    difficulty: { type: Number, enum: [1,2,3,4,5], required: true },
    intensity:  { type: Number, enum: [1,2,3],     required: true },

    timeEstimateMin: Number,
    costEstimate: Number,
    location: { type: String, enum: ['home','outdoor','online','any'], default: 'any' },
    requiresConsent: { type: Boolean, default: false },

    title:       { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed, required: true },
    steps:       { type: Schema.Types.Mixed },
    materials:   { type: [String], default: [] },

    checkIns: { type: [CheckInSchema], required: true },
    effect:   { type: [EffectSchema],  required: true },

    preconditions: { type: Schema.Types.Mixed },
    cooldownDays:  Number,
  },
  { collection: 'activity_templates', timestamps: true }
);

export const ActivityTemplate =
  (mongoose.models.ActivityTemplate as mongoose.Model<ActivityTemplateType>) ||
  mongoose.model<ActivityTemplateType>('ActivityTemplate', ActivityTemplateSchema);

export { CheckInSchema, EffectSchema };
