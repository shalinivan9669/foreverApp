import mongoose, { Schema } from 'mongoose';

export interface QuestionnaireType {
  _id: string;                // finance_basic
  title: string;
  axis: 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';
  audience: 'single' | 'pair';
  length: number;
  difficulty: 1 | 2 | 3;
  tags: string[];
  qids: string[];             // порядок фиксированный
  description?: string;
}

const schema = new Schema<QuestionnaireType>(
  {
    _id:        { type: String, required: true },
    title:      { type: String, required: true },
    axis:       { type: String, required: true },
    audience:   { type: String, enum: ['single','pair'], required: true },
    length:     { type: Number, required: true },
    difficulty: { type: Number, enum: [1,2,3], required: true },
    tags:       { type: [String], default: [] },
    qids:       { type: [String], required: true },
    description:{ type: String }
  },
  { _id: false, collection: 'questionnaires', versionKey:false }
);

export const Questionnaire =
  (mongoose.models.Questionnaire as mongoose.Model<QuestionnaireType>) ||
  mongoose.model<QuestionnaireType>('Questionnaire', schema);
