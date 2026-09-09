import { z } from 'zod';
import type { AssessmentWindow } from '@/domain/assessment/boundaries';

const revision = z.number().int().nonnegative();
const context = z.object({ pairId: z.string().regex(/^[a-f0-9]{24}$/), viewerToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const operation = { expectedRevision: revision, idempotencyKey: z.string().min(8).max(120), context };
const proposal = { scenarioId: z.string().min(1).max(120).nullable() };
export const AssessmentPairMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), ...proposal, ...operation }).strict(),
  z.object({ action: z.literal('revise'), ...proposal, ...operation }).strict(),
  z.object({ action: z.literal('confirm'), expectedContentRevision: revision, ...operation }).strict(),
  z.object({ action: z.literal('revoke'), ...operation }).strict(),
  z.object({ action: z.literal('report'), periodId: z.string().min(1).max(120), category: z.enum(['NEEDS_CHANGE', 'ACCEPTABLE', 'GOOD']).nullable(), shared: z.boolean(), ...operation }).strict(),
  z.object({ action: z.literal('revoke-report'), periodId: z.string().min(1).max(120), ...operation }).strict(),
  z.object({ action: z.literal('observe'), ...operation }).strict(),
]);
export type AssessmentPairMutation = z.infer<typeof AssessmentPairMutationSchema>;
export type AssessmentPairDTO = {
  context: z.infer<typeof context> | null;
  availability: 'AVAILABLE' | 'UNAVAILABLE'; revision: number; myRole: 'A' | 'B' | null;
  agreement: {
    contentRevision: number; title: string; content: string; assumptions: string[];
    status: 'NEEDS_TWO_CONFIRMATIONS' | 'ACTIVE' | 'REVOKED';
    confirmations: { A: boolean; B: boolean };
    currentSkillChanged: false;
  } | null;
  periods: { id: string; window: AssessmentWindow; label: string }[];
  reports: {
    periodId: string; own: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null;
    ownRecorded: boolean; ownShared: boolean; A: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null; B: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null;
    status: 'SHARED_DATA_INCOMPLETE' | 'AT_LEAST_ONE_REQUESTS_CHANGE' | 'SAME_REPORTED_CATEGORY' | 'DIFFERENT_REPORTED_CATEGORIES' | 'INCOMPARABLE';
    ownTrend: 'IMPROVED_REPORTED_CATEGORY' | 'LOWER_REPORTED_CATEGORY' | 'SAME_REPORTED_CATEGORY' | 'UNKNOWN' | 'INCOMPARABLE';
  }[];
};
