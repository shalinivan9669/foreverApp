import mongoose, { Schema } from 'mongoose';
import { QUESTIONNAIRE_CONTENT_MODEL } from '@/models/Questionnaire';

export type PersonalQuestionnaireSubmissionAnswer = {
  questionId: string;
  ui: number;
  contentRevision: string;
};

export type PersonalQuestionnaireSubmissionType = {
  submissionId: string;
  userId: string;
  questionnaireId: string;
  questionnaireVersion: number;
  questionnaireContentModel: typeof QUESTIONNAIRE_CONTENT_MODEL;
  answers: PersonalQuestionnaireSubmissionAnswer[];
  contentHash: string;
  captureMode: 'PRIVATE';
  retentionClass: 'OWNER_CONTROLLED';
  semanticStatus: 'UNMAPPED';
  submittedAt: Date;
  createdAt: Date;
};

const answerSchema = new Schema<PersonalQuestionnaireSubmissionAnswer>(
  {
    questionId: { type: String, required: true },
    ui: { type: Number, required: true, min: 1 },
    contentRevision: { type: String, required: true },
  },
  { _id: false }
);

const personalQuestionnaireSubmissionSchema =
  new Schema<PersonalQuestionnaireSubmissionType>(
    {
      submissionId: { type: String, required: true, immutable: true },
      userId: { type: String, required: true, immutable: true },
      questionnaireId: { type: String, required: true, immutable: true },
      questionnaireVersion: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
      },
      questionnaireContentModel: {
        type: String,
        enum: [QUESTIONNAIRE_CONTENT_MODEL],
        required: true,
        immutable: true,
      },
      answers: { type: [answerSchema], required: true, immutable: true },
      contentHash: { type: String, required: true, immutable: true },
      captureMode: {
        type: String,
        enum: ['PRIVATE'],
        required: true,
        immutable: true,
      },
      retentionClass: {
        type: String,
        enum: ['OWNER_CONTROLLED'],
        required: true,
        immutable: true,
      },
      semanticStatus: {
        type: String,
        enum: ['UNMAPPED'],
        required: true,
        immutable: true,
      },
      submittedAt: { type: Date, required: true, immutable: true },
    },
    {
      collection: 'personal_questionnaire_submissions',
      versionKey: false,
      timestamps: { createdAt: true, updatedAt: false },
    }
  );

personalQuestionnaireSubmissionSchema.index(
  { submissionId: 1 },
  { unique: true, name: 'personal_questionnaire_submission_identity' }
);
personalQuestionnaireSubmissionSchema.index(
  { userId: 1, submittedAt: -1 },
  { name: 'personal_questionnaire_submission_owner_history' }
);
personalQuestionnaireSubmissionSchema.index(
  { userId: 1, questionnaireId: 1, questionnaireVersion: 1, contentHash: 1 },
  {
    unique: true,
    name: 'personal_questionnaire_submission_content_idempotency',
  }
);

export const PersonalQuestionnaireSubmission =
  (mongoose.models
    .PersonalQuestionnaireSubmission as mongoose.Model<PersonalQuestionnaireSubmissionType>) ||
  mongoose.model<PersonalQuestionnaireSubmissionType>(
    'PersonalQuestionnaireSubmission',
    personalQuestionnaireSubmissionSchema
  );
