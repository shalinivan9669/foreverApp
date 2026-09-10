import mongoose, { Schema } from 'mongoose';
export interface AssessmentPracticeType {
  _id: string; ownerId: string; skillId: 'DOM.S07' | 'COM.S02' | 'COM.S04'; publicationId: string;
  goal: string; mode: 'SOLO_REHEARSAL' | 'OWN_ACTION'; revision: number; deletionGeneration: number;
  status: 'STARTED' | 'NO_OPPORTUNITY' | 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'DECLINED';
  startedAt: string; reportedAt: string | null; note: string; observedAt: string | null;
  updatedAt: Date; createdAt: Date;
}
const schema = new Schema<AssessmentPracticeType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  skillId: { type: String, enum: ['DOM.S07', 'COM.S02', 'COM.S04'], required: true }, publicationId: { type: String, required: true },
  goal: { type: String, required: true }, mode: { type: String, enum: ['SOLO_REHEARSAL', 'OWN_ACTION'], required: true }, revision: { type: Number, default: 0 }, deletionGeneration: { type: Number, required: true },
  status: { type: String, enum: ['STARTED', 'NO_OPPORTUNITY', 'NOT_ATTEMPTED', 'ATTEMPTED', 'DECLINED'], default: 'STARTED' },
  startedAt: { type: String, required: true }, reportedAt: { type: String, default: null }, note: { type: String, default: '' }, observedAt: { type: String, default: null },
}, { collection: 'assessment_practices', versionKey: false, timestamps: true });
schema.index({ ownerId: 1, startedAt: -1 }, { name: 'assessment_practice_history' });
export const AssessmentPractice = (mongoose.models.AssessmentPractice as mongoose.Model<AssessmentPracticeType>) || mongoose.model<AssessmentPracticeType>('AssessmentPractice', schema);
