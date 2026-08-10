import mongoose, { Schema, type FilterQuery } from 'mongoose';
import {
  CONTENT_PUBLICATION_STATUS_VALUES,
  type ContentPublicationStatus,
} from '@/models/ActivityTemplate';

/** Один вопрос внутри анкеты */
export interface QuestionItem {
  id:       string;
  axis:     'communication'|'domestic'|'personalViews'|'finance'|'sexuality'|'psyche';
  facet:    string;
  polarity: '+'|'-'|'neutral';
  scale:    'likert5'|'bool';
  map:      number[];                // например [-3,-1,0,1,3]
  weight:   number;
  text:     Record<string,string>;   // {ru,en}
  polarityNumeric?: 1|-1;
  reverseScoring?: boolean;
  confidenceWeight?: number;
  scope?: 'solo'|'pair'|'pair_or_solo';
  audience?: 'personal'|'couple'|'weekly';
  sensitivity?: 'low'|'medium'|'high';
  locale?: 'ru'|'en';
  explanation?: string;
  scoringVersion?: string;
}

export interface QuestionnaireType {
  _id: string;
  publicationStatus: ContentPublicationStatus;
  reviewedAt?: Date;
  publishedAt?: Date;
  retiredAt?: Date;
  title:       Record<string,string>;
  description?:Record<string,string>;
  meta?: {
    isStarter?: boolean;
    [key: string]: unknown;
  };
  target: {
    type:   'individual'|'couple';
    gender: 'unisex'|'male'|'female';
    vector: '+'|'-'|'neutral';
  };
  axis:       QuestionItem['axis'];
  difficulty: 1|2|3;
  tags: string[];
  version: number;
  randomize: boolean;
  questions: QuestionItem[];
}

const QuestionSchema = new Schema<QuestionItem>({
  id:       { type: String, required: true },
  axis:     { type: String, required: true },
  facet:    { type: String, required: true },
  polarity: { type: String, enum:['+','-','neutral'], default:'neutral' },
  scale:    { type: String, enum:['likert5','bool'], required:true },
  map:      { type: [Number], required:true },
  weight:   { type: Number, default:1 },
  text:     { type: Schema.Types.Mixed, required:true },
  polarityNumeric: { type: Number, enum:[1,-1] },
  reverseScoring: { type: Boolean },
  confidenceWeight: { type: Number },
  scope: { type: String, enum:['solo','pair','pair_or_solo'] },
  audience: { type: String, enum:['personal','couple','weekly'] },
  sensitivity: { type: String, enum:['low','medium','high'] },
  locale: { type: String, enum:['ru','en'] },
  explanation: { type: String },
  scoringVersion: { type: String }
}, { _id:false });

const QuestionnaireSchema = new Schema<QuestionnaireType>({
  _id:        { type:String, required:true },
  publicationStatus: {
    type: String,
    enum: CONTENT_PUBLICATION_STATUS_VALUES,
    required: true,
    default: 'draft',
  },
  reviewedAt: Date,
  publishedAt: Date,
  retiredAt: Date,
  title:      { type:Schema.Types.Mixed, required:true },
  description:{ type:Schema.Types.Mixed },
  meta:       { type:Schema.Types.Mixed },
  target: {
    type  : { type:String, default:'individual' },
    gender: { type:String, default:'unisex'    },
    vector: { type:String, default:'neutral'   }
  },
  axis:       { type:String, required:true },
  difficulty: { type:Number, enum:[1,2,3], default:1 },
  tags:       { type:[String], default:[] },
  version:    { type:Number, default:1 },
  randomize:  { type:Boolean, default:false },
  questions:  { type:[QuestionSchema], required:true }
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
});

QuestionnaireSchema.index(
  { publicationStatus: 1, 'target.type': 1, updatedAt: -1 },
  { name: 'questionnaire_published_catalog' }
);

export const publishedQuestionnaireFilter = (): FilterQuery<QuestionnaireType> => ({
  publicationStatus: 'published',
  version: { $gte: 1 },
  reviewedAt: { $type: 'date' },
  publishedAt: { $type: 'date' },
  retiredAt: { $exists: false },
});

export const Questionnaire =
  (mongoose.models.Questionnaire as mongoose.Model<QuestionnaireType>) ||
  mongoose.model<QuestionnaireType>('Questionnaire', QuestionnaireSchema);
