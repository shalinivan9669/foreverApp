import mongoose, { Schema } from 'mongoose';
import type { AssessmentDirectAnswers } from '@/domain/assessment/comparison';
import type { AssessmentPeriod } from '@/domain/assessment/contracts';

export type AssessmentDirectType = {
  _id: string; ownerId: string; revision: number; permissionRevision: number;
  deletionGeneration: number; useForComparison: boolean; pairUse: boolean; status: 'ACTIVE' | 'DELETED';
  period: AssessmentPeriod; answers: AssessmentDirectAnswers | null;
  createdAt: Date; updatedAt: Date;
};
// The service validates the complete strict answer schema; Mongo receives only typed own data.
const schema = new Schema<AssessmentDirectType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true }, permissionRevision: { type: Number, required: true },
  deletionGeneration: { type: Number, required: true }, useForComparison: { type: Boolean, default: false },
  pairUse: { type: Boolean, default: false },
  status: { type: String, enum: ['ACTIVE', 'DELETED'], default: 'ACTIVE' },
  period: { type: Schema.Types.Mixed, required: true }, answers: { type: Schema.Types.Mixed, default: null },
}, { collection: 'assessment_direct', timestamps: true, versionKey: false });
// One canonical owner document relies on built-in _id uniqueness even with autoIndex disabled.
export const AssessmentDirect = (mongoose.models.AssessmentDirect as mongoose.Model<AssessmentDirectType>) || mongoose.model<AssessmentDirectType>('AssessmentDirect', schema);
