import mongoose, { Schema } from 'mongoose';

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
}

export interface QuestionnaireType {
  _id: string;
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
  text:     { type: Schema.Types.Mixed, required:true }
}, { _id:false });

const QuestionnaireSchema = new Schema<QuestionnaireType>({
  _id:        { type:String, required:true },
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

export const Questionnaire =
  (mongoose.models.Questionnaire as mongoose.Model<QuestionnaireType>) ||
  mongoose.model<QuestionnaireType>('Questionnaire', QuestionnaireSchema);
