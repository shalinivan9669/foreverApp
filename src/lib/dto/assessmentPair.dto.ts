import { z } from 'zod';
import type { AssessmentWindow } from '@/domain/assessment/boundaries';
import { betaRecurrenceSchema, betaTimezoneSchema } from '@/domain/assessment/schedule';

export const betaAgreementSchema = z.object({
  templateId: z.enum(['DOM.S07', 'COM.S04']), title: z.string().trim().min(1).max(120),
  actions: z.array(z.object({
    role: z.enum(['A', 'B']), task: z.string().trim().min(1).max(300), criterion: z.string().trim().min(1).max(300), resourceMinutes: z.number().int().min(0).max(1440),
    noticeRole: z.enum(['A', 'B']), planningRole: z.enum(['A', 'B']), reminderRole: z.enum(['A', 'B']), verificationRole: z.enum(['A', 'B']),
  }).strict()).min(2).max(8).refine(actions => actions.some(action => action.role === 'A') && actions.some(action => action.role === 'B')),
  schedule: betaRecurrenceSchema,
  completionCriterion: z.string().trim().min(1).max(500), reschedulePolicy: z.literal('RECONFIRM_FUTURE'), endPolicy: z.literal('EITHER_CAN_STOP'),
}).strict();
export type BetaAgreement = z.infer<typeof betaAgreementSchema>;
export const betaReminderSettingsSchema = z.object({ enabled: z.boolean(), timezone: betaTimezoneSchema, quietStartHour: z.number().int().min(0).max(23), quietEndHour: z.number().int().min(0).max(23), leadMinutes: z.number().int().min(0).max(1440) }).strict();
export type BetaReminderSettings = z.infer<typeof betaReminderSettingsSchema>;

const revision = z.number().int().nonnegative();
const context = z.object({ pairId: z.string().regex(/^[a-f0-9]{24}$/), viewerToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const operation = { expectedRevision: revision, idempotencyKey: z.string().min(8).max(120), context };
const proposal = { scenarioId: z.string().min(1).max(120).nullable(), betaAgreement: betaAgreementSchema.optional() };
export const AssessmentPairMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), ...proposal, ...operation }).strict(),
  z.object({ action: z.literal('revise'), ...proposal, ...operation }).strict(),
  z.object({ action: z.literal('confirm'), expectedContentRevision: revision, ...operation }).strict(),
  z.object({ action: z.literal('revoke'), ...operation }).strict(),
  z.object({ action: z.literal('report'), periodId: z.string().min(1).max(120), category: z.enum(['NEEDS_CHANGE', 'ACCEPTABLE', 'GOOD']).nullable(), shared: z.boolean(), ...operation }).strict(),
  z.object({ action: z.literal('revoke-report'), periodId: z.string().min(1).max(120), ...operation }).strict(),
  z.object({ action: z.literal('observe'), ...operation }).strict(),
  z.object({ action: z.literal('reminders'), settings: betaReminderSettingsSchema, ...operation }).strict(),
  z.object({ action: z.literal('own-note'), note: z.string().max(1000), ...operation }).strict(),
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
    betaAgreement?: BetaAgreement;
  } | null;
  periods: { id: string; window: AssessmentWindow; label: string; contentRevision?: number }[];
  occurrences?: { id: string; contentRevision: number; startsAt: string; endsAt: string; timezone: string; state: 'PLANNED' | 'ELAPSED_UNKNOWN' | 'CANCELLED'; title: string }[];
  ownNote?: string;
  reminders?: BetaReminderSettings | null;
  reports: {
    periodId: string; own: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null;
    ownRecorded: boolean; ownShared: boolean; A: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null; B: 'NEEDS_CHANGE' | 'ACCEPTABLE' | 'GOOD' | null;
    status: 'SHARED_DATA_INCOMPLETE' | 'AT_LEAST_ONE_REQUESTS_CHANGE' | 'SAME_REPORTED_CATEGORY' | 'DIFFERENT_REPORTED_CATEGORIES' | 'INCOMPARABLE';
    ownTrend: 'IMPROVED_REPORTED_CATEGORY' | 'LOWER_REPORTED_CATEGORY' | 'SAME_REPORTED_CATEGORY' | 'UNKNOWN' | 'INCOMPARABLE';
  }[];
};
