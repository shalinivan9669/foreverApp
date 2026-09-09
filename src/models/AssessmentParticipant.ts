import mongoose, { Schema } from 'mongoose';

/** Provisioned only by the owned local test harness, never through participant HTTP. */
export type AssessmentParticipantType = {
  _id: string; environment: 'ISOLATED_SYNTHETIC'; cohortId: string;
  deletionGeneration: number;
};
const schema = new Schema<AssessmentParticipantType>({
  _id: { type: String, required: true },
  environment: { type: String, enum: ['ISOLATED_SYNTHETIC'], required: true },
  cohortId: { type: String, required: true },
  deletionGeneration: { type: Number, required: true, default: 0 },
}, { collection: 'assessment_participants', versionKey: false });
export const AssessmentParticipant = (mongoose.models.AssessmentParticipant as mongoose.Model<AssessmentParticipantType>) || mongoose.model<AssessmentParticipantType>('AssessmentParticipant', schema);
