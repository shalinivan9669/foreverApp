import mongoose, { Schema } from 'mongoose';
import type { AssessmentChoices, AssessmentRegistrationReceipt } from '@/domain/assessment/admission';

/** Membership is operator-provisioned; HTTP registration can only accept an existing invitation. */
export type AssessmentParticipantType = {
  _id: string; environment: 'ISOLATED_SYNTHETIC' | 'PRIVATE_BETA'; cohortId: string;
  deletionGeneration: number;
  membershipStatus?: 'INVITED' | 'ACTIVE' | 'REVOKED'; permissionEpoch?: number;
  settingsRevision?: number; settings?: AssessmentChoices; registration?: AssessmentRegistrationReceipt | null;
  invitedAt?: Date; inviteExpiresAt?: Date; revokedAt?: Date | null; targetId?: string;
  choiceHistory?: Array<{ revision: number; recordedAt: string; informationVersion: string; choices: AssessmentChoices }>;
};
const schema = new Schema<AssessmentParticipantType>({
  _id: { type: String, required: true },
  environment: { type: String, enum: ['ISOLATED_SYNTHETIC', 'PRIVATE_BETA'], required: true },
  cohortId: { type: String, required: true },
  deletionGeneration: { type: Number, required: true, default: 0 },
  membershipStatus: { type: String, enum: ['INVITED', 'ACTIVE', 'REVOKED'] },
  permissionEpoch: { type: Number, default: 0 }, settingsRevision: { type: Number, default: 0 },
  settings: { type: new Schema({ ownerAssessment: Boolean, discovery: Boolean, pairSharing: Boolean, publicationIds: [String] }, { _id: false }), default: undefined },
  registration: { type: new Schema({ termsVersion: String, informationVersion: String, acceptedAt: String, adultPolicy: String, operationKey: String, requestIntent: String, sessionVersion: String,
    choices: { ownerAssessment: Boolean, discovery: Boolean, pairSharing: Boolean, publicationIds: [String] } }, { _id: false }), default: null },
  invitedAt: Date, inviteExpiresAt: Date, revokedAt: Date, targetId: String,
  choiceHistory: { type: [new Schema({ revision: Number, recordedAt: String, informationVersion: String, choices: { ownerAssessment: Boolean, discovery: Boolean, pairSharing: Boolean, publicationIds: [String] } }, { _id: false })], default: [] },
}, { collection: 'assessment_participants', versionKey: false });
schema.index({ environment: 1, cohortId: 1, membershipStatus: 1, _id: 1 });
export const AssessmentParticipant = (mongoose.models.AssessmentParticipant as mongoose.Model<AssessmentParticipantType>) || mongoose.model<AssessmentParticipantType>('AssessmentParticipant', schema);
