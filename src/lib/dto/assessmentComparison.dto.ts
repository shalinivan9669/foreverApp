import { z } from 'zod';
import { assessmentDirectAnswersSchema, type AssessmentDirectAnswers } from '@/domain/assessment/comparison';
import type { AssessmentPeriod } from '@/domain/assessment/contracts';

const key = z.string().min(8).max(120);
const revision = z.number().int().nonnegative();
const intent = { intentToken: z.string().regex(/^[a-f0-9]{64}$/) };
export const AssessmentComparisonMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save-direct'), expectedRevision: revision, idempotencyKey: key, answers: assessmentDirectAnswersSchema, useForComparison: z.boolean(), ...intent }).strict(),
  z.object({ action: z.literal('calculate-current'), idempotencyKey: key, ...intent }).strict(),
  z.object({ action: z.literal('scenario'), expectedComparisonRevision: revision, idempotencyKey: key, actionIds: z.array(z.enum(['A_demonstrates_full_cycle', 'B_demonstrates_full_cycle', 'joint_schedule'])).min(1).max(3).refine((ids) => new Set(ids).size === ids.length), ...intent }).strict(),
  z.object({ action: z.literal('revoke'), expectedRevision: revision, idempotencyKey: key, ...intent }).strict(),
  z.object({ action: z.literal('pair-permission'), pairUse: z.boolean(), expectedRevision: revision, idempotencyKey: key, ...intent }).strict(),
  z.object({ action: z.literal('delete-direct'), expectedRevision: revision, idempotencyKey: key, ...intent }).strict(),
]);
export type AssessmentComparisonMutation = z.infer<typeof AssessmentComparisonMutationSchema>;
export type AssessmentComparisonStatus = 'TARGET_SUPPORTED' | 'FEASIBLE_WITH_DIFFERENCES' | 'NEEDS_CLARIFICATION' | 'NO_TARGET_PLAN_IN_CATALOG' | 'INCOMPLETE';
export type AssessmentDirectionalStatus = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNRESOLVED';
export type AssessmentCurrentComparisonDTO = {
  kind: 'CURRENT'; revision: number; status: AssessmentComparisonStatus;
  directions: { A_FROM_B: AssessmentDirectionalStatus; B_FROM_A: AssessmentDirectionalStatus };
  resourceStatus: AssessmentDirectionalStatus;
  barriers: Array<'HOUSEHOLD_ROLES' | 'PARENTHOOD' | 'RELATIONSHIP_FORMAT' | 'TIME'>;
  explanation: string; availableActions: Array<{ id: string; label: string; requiresChoice: boolean }>;
  limits: { maxWorlds: number; maxChecks: number; maxActionSets: number; maxActionsPerSet: number };
  completeness: 'COMPLETE_WITHIN_LIMITS' | 'BUDGET_EXCEEDED';
};
export type AssessmentConditionalScenarioDTO = {
  id: string; kind: 'HYPOTHETICAL'; baseRevision: number; status: AssessmentComparisonStatus;
  changesCurrentScore: false; actionIds: string[]; assumptions: string[];
  searchActionIds: string[];
  voluntaryState: 'MODEL_OPTION_NOT_CHOSEN' | 'DECLARED_OPEN_NOT_AGREED';
  ownResources: { unit: 'minute'; period: AssessmentPeriod; ordinaryUse: number; attemptUse: number; capacity: number | null };
  verification: string[]; explanation: string;
  limits: AssessmentCurrentComparisonDTO['limits']; completeness: AssessmentCurrentComparisonDTO['completeness'];
};
export type AssessmentComparisonDTO = {
  intentToken: string;
  direct: { revision: number; permissionRevision: number; answers: AssessmentDirectAnswers | null; useForComparison: boolean; pairUse: boolean; period: AssessmentPeriod | null };
  context: { pairId: string; period: AssessmentPeriod; myRole: 'A' | 'B' } | null;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  current: AssessmentCurrentComparisonDTO | null; scenarios: AssessmentConditionalScenarioDTO[];
};

const actionId = z.enum(['A_demonstrates_full_cycle', 'B_demonstrates_full_cycle', 'joint_schedule']);
const status = z.enum(['TARGET_SUPPORTED', 'FEASIBLE_WITH_DIFFERENCES', 'NEEDS_CLARIFICATION', 'NO_TARGET_PLAN_IN_CATALOG', 'INCOMPLETE']);
const directionalStatus = z.enum(['SUPPORTED', 'NOT_SUPPORTED', 'UNRESOLVED']);
const searchLimits = z.object({ maxWorlds: z.number().int().min(1).max(65536), maxChecks: z.number().int().min(1).max(2000000), maxActionSets: z.number().int().min(1).max(16384), maxActionsPerSet: z.number().int().min(1).max(14) }).strict();
const completeness = z.enum(['COMPLETE_WITHIN_LIMITS', 'BUDGET_EXCEEDED']);
const explanation = z.string().max(2000);
/** Persisted projections are revalidated before serving; extra private fields are never serialized. */
export const AssessmentCurrentComparisonSchema = z.object({
  kind: z.literal('CURRENT'), revision, status,
  directions: z.object({ A_FROM_B: directionalStatus, B_FROM_A: directionalStatus }).strict(),
  resourceStatus: directionalStatus,
  barriers: z.array(z.enum(['HOUSEHOLD_ROLES', 'PARENTHOOD', 'RELATIONSHIP_FORMAT', 'TIME'])).max(4),
  explanation, availableActions: z.array(z.object({ id: actionId, label: z.string().max(240), requiresChoice: z.boolean() }).strict()).max(3),
  limits: searchLimits, completeness,
}).strict();
export const AssessmentConditionalScenarioSchema = z.object({
  id: z.string().max(120), kind: z.literal('HYPOTHETICAL'), baseRevision: revision, status,
  changesCurrentScore: z.literal(false), actionIds: z.array(actionId).min(1).max(3), searchActionIds: z.array(actionId).min(1).max(3),
  assumptions: z.array(z.string().max(240)).max(3), voluntaryState: z.enum(['MODEL_OPTION_NOT_CHOSEN', 'DECLARED_OPEN_NOT_AGREED']),
  ownResources: z.object({ unit: z.literal('minute'), period: z.object({ id: z.string().max(240), startsAt: z.string().datetime(), endsAt: z.string().datetime() }).strict(), ordinaryUse: z.number().int().min(0).max(40320), attemptUse: z.number().int().min(0).max(120960), capacity: z.number().int().min(0).max(40320).nullable() }).strict(),
  verification: z.array(z.string().max(240)).max(3), explanation, limits: searchLimits, completeness,
}).strict();
