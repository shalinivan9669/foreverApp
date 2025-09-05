import mongoose, { Schema, Types } from 'mongoose';

export interface PairQuestionnaireAnswerType {
  sessionId: Types.ObjectId;
  pairId: Types.ObjectId;
  questionnaireId: string;
  questionId: string;
  by: 'A' | 'B';
  ui: number;
  at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PairQuestionnaireAnswerSchema = new Schema<PairQuestionnaireAnswerType>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'PairQuestionnaireSession', required: true },
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    questionnaireId: { type: String, required: true },
    questionId: { type: String, required: true },
    by: { type: String, enum: ['A', 'B'], required: true },
    ui: { type: Number, required: true },
    at: { type: Date, required: true },
  },
  { collection: 'pair_qn_answers', timestamps: true }
);

PairQuestionnaireAnswerSchema.index({ sessionId: 1 });
PairQuestionnaireAnswerSchema.index({ pairId: 1, questionnaireId: 1, questionId: 1 });

export const PairQuestionnaireAnswer =
  (mongoose.models.PairQuestionnaireAnswer as mongoose.Model<PairQuestionnaireAnswerType>) ||
  mongoose.model<PairQuestionnaireAnswerType>('PairQuestionnaireAnswer', PairQuestionnaireAnswerSchema);

