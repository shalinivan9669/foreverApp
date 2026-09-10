import { z } from 'zod';
import { AssessmentAnswerInputSchema, type AssessmentAnswerRecord, type AssessmentExposureHistory, type AssessmentItem, type AssessmentPeriod } from '@/domain/assessment/contracts';
import type { AssessmentProfileSnapshot, AssessmentUnavailableSkill } from '@/domain/assessment/profile';

const revision = z.number().int().nonnegative();
const key = z.string().min(8).max(120);
const viewer = { viewerToken: z.string().regex(/^[a-f0-9]{64}$/), publicationId: z.string().min(1).max(120).optional() };
const operation = { expectedRevision: revision, idempotencyKey: key, ...viewer };
export const AssessmentMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), idempotencyKey: key, period: z.object({ id: z.string().min(1).max(120), startsAt: z.string().datetime(), endsAt: z.string().datetime() }).strict().optional(), goal: z.enum(['SELF', 'DATING', 'COUPLE']).optional(), ...viewer }).strict(),
  z.object({ action: z.literal('present'), itemId: z.string().min(1).max(120), ...operation }).strict(),
  AssessmentAnswerInputSchema.extend({ action: z.literal('answer'), ...viewer }).strict(),
  z.object({ action: z.literal('hint'), itemId: z.string().min(1).max(120), ...operation }).strict(),
  z.object({ action: z.literal('finalize'), ...operation }).strict(),
  z.object({ action: z.literal('revise'), ...operation }).strict(),
  z.object({ action: z.literal('followup'), period: z.object({ id: z.string().min(1).max(120), startsAt: z.string().datetime(), endsAt: z.string().datetime() }).strict(), ...operation }).strict(),
  z.object({ action: z.literal('permission'), pairUse: z.boolean(), ...operation }).strict(),
  z.object({ action: z.literal('matching-permission'), matchingUse: z.boolean(), ...operation }).strict(),
  z.object({ action: z.literal('delete'), ...operation }).strict(),
  z.object({ action: z.literal('retry'), ...viewer }).strict(),
]);
export type AssessmentMutation = z.infer<typeof AssessmentMutationSchema>;
export type AssessmentItemDTO = Omit<AssessmentItem, 'options' | 'fields' | 'slots' | 'rootSlot' | 'familyId' | 'exposureFor' | 'dependsOn'> & {
  options: { id: string; label: string }[];
  fields: { id: string; label: string; group: string }[];
  slots?: { id: string; label: string; options: { id: string; label: string }[] }[];
};
export type OwnerAssessmentProfileDTO = {
  version: 'assessment-profile-v1'; status: 'NOT_STARTED' | 'DRAFT' | 'READY' | 'PENDING';
  snapshot: AssessmentProfileSnapshot | null;
  unavailableSkills?: AssessmentUnavailableSkill[];
};
export type AssessmentRunDTO = {
  runId?: string;
  exposureHistory?: AssessmentExposureHistory;
  retainedCompletedSource?: 'CORRECTION' | 'FOLLOWUP';
  viewerToken: string;
  publication: { id: string; version: string; title: string; status: 'DRAFT'; policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED'; skillId?: string; contentHash?: string; explanation?: string; requiresPeriod?: boolean };
  status: 'NEW' | 'DRAFT' | 'FINALIZED' | 'DELETED'; revision: number;
  calculation: 'NOT_STARTED' | 'PENDING' | 'READY'; period: AssessmentPeriod | null;
  pairUse: boolean; matchingUse: boolean; permissionRevision: number;
  answers: (Pick<AssessmentAnswerRecord, 'itemId' | 'response' | 'revision' | 'phase' | 'recordedAt'> & { summary: string[] })[];
  items: { id: string; title: string; available: boolean; answered: boolean }[];
  presentation: { presentationId: string; item: AssessmentItemDTO; phase: 'BASELINE' | 'ASSISTED' | 'FOLLOWUP'; hint: string | null } | null;
  profile: OwnerAssessmentProfileDTO | null;
  knownEpisodes?: { rootId: string; label: string; observedAt: string; publicationTitle: string }[];
};
export function toAssessmentItemDTO(item: AssessmentItem): AssessmentItemDTO {
  return { id: item.id, title: item.title, instructions: item.instructions, method: item.method, track: item.track, kind: item.kind,
    ...(item.changedInstructions ? { changedInstructions: item.changedInstructions } : {}),
    ...(item.slots ? { slots: item.slots.map(slot => ({ id: slot.id, label: slot.label, options: slot.options.map(({ id, label }) => ({ id, label })) })) } : {}),
    options: item.options.map(({ id, label }) => ({ id, label })), fields: item.fields.map(({ id, label, group }) => ({ id, label, group })) };
}
