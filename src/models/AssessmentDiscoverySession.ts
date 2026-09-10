import mongoose, { Schema } from 'mongoose';
export type AssessmentDiscoverySessionType = { _id: string; ownerId: string; directRevision: number; permissionRevision: number; modelVersion: string; limit: number; upstreamCursor: string; expiresAt: Date };
const schema = new Schema<AssessmentDiscoverySessionType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  directRevision: { type: Number, required: true }, permissionRevision: { type: Number, required: true }, modelVersion: { type: String, required: true }, limit: { type: Number, required: true },
  upstreamCursor: { type: String, required: true, select: false }, expiresAt: { type: Date, required: true },
}, { collection: 'assessment_discovery_sessions', versionKey: false });
schema.index({ ownerId: 1, expiresAt: 1 }, { name: 'assessment_discovery_owner' });
schema.index({ expiresAt: 1 }, { name: 'assessment_discovery_expiry', expireAfterSeconds: 0 });
export const AssessmentDiscoverySession = (mongoose.models.AssessmentDiscoverySession as mongoose.Model<AssessmentDiscoverySessionType>) || mongoose.model<AssessmentDiscoverySessionType>('AssessmentDiscoverySession', schema);
