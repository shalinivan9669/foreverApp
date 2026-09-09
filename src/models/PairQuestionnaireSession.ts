import mongoose, { Schema, Types } from 'mongoose';

export interface PairQuestionnaireSessionType {
  pairId: Types.ObjectId;
  questionnaireId: string;
  questionnaireVersion?: number;
  members: [Types.ObjectId, Types.ObjectId];
  startedAt: Date;
  finishedAt?: Date;
  status: 'in_progress' | 'completed' | 'closed';
  meta?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const PairQuestionnaireSessionSchema = new Schema<PairQuestionnaireSessionType>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    questionnaireId: { type: String, required: true },
    questionnaireVersion: { type: Number, min: 1, immutable: true },
    members: { type: [Schema.Types.ObjectId], ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'closed'],
      default: 'in_progress',
    },
    meta: { type: Schema.Types.Mixed },
  },
  { collection: 'pair_qn_sessions', timestamps: true }
);

PairQuestionnaireSessionSchema.index(
  { pairId: 1, questionnaireId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'in_progress' },
    name: 'one_in_progress_pair_questionnaire_session',
  }
);
PairQuestionnaireSessionSchema.index({ pairId: 1, questionnaireId: 1, status: 1 });
PairQuestionnaireSessionSchema.index({ pairId: 1, createdAt: -1 });

export const PairQuestionnaireSession =
  (mongoose.models.PairQuestionnaireSession as mongoose.Model<PairQuestionnaireSessionType>) ||
  mongoose.model<PairQuestionnaireSessionType>('PairQuestionnaireSession', PairQuestionnaireSessionSchema);

