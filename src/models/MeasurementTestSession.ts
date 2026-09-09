import mongoose, { Schema } from 'mongoose';

export type MeasurementAnswer = { questionId: string; choice: number | null };
export type MeasurementTestSessionType = {
  _id: string; ownerId: string; testKey: string; contentRevision: number; registryVersion: number;
  status: 'DRAFT' | 'FINALIZED'; revision: number; answers: MeasurementAnswer[];
  pairUse: boolean; permissionRevision: number; materializedRevision: number;
  finalizedAt?: Date; createdAt: Date; updatedAt: Date;
};
const schema = new Schema<MeasurementTestSessionType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  testKey: { type: String, required: true, immutable: true }, contentRevision: { type: Number, required: true, immutable: true }, registryVersion: { type: Number, required: true, immutable: true },
  status: { type: String, enum: ['DRAFT', 'FINALIZED'], default: 'DRAFT' }, revision: { type: Number, default: 0 },
  answers: { type: [new Schema<MeasurementAnswer>({ questionId: { type: String, required: true }, choice: { type: Number, default: null, min: 1, max: 3 } }, { _id: false })], default: [] },
  pairUse: { type: Boolean, default: false }, permissionRevision: { type: Number, default: 0 }, materializedRevision: { type: Number, default: -1 }, finalizedAt: Date,
}, { collection: 'measurement_test_sessions', timestamps: true, versionKey: false });
// The canonical _id is hash(ownerId, stable testKey); built-in uniqueness also
// protects deployments with autoIndex:false. Publication/week/runId are excluded.
schema.index({ ownerId: 1, testKey: 1 }, { name: 'measurement_owner_tests' });
export const MeasurementTestSession = (mongoose.models.MeasurementTestSession as mongoose.Model<MeasurementTestSessionType>) || mongoose.model<MeasurementTestSessionType>('MeasurementTestSession', schema);
