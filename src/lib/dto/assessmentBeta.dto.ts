import { z } from 'zod';
import { betaIntervalSchema, betaTimezoneSchema } from '@/domain/assessment/schedule';

export const betaTemplateSchema = z.enum(['DOM.S07', 'COM.S04']);
const minutes = z.number().int().min(0).max(80640);
const options = z.enum(['COOKING', 'SHOPPING', 'PAUSE_RETURN']);
const optionList = z.array(options).max(3).refine(values => new Set(values).size === values.length);
const channel = z.enum(['TEXT', 'VOICE', 'VIDEO', 'IN_PERSON']);
const pauseNotice = z.enum(['MESSAGE', 'VOICE', 'SIGNAL']);
export const betaDirectPlanSchema = z.object({
  templateId: betaTemplateSchema,
  period: betaIntervalSchema, timezone: betaTimezoneSchema,
  calendarComplete: z.boolean(), availableIntervals: z.array(betaIntervalSchema).max(32), alternativeIntervals: z.array(betaIntervalSchema).max(32),
  offer: options.nullable(), acceptableOffers: optionList.nullable(), idealOffer: options.nullable(), excludedOffers: optionList,
  conditionImportance: z.enum(['MUST', 'IMPORTANT', 'PREFERENCE']), requireAppliedCriterion: z.boolean(),
  willingness: z.boolean().nullable(), alternativeOffer: options.nullable(), willingAlternative: z.boolean().nullable(),
  resource: z.object({ unit: z.literal('minute'), lineageId: z.string().min(1).max(80), capacity: minutes.nullable(), basis: z.enum(['TOTAL', 'REMAINING_AFTER_ORDINARY']), ordinaryUse: minutes }).strict(),
  criterionAttemptMinutes: minutes.nullable(), scheduleAttemptMinutes: minutes.nullable(), organizationAttemptMinutes: minutes.nullable(),
  willingCriterion: z.boolean().nullable(), willingSchedule: z.boolean().nullable(),
  provenance: z.literal('USER_INPUT'), disclosureVersion: z.literal('beta-direct-predicate-v1'),
  offeredChannel: channel.nullable().optional(), alternativeChannel: channel.nullable().optional(), acceptableChannels: z.array(channel).max(4).refine(values => new Set(values).size === values.length).nullable().optional(),
  conversationPrivacy: z.object({ offered: z.enum(['PRIVATE', 'PUBLIC']).nullable(), required: z.enum(['PRIVATE', 'EITHER']).nullable() }).strict().nullable().optional(),
  pauseReturn: z.object({ notice: pauseNotice.nullable(), acceptableNotices: z.array(pauseNotice).max(3).refine(values => new Set(values).size === values.length).nullable(), returnMinutes: z.number().int().min(1).max(10080).nullable(), acceptableReturnMinutes: z.object({ min: z.number().int().min(1).max(10080), max: z.number().int().min(1).max(10080) }).strict().refine(range => range.min <= range.max).nullable(), allowRevision: z.boolean().nullable() }).strict().nullable().optional(),
  personalTime: z.object({ minMinutes: minutes, maxMinutes: minutes, basis: z.enum(['INCLUDED_IN_CAPACITY', 'ALREADY_RESERVED']) }).strict().refine(range => range.minMinutes <= range.maxMinutes).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.period.startsAt), end = Date.parse(value.period.endsAt);
  if (end - start > 56 * 86400000) ctx.addIssue({ code: 'custom', message: 'PLAN_HORIZON_EXCEEDS_56_DAYS', path: ['period'] });
  if ([...value.availableIntervals, ...value.alternativeIntervals].some(interval => Date.parse(interval.startsAt) < start || Date.parse(interval.endsAt) > end)) ctx.addIssue({ code: 'custom', message: 'INTERVAL_OUTSIDE_PLAN_PERIOD', path: ['availableIntervals'] });
  const choices = [value.offer, value.idealOffer, value.alternativeOffer, ...(value.acceptableOffers ?? []), ...value.excludedOffers].filter(choice => choice !== null);
  if (choices.some(choice => value.templateId === 'COM.S04' ? choice !== 'PAUSE_RETURN' : choice === 'PAUSE_RETURN')) ctx.addIssue({ code: 'custom', message: 'OPTION_OUTSIDE_TEMPLATE', path: ['offer'] });
  if (value.acceptableOffers?.some(choice => value.excludedOffers.includes(choice))) ctx.addIssue({ code: 'custom', message: 'EXCLUDED_AND_ACCEPTABLE', path: ['excludedOffers'] });
});
export type BetaDirectPlan = z.infer<typeof betaDirectPlanSchema>;
const operation = { expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(120), viewerToken: z.string().regex(/^[a-f0-9]{64}$/) };
export const BetaDirectMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), ...operation, plan: betaDirectPlanSchema, discoveryOptIn: z.boolean(), pairUse: z.boolean() }).strict(),
  z.object({ action: z.literal('revoke'), ...operation }).strict(),
  z.object({ action: z.literal('delete'), ...operation }).strict(),
]);
export type BetaDirectMutation = z.infer<typeof BetaDirectMutationSchema>;
export type BetaDirectDTO = { viewerToken: string; revision: number; plan: BetaDirectPlan | null; discoveryOptIn: boolean; pairUse: boolean };
export const betaActionSchema = z.enum(['A_CRITERION', 'B_CRITERION', 'A_ORGANIZE', 'B_ORGANIZE', 'JOINT_SCHEDULE']);
export const BetaComparisonMutationSchema = z.object({ candidateGrant: z.string().min(32).max(120).optional(), actionIds: z.array(betaActionSchema).max(5).refine(ids => new Set(ids).size === ids.length).default([]) }).strict();
export type BetaComparisonMutation = z.input<typeof BetaComparisonMutationSchema>;
export type BetaComparisonResultDTO = {
  kind: 'CURRENT' | 'HYPOTHETICAL'; status: 'TARGET_SUPPORTED' | 'FEASIBLE_WITH_DIFFERENCES' | 'NEEDS_CLARIFICATION' | 'NO_TARGET_PLAN_IN_CATALOG' | 'INCOMPLETE';
  directions: { A_FROM_B: 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNRESOLVED'; B_FROM_A: 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNRESOLVED' };
  resourceStatus: 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNRESOLVED';
  completeness: 'COMPLETE_WITHIN_LIMITS' | 'BUDGET_EXCEEDED';
  matchedKnown: number; considered: number; explanation: string;
};
export type BetaComparisonDTO = {
  availability: 'AVAILABLE' | 'UNAVAILABLE'; templateId: 'DOM.S07' | 'COM.S04' | null;
  current: BetaComparisonResultDTO | null;
  availableActions: { id: z.infer<typeof betaActionSchema>; label: string; requiresChoice: boolean; verification: string }[];
  scenarios: { actionIds: string[]; result: BetaComparisonResultDTO; assumptions: string[]; changesCurrent: false; voluntaryState: 'MODEL_OPTION_NOT_CHOSEN' | 'DECLARED_OPEN_NOT_AGREED'; ownAttemptMinutes: number }[];
};
export type BetaDiscoveryDTO = { cards: { candidateId: string; candidateGrant: string; displayName: string; lane: 'CURRENT_SUPPORTED' | 'CONDITIONAL_PATH' | 'CLARIFY' | 'VISIBLE_DIFFERENCE'; comparison: BetaComparisonResultDTO }[]; nextCursor: string | null; scope: 'AUTHORIZED_DIRECT_CONDITIONS'; exhausted: boolean };
