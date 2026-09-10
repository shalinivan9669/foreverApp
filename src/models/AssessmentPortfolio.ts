import mongoose, { Schema } from 'mongoose';
import type { AssessmentProfileSnapshot } from '@/domain/assessment/profile';
export interface AssessmentPortfolioType {
  _id: string; ownerId: string; sourceSetRevision: number; materializedRevision: number;
  deletionGeneration: number; sourceSetIdentity: string | null; snapshot: AssessmentProfileSnapshot | null;
  goal: 'SELF' | 'DATING' | 'COUPLE'; revision: number; declinedPublicationIds: string[];
  exposures: Array<{ skillId: string; publicationId: string; viewedAt: string; accessibilitySupport: 'NONE' | 'ASSISTIVE_TOOL' }>;
  history: Array<{ sourceSetRevision: number; sourceSetIdentity: string; computedAt: string; snapshot: AssessmentProfileSnapshot }>;
  updatedAt: Date; createdAt: Date;
}
const schema = new Schema<AssessmentPortfolioType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  sourceSetRevision: { type: Number, default: 0 }, materializedRevision: { type: Number, default: -1 }, deletionGeneration: { type: Number, required: true },
  sourceSetIdentity: { type: String, default: null }, snapshot: { type: Schema.Types.Mixed, default: null },
  goal: { type: String, enum: ['SELF', 'DATING', 'COUPLE'], default: 'SELF' }, revision: { type: Number, default: 0 },
  declinedPublicationIds: { type: [String], default: [] }, exposures: { type: Schema.Types.Mixed, default: [] }, history: { type: Schema.Types.Mixed, default: [] },
}, { collection: 'assessment_portfolios', versionKey: false, timestamps: true });
schema.index({ ownerId: 1 }, { unique: true, name: 'assessment_portfolio_owner' });
export const AssessmentPortfolio = (mongoose.models.AssessmentPortfolio as mongoose.Model<AssessmentPortfolioType>) || mongoose.model<AssessmentPortfolioType>('AssessmentPortfolio', schema);
