import mongoose, { Schema } from 'mongoose';
import type { AssessmentCalculationEnvelope } from '@/domain/assessment/boundaries';
import type { AssessmentCurrentComparisonDTO, AssessmentConditionalScenarioDTO } from '@/lib/dto/assessmentComparison.dto';

export type AssessmentComparisonType = {
  _id: string; ownerId: string; actorIds: string[]; pairId: string; revision: number;
  envelope: AssessmentCalculationEnvelope; current: AssessmentCurrentComparisonDTO;
  scenarios: Array<{ envelope: AssessmentCalculationEnvelope; dto: AssessmentConditionalScenarioDTO }>;
  createdAt: Date; updatedAt: Date;
};
// Only derived restricted DTOs and an internal validated envelope are persisted here, never peer answers.
const schema = new Schema<AssessmentComparisonType>({
  _id: { type: String, required: true }, ownerId: { type: String, required: true, immutable: true },
  actorIds: { type: [String], required: true }, pairId: { type: String, required: true }, revision: { type: Number, required: true },
  envelope: { type: Schema.Types.Mixed, required: true }, current: { type: Schema.Types.Mixed, required: true },
  scenarios: { type: Schema.Types.Mixed, default: [] },
}, { collection: 'assessment_comparisons', timestamps: true, versionKey: false });
schema.index({ actorIds: 1 }, { name: 'assessment_comparison_participant' });
export const AssessmentComparison = (mongoose.models.AssessmentComparison as mongoose.Model<AssessmentComparisonType>) || mongoose.model<AssessmentComparisonType>('AssessmentComparison', schema);
