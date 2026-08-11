import mongoose, { Schema, type FilterQuery } from 'mongoose';
import {
  CONTENT_PUBLICATION_STATUS_VALUES,
  type ContentPublicationStatus,
} from '@/models/ActivityTemplate';

export const QUESTIONNAIRE_CONTENT_MODEL = 'SEMANTIC_V1' as const;

/** Один вопрос внутри анкеты. Semantic keys describe content, not a score binding. */
export interface QuestionItem {
  id: string;
  domainKey: string;
  topicKey: string;
  scale: 'likert5' | 'bool';
  optionCount: number;
  text: Record<string, string>;
  scope?: 'solo' | 'pair' | 'pair_or_solo';
  audience?: 'personal' | 'couple' | 'weekly';
  sensitivity?: 'low' | 'medium' | 'high';
  locale?: 'ru' | 'en';
  explanation?: string;
  contentRevision: string;
}

export interface QuestionnaireType {
  _id: string;
  contentModel: typeof QUESTIONNAIRE_CONTENT_MODEL;
  publicationStatus: ContentPublicationStatus;
  reviewedAt?: Date;
  publishedAt?: Date;
  retiredAt?: Date;
  title: Record<string, string>;
  description?: Record<string, string>;
  meta?: {
    isStarter?: boolean;
    [key: string]: unknown;
  };
  target: {
    type: 'individual' | 'couple';
    gender: 'unisex' | 'male' | 'female';
  };
  domainKey: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
  version: number;
  randomize: boolean;
  questions: QuestionItem[];
}

const QuestionSchema = new Schema<QuestionItem>({
  id: { type: String, required: true },
  domainKey: { type: String, required: true },
  topicKey: { type: String, required: true },
  scale: { type: String, enum: ['likert5', 'bool'], required: true },
  optionCount: { type: Number, required: true, min: 2, max: 7 },
  text: { type: Schema.Types.Mixed, required: true },
  scope: { type: String, enum: ['solo', 'pair', 'pair_or_solo'] },
  audience: { type: String, enum: ['personal', 'couple', 'weekly'] },
  sensitivity: { type: String, enum: ['low', 'medium', 'high'] },
  locale: { type: String, enum: ['ru', 'en'] },
  explanation: { type: String },
  contentRevision: { type: String, required: true },
}, { _id:false });

const QuestionnaireSchema = new Schema<QuestionnaireType>({
  _id: { type: String, required: true },
  contentModel: {
    type: String,
    enum: [QUESTIONNAIRE_CONTENT_MODEL],
    required: true,
  },
  publicationStatus: {
    type: String,
    enum: CONTENT_PUBLICATION_STATUS_VALUES,
    required: true,
    default: 'draft',
  },
  reviewedAt: Date,
  publishedAt: Date,
  retiredAt: Date,
  title: { type: Schema.Types.Mixed, required: true },
  description: { type: Schema.Types.Mixed },
  meta: { type: Schema.Types.Mixed },
  target: {
    type: { type: String, enum: ['individual', 'couple'], default: 'individual' },
    gender: { type: String, enum: ['unisex', 'male', 'female'], default: 'unisex' },
  },
  domainKey: { type: String, required: true },
  difficulty: { type: Number, enum: [1, 2, 3], default: 1 },
  tags: { type: [String], default: [] },
  version: { type: Number, min: 1, default: 1 },
  randomize: { type: Boolean, default: false },
  questions: { type: [QuestionSchema], required: true },
}, { collection:'questionnaires', timestamps:true });

QuestionnaireSchema.pre('validate', function validatePublicationGate() {
  const reviewed = this.reviewedAt instanceof Date;
  const published = this.publishedAt instanceof Date;
  const retired = this.retiredAt instanceof Date;

  if (this.publicationStatus === 'published' && (!reviewed || !published || retired)) {
    throw new Error('Published questionnaire requires review and publish timestamps');
  }
  if (this.publicationStatus === 'retired' && (!reviewed || !published || !retired)) {
    throw new Error('Retired questionnaire requires review, publish, and retire timestamps');
  }

  if (!this.domainKey.trim()) {
    throw new Error('Questionnaire domainKey must not be empty');
  }
  if (this.questions.length === 0) {
    throw new Error('Questionnaire requires at least one question');
  }

  const ids = new Set<string>();
  for (const question of this.questions) {
    if (!question.id.trim() || !question.domainKey.trim() || !question.topicKey.trim()) {
      throw new Error('Questionnaire semantic keys must not be empty');
    }
    if (!question.contentRevision.trim()) {
      throw new Error('Questionnaire question contentRevision must not be empty');
    }
    if (ids.has(question.id)) {
      throw new Error('Questionnaire question ids must be unique');
    }
    ids.add(question.id);

    const expectedOptionCount = question.scale === 'bool' ? 2 : 5;
    if (question.optionCount !== expectedOptionCount) {
      throw new Error('Questionnaire optionCount must match question scale');
    }
  }
});

QuestionnaireSchema.index(
  { publicationStatus: 1, 'target.type': 1, updatedAt: -1 },
  { name: 'questionnaire_published_catalog' }
);

export const publishedQuestionnaireFilter = (): FilterQuery<QuestionnaireType> => ({
  contentModel: QUESTIONNAIRE_CONTENT_MODEL,
  publicationStatus: 'published',
  version: { $gte: 1 },
  reviewedAt: { $type: 'date' },
  publishedAt: { $type: 'date' },
  retiredAt: { $exists: false },
});

export const Questionnaire =
  (mongoose.models.Questionnaire as mongoose.Model<QuestionnaireType>) ||
  mongoose.model<QuestionnaireType>('Questionnaire', QuestionnaireSchema);
