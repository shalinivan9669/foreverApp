import mongoose, { Schema } from 'mongoose';
import type { AssessmentWindow } from '@/domain/assessment/boundaries';
import type { AssessmentCalculationEnvelope } from '@/domain/assessment/boundaries';
import type { BetaAgreement, BetaReminderSettings } from '@/lib/dto/assessmentPair.dto';

export type AssessmentPairWorkType = {
  _id: string; pairId: string; actorIds: string[]; revision: number; contentRevision: number;
  contentHash: string; content: string; assumptions: string[]; dependencyHash: string;
  basisEnvelope: AssessmentCalculationEnvelope | null; activeAt: string | null;
  confirmations: { ownerId: string; contentRevision: number; contentHash: string }[];
  revoked: boolean; proposedAt: string;
  betaAgreement?: BetaAgreement;
  privateNotes?: { ownerId: string; note: string }[];
  reminderSettings?: { ownerId: string; settings: BetaReminderSettings }[];
};
const schema = new Schema<AssessmentPairWorkType>({
  _id: { type: String, required: true }, pairId: { type: String, required: true, immutable: true },
  actorIds: { type: [String], required: true }, revision: { type: Number, required: true },
  contentRevision: { type: Number, required: true }, contentHash: { type: String, required: true },
  content: { type: String, required: true }, assumptions: { type: [String], default: [] },
  dependencyHash: { type: String, required: true }, confirmations: { type: Schema.Types.Mixed, default: [] },
  basisEnvelope: { type: Schema.Types.Mixed, default: null }, activeAt: { type: String, default: null },
  betaAgreement: { type: Schema.Types.Mixed, default: undefined }, privateNotes: { type: Schema.Types.Mixed, default: [] }, reminderSettings: { type: Schema.Types.Mixed, default: [] },
  revoked: { type: Boolean, default: false }, proposedAt: { type: String, required: true },
}, { collection: 'assessment_pair_work', versionKey: false });
schema.index({ actorIds: 1 }, { name: 'assessment_pair_participants' });
export const AssessmentPairWork = (mongoose.models.AssessmentPairWork as mongoose.Model<AssessmentPairWorkType>) || mongoose.model<AssessmentPairWorkType>('AssessmentPairWork', schema);

export type AssessmentPairReportType = {
  _id: string; ownerId: string; pairId: string; contentRevision: number;
  periodId: string; window: AssessmentWindow; value: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null;
  shared: boolean; revision: number; recordedAt: string;
  metricId?: string; contextId?: string;
};
const reportSchema = new Schema<AssessmentPairReportType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true }, pairId: { type: String, required: true, immutable: true },
  contentRevision: { type: Number, required: true }, periodId: { type: String, required: true },
  window: { type: Schema.Types.Mixed, required: true }, value: { type: String, enum: ['NEEDS_CHANGE', 'ACCEPTABLE', 'GOOD', null], default: null },
  shared: { type: Boolean, default: false }, revision: { type: Number, required: true }, recordedAt: { type: String, required: true },
  metricId: { type: String, default: undefined }, contextId: { type: String, default: undefined },
}, { collection: 'assessment_pair_reports', versionKey: false });
reportSchema.index({ ownerId: 1, pairId: 1 }, { name: 'assessment_owner_pair_reports' });
export const AssessmentPairReport = (mongoose.models.AssessmentPairReport as mongoose.Model<AssessmentPairReportType>) || mongoose.model<AssessmentPairReportType>('AssessmentPairReport', reportSchema);

export type AssessmentPairOccurrenceType = {
  _id: string; agreementId: string; pairId: string; actorIds: string[]; contentRevision: number; contentHash: string; occurrenceKey: string;
  startsAt: Date; endsAt: Date; state: 'PLANNED' | 'CANCELLED'; agreement: BetaAgreement; dependencyHash: string;
};
const occurrenceSchema = new Schema<AssessmentPairOccurrenceType>({
  _id: { type: String, required: true }, agreementId: { type: String, required: true }, pairId: { type: String, required: true }, actorIds: { type: [String], required: true },
  contentRevision: { type: Number, required: true }, contentHash: { type: String, required: true }, occurrenceKey: { type: String, required: true },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true }, state: { type: String, enum: ['PLANNED', 'CANCELLED'], required: true },
  agreement: { type: Schema.Types.Mixed, required: true }, dependencyHash: { type: String, required: true },
}, { collection: 'assessment_pair_occurrences', versionKey: false });
occurrenceSchema.index({ agreementId: 1, contentRevision: 1, occurrenceKey: 1 }, { unique: true, name: 'assessment_occurrence_version' });
occurrenceSchema.index({ pairId: 1, startsAt: 1 }, { name: 'assessment_occurrence_pair' });
occurrenceSchema.index({ state: 1, startsAt: 1 }, { name: 'assessment_occurrence_due' });
export const AssessmentPairOccurrence = (mongoose.models.AssessmentPairOccurrence as mongoose.Model<AssessmentPairOccurrenceType>) || mongoose.model<AssessmentPairOccurrenceType>('AssessmentPairOccurrence', occurrenceSchema);
