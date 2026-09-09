import mongoose, { Schema } from 'mongoose';
import type { AssessmentWindow } from '@/domain/assessment/boundaries';
import type { AssessmentCalculationEnvelope } from '@/domain/assessment/boundaries';

export type AssessmentPairWorkType = {
  _id: string; pairId: string; actorIds: string[]; revision: number; contentRevision: number;
  contentHash: string; content: string; assumptions: string[]; dependencyHash: string;
  basisEnvelope: AssessmentCalculationEnvelope; activeAt: string | null;
  confirmations: { ownerId: string; contentRevision: number; contentHash: string }[];
  revoked: boolean; proposedAt: string;
};
const schema = new Schema<AssessmentPairWorkType>({
  _id: { type: String, required: true }, pairId: { type: String, required: true, immutable: true },
  actorIds: { type: [String], required: true }, revision: { type: Number, required: true },
  contentRevision: { type: Number, required: true }, contentHash: { type: String, required: true },
  content: { type: String, required: true }, assumptions: { type: [String], default: [] },
  dependencyHash: { type: String, required: true }, confirmations: { type: Schema.Types.Mixed, default: [] },
  basisEnvelope: { type: Schema.Types.Mixed, required: true }, activeAt: { type: String, default: null },
  revoked: { type: Boolean, default: false }, proposedAt: { type: String, required: true },
}, { collection: 'assessment_pair_work', versionKey: false });
schema.index({ actorIds: 1 }, { name: 'assessment_pair_participants' });
export const AssessmentPairWork = (mongoose.models.AssessmentPairWork as mongoose.Model<AssessmentPairWorkType>) || mongoose.model<AssessmentPairWorkType>('AssessmentPairWork', schema);

export type AssessmentPairReportType = {
  _id: string; ownerId: string; pairId: string; contentRevision: number;
  periodId: string; window: AssessmentWindow; value: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null;
  shared: boolean; revision: number; recordedAt: string;
};
const reportSchema = new Schema<AssessmentPairReportType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true }, pairId: { type: String, required: true, immutable: true },
  contentRevision: { type: Number, required: true }, periodId: { type: String, required: true },
  window: { type: Schema.Types.Mixed, required: true }, value: { type: String, enum: ['NEEDS_CHANGE', 'ACCEPTABLE', 'GOOD', null], default: null },
  shared: { type: Boolean, default: false }, revision: { type: Number, required: true }, recordedAt: { type: String, required: true },
}, { collection: 'assessment_pair_reports', versionKey: false });
reportSchema.index({ ownerId: 1, pairId: 1 }, { name: 'assessment_owner_pair_reports' });
export const AssessmentPairReport = (mongoose.models.AssessmentPairReport as mongoose.Model<AssessmentPairReportType>) || mongoose.model<AssessmentPairReportType>('AssessmentPairReport', reportSchema);
