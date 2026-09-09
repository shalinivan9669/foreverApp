import mongoose, { Schema } from 'mongoose';
import type { AssessmentAnswerRecord, AssessmentPeriod } from '@/domain/assessment/contracts';
import type { AssessmentProfileSnapshot } from '@/domain/assessment/profile';
import type { Phase } from '@/domain/assessment/engine/core';

export type AssessmentPresentation = {
  presentationId: string; itemId: string; issuedRevision: number;
  phase: Phase; parentRevision: number | null; issuedAt: string;
};
export type AssessmentRunType = {
  _id: string; ownerId: string; publicationId: string; publicationVersion: string;
  status: 'DRAFT' | 'FINALIZED' | 'DELETED'; revision: number; observationRound: number;
  permissionRevision: number; deletionGeneration: number; pairUse: boolean; matchingUse: boolean;
  period: AssessmentPeriod; answers: AssessmentAnswerRecord[];
  presentations: AssessmentPresentation[]; assistedItemIds: string[];
  materializedRevision: number; snapshot: AssessmentProfileSnapshot | null;
  previousSource: { revision: number; period: AssessmentPeriod; answers: AssessmentAnswerRecord[]; snapshot: AssessmentProfileSnapshot; observationRound: number; finalizedAt: string } | null;
  followupSince: string | null;
  finalizedAt: string | null; createdAt: Date; updatedAt: Date;
};
// Mixed is limited to typed domain payloads validated at the service boundary;
// participant input is never sent directly to MongoDB or returned as a document.
const schema = new Schema<AssessmentRunType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  publicationId: { type: String, required: true, immutable: true }, publicationVersion: { type: String, required: true, immutable: true },
  status: { type: String, enum: ['DRAFT', 'FINALIZED', 'DELETED'], default: 'DRAFT' },
  revision: { type: Number, default: 0 }, permissionRevision: { type: Number, default: 0 },
  observationRound: { type: Number, default: 0 },
  deletionGeneration: { type: Number, required: true }, pairUse: { type: Boolean, default: false },
  matchingUse: { type: Boolean, default: false },
  period: { type: Schema.Types.Mixed, required: true }, answers: { type: Schema.Types.Mixed, default: [] },
  presentations: { type: Schema.Types.Mixed, default: [] }, assistedItemIds: { type: [String], default: [] },
  materializedRevision: { type: Number, default: -1 }, snapshot: { type: Schema.Types.Mixed, default: null },
  previousSource: { type: Schema.Types.Mixed, default: null }, followupSince: { type: String, default: null },
  finalizedAt: { type: String, default: null },
}, { collection: 'assessment_runs', versionKey: false, timestamps: true });
schema.index({ ownerId: 1, status: 1 }, { name: 'assessment_owner_sources' });
export const AssessmentRun = (mongoose.models.AssessmentRun as mongoose.Model<AssessmentRunType>) || mongoose.model<AssessmentRunType>('AssessmentRun', schema);

export type AssessmentOperationType = { _id: string; ownerId: string; requestHash: string; committedRevision: number; createdAt: Date };
const operationSchema = new Schema<AssessmentOperationType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true },
  requestHash: { type: String, required: true }, committedRevision: { type: Number, required: true },
}, { collection: 'assessment_operations', versionKey: false, timestamps: { createdAt: true, updatedAt: false } });
operationSchema.index({ ownerId: 1 }, { name: 'assessment_operation_owner' });
export const AssessmentOperation = (mongoose.models.AssessmentOperation as mongoose.Model<AssessmentOperationType>) || mongoose.model<AssessmentOperationType>('AssessmentOperation', operationSchema);
