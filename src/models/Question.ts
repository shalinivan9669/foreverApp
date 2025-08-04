import mongoose, { Schema } from 'mongoose';

export interface QuestionType {
  _id: string;
  axis: 'communication'|'domestic'|'personalViews'|'finance'|'sexuality'|'psyche';
  facet: string;
  polarity: '+'|'-';
  scale: 'likert5'|'bool';
  map: number[];
  weight: number;
  text: Record<string,string>;
}

const questionSchema = new Schema<QuestionType>({
  _id:      { type:String, required:true },
  axis:     { type:String, required:true },
  facet:    { type:String, required:true },
  polarity: { type:String, enum:['+','-'], required:true },
  scale:    { type:String, enum:['likert5','bool'], required:true },
  map:      { type:[Number], required:true },
  weight:   { type:Number, required:true },
  text:     { type:Schema.Types.Mixed, required:true }
}, { _id:false, collection:'questions', versionKey:false });

// 👇 ЭТО главный export - объект-модель Mongoose
export const Question =
  (mongoose.models.Question as mongoose.Model<QuestionType>) ||
  mongoose.model<QuestionType>('Question', questionSchema);
