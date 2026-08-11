import mongoose, { Schema, type FilterQuery } from 'mongoose';

export const CONTENT_PUBLICATION_STATUS_VALUES = [
  'draft',
  'in_review',
  'published',
  'retired',
] as const;

export type ContentPublicationStatus =
  (typeof CONTENT_PUBLICATION_STATUS_VALUES)[number];

export type ActionDefinitionRef = {
  key: string;
  actionVersion: number;
  registryVersion: number;
};

export interface CheckInTpl {
  id: string;
  scale: 'likert5' | 'bool';
  map: number[];
  text: { ru: string; en: string };
  successThreshold?: number;
  weight?: number;
}

export interface ActivityTemplateType {
  _id: string;
  contentVersion: number;
  publicationStatus: ContentPublicationStatus;
  reviewedAt?: Date;
  publishedAt?: Date;
  retiredAt?: Date;
  intent: 'improve' | 'celebrate';
  archetype:
    | 'micro_habit'
    | 'dialogue'
    | 'ritual'
    | 'date'
    | 'game'
    | 'education'
    | 'task';
  actionDefinition: ActionDefinitionRef;
  targetFactorKeys: string[];

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
  cooldownDays?: number;
}

const ActionDefinitionRefSchema = new Schema<ActionDefinitionRef>(
  {
    key: { type: String, required: true, immutable: true },
    actionVersion: { type: Number, required: true, min: 1, immutable: true },
    registryVersion: { type: Number, required: true, min: 1, immutable: true },
  },
  { _id: false }
);

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

const ActivityTemplateSchema = new Schema<ActivityTemplateType>(
  {
    _id: { type: String, required: true },
    contentVersion: { type: Number, required: true, min: 1, default: 1 },
    publicationStatus: {
      type: String,
      enum: CONTENT_PUBLICATION_STATUS_VALUES,
      required: true,
      default: 'draft',
    },
    reviewedAt: Date,
    publishedAt: Date,
    retiredAt: Date,
    intent: { type: String, enum: ['improve', 'celebrate'], required: true },
    archetype: {
      type: String,
      enum: ['micro_habit', 'dialogue', 'ritual', 'date', 'game', 'education', 'task'],
      required: true,
    },
    actionDefinition: { type: ActionDefinitionRefSchema, required: true },
    targetFactorKeys: { type: [String], required: true },
    difficulty: { type: Number, enum: [1, 2, 3, 4, 5], required: true },
    intensity: { type: Number, enum: [1, 2, 3], required: true },
    timeEstimateMin: Number,
    costEstimate: Number,
    location: {
      type: String,
      enum: ['home', 'outdoor', 'online', 'any'],
      default: 'any',
    },
    requiresConsent: { type: Boolean, default: false },
    title: { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed, required: true },
    steps: { type: Schema.Types.Mixed },
    materials: { type: [String], default: [] },
    checkIns: { type: [CheckInSchema], required: true },
    cooldownDays: Number,
  },
  { collection: 'activity_templates', timestamps: true }
);

ActivityTemplateSchema.pre('validate', function validatePublicationGate() {
  const reviewed = this.reviewedAt instanceof Date;
  const published = this.publishedAt instanceof Date;
  const retired = this.retiredAt instanceof Date;

  if (this.targetFactorKeys.length === 0) {
    throw new Error('Activity content requires at least one target factor');
  }
  if (this.publicationStatus === 'published' && (!reviewed || !published || retired)) {
    throw new Error('Published activity content requires review and publish timestamps');
  }
  if (this.publicationStatus === 'retired' && (!reviewed || !published || !retired)) {
    throw new Error('Retired activity content requires review, publish, and retire timestamps');
  }
});

ActivityTemplateSchema.index(
  {
    publicationStatus: 1,
    'actionDefinition.key': 1,
    difficulty: 1,
    intensity: 1,
    updatedAt: -1,
  },
  { name: 'activity_template_published_selection' }
);

export const publishedActivityTemplateFilter = (): FilterQuery<ActivityTemplateType> => ({
  publicationStatus: 'published',
  contentVersion: { $gte: 1 },
  'actionDefinition.key': { $type: 'string' },
  'actionDefinition.actionVersion': { $gte: 1 },
  'actionDefinition.registryVersion': { $gte: 1 },
  'targetFactorKeys.0': { $exists: true },
  reviewedAt: { $type: 'date' },
  publishedAt: { $type: 'date' },
  retiredAt: { $exists: false },
});

export const ActivityTemplate =
  (mongoose.models.ActivityTemplate as mongoose.Model<ActivityTemplateType>) ||
  mongoose.model<ActivityTemplateType>('ActivityTemplate', ActivityTemplateSchema);

export { ActionDefinitionRefSchema, CheckInSchema };
