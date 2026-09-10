import mongoose, { Schema } from 'mongoose';

export type AssessmentEffect = 'SUBMISSIONS' | 'DISCLOSURE' | 'MATCHING' | 'PAIR' | 'NOTIFICATIONS';
export type AssessmentRuntimeControlType = { _id: string; revision: number; stoppedEffects: AssessmentEffect[]; disabledPublicationIds?: string[]; recoveryReconciled: boolean; migrationVersion: string; updatedAt: Date };
const runtimeSchema = new Schema<AssessmentRuntimeControlType>({ _id: String, revision: { type: Number, default: 0 },
  stoppedEffects: [{ type: String, enum: ['SUBMISSIONS', 'DISCLOSURE', 'MATCHING', 'PAIR', 'NOTIFICATIONS'] }],
  disabledPublicationIds: { type: [String], default: [] },
  recoveryReconciled: { type: Boolean, default: false }, migrationVersion: { type: String, default: '' }, updatedAt: { type: Date, default: Date.now },
}, { collection: 'assessment_runtime_controls', versionKey: false });
export const AssessmentRuntimeControl = (mongoose.models.AssessmentRuntimeControl as mongoose.Model<AssessmentRuntimeControlType>) || mongoose.model<AssessmentRuntimeControlType>('AssessmentRuntimeControl', runtimeSchema);

export type AssessmentJobType = { _id: string; kind: 'PROJECTION'; semanticKey: string; ownerId: string; sourceSetRevision: number; deletionGeneration: number;
  state: 'PENDING' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'DEAD_LETTER'; notBefore: Date; leaseOwner: string | null; leaseExpiresAt: Date | null;
  fence: number; writeFence: number; attempts: number; lastErrorCode: string | null; createdAt: Date; updatedAt: Date; expiresAt: Date | null };
const jobSchema = new Schema<AssessmentJobType>({
  _id: String, kind: { type: String, enum: ['PROJECTION'], required: true }, semanticKey: { type: String, required: true }, ownerId: { type: String, required: true },
  sourceSetRevision: Number, deletionGeneration: Number,
  state: { type: String, enum: ['PENDING', 'RUNNING', 'DONE', 'CANCELLED', 'DEAD_LETTER'], default: 'PENDING' },
  notBefore: { type: Date, default: Date.now }, leaseOwner: { type: String, default: null }, leaseExpiresAt: { type: Date, default: null },
  fence: { type: Number, default: 0 }, writeFence: { type: Number, default: 0 }, attempts: { type: Number, default: 0 }, lastErrorCode: { type: String, default: null }, expiresAt: { type: Date, default: null },
}, { collection: 'assessment_jobs', versionKey: false, timestamps: true });
jobSchema.index({ kind: 1, semanticKey: 1 }, { unique: true });
jobSchema.index({ state: 1, notBefore: 1, leaseExpiresAt: 1, createdAt: 1 });
jobSchema.index({ ownerId: 1, state: 1 });
jobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AssessmentJob = (mongoose.models.AssessmentJob as mongoose.Model<AssessmentJobType>) || mongoose.model<AssessmentJobType>('AssessmentJob', jobSchema);

export type AssessmentSupportType = { _id: string; ownerId: string; requestHash: string; category: 'CLARITY' | 'INAPPROPRIATE' | 'BUG' | 'PRIVACY'; message: string;
  publicationId: string | null; attachment: { runId: string; revision: number; snapshotJson: string; consentAt: Date } | null;
  status: 'OPEN' | 'RESOLVED'; createdAt: Date; resolvedAt: Date | null; expiresAt: Date | null };
const supportSchema = new Schema<AssessmentSupportType>({ _id: String, ownerId: { type: String, required: true }, requestHash: String,
  category: { type: String, enum: ['CLARITY', 'INAPPROPRIATE', 'BUG', 'PRIVACY'] }, message: { type: String, maxlength: 2000 }, publicationId: { type: String, default: null },
  attachment: { type: new Schema({ runId: String, revision: Number, snapshotJson: String, consentAt: Date }, { _id: false }), default: null },
  status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' }, createdAt: { type: Date, default: Date.now }, resolvedAt: { type: Date, default: null }, expiresAt: { type: Date, default: null },
}, { collection: 'assessment_support', versionKey: false });
supportSchema.index({ ownerId: 1, createdAt: -1 }); supportSchema.index({ status: 1, createdAt: 1 }); supportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AssessmentSupport = (mongoose.models.AssessmentSupport as mongoose.Model<AssessmentSupportType>) || mongoose.model<AssessmentSupportType>('AssessmentSupport', supportSchema);

export type AssessmentOpsEventType = { _id: string; code: string; durationMs: number; category: 'WORKER' | 'ADMISSION' | 'PRIVACY' | 'ALERT' | 'OPERATOR'; createdAt: Date; expiresAt: Date };
const eventSchema = new Schema<AssessmentOpsEventType>({ _id: String, code: String, durationMs: Number, category: { type: String, enum: ['WORKER', 'ADMISSION', 'PRIVACY', 'ALERT', 'OPERATOR'] }, createdAt: { type: Date, default: Date.now }, expiresAt: Date }, { collection: 'assessment_ops_events', versionKey: false });
eventSchema.index({ createdAt: -1, category: 1 }); eventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AssessmentOpsEvent = (mongoose.models.AssessmentOpsEvent as mongoose.Model<AssessmentOpsEventType>) || mongoose.model<AssessmentOpsEventType>('AssessmentOpsEvent', eventSchema);
