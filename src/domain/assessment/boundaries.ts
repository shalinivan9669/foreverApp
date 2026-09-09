import { z } from 'zod';
import { ordinalReportTrend, type PairReport } from './engine/pair';

const identifier = z.string().min(1).max(240);
const revision = z.number().int().nonnegative().safe();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'INVALID_CALENDAR_DATE');

/** Half-open UTC date windows; the first release does not infer local calendars. */
export const assessmentWindowSchema = z.object({
  start: date,
  end: date,
  definitionVersion: identifier,
}).strict().refine((value) => value.start < value.end, 'INVALID_WINDOW');
export type AssessmentWindow = z.infer<typeof assessmentWindowSchema>;

const participantVersion = z.object({
  sourceRevision: revision,
  profileRevision: revision,
  permissionRevision: revision,
  directRevision: revision,
  directPermissionRevision: revision,
  directDeletionGeneration: revision,
  deletionGeneration: revision,
  accountGeneration: identifier,
}).strict();
const resource = z.object({
  id: identifier,
  owner: z.enum(['A', 'B', 'JOINT']),
  unit: z.literal('minute'),
  period: identifier,
  capacity: revision.nullable(),
  ordinaryUse: revision,
  scenarioUse: revision,
}).strict();

/** Internal server envelope. Never accept it as a client assertion or return it in a shared DTO. */
export const assessmentEnvelopeSchema = z.object({
  schemaVersion: z.literal('assessment-envelope-v1'),
  calculationKind: z.enum(['CURRENT', 'CONDITIONAL']),
  mode: z.enum(['MATCHING', 'PAIR']),
  purpose: z.enum(['MATCHING', 'PAIR_MODEL']),
  audience: z.enum(['OWNER', 'PAIR_MEMBERS']),
  viewerId: identifier,
  actorBindings: z.object({ A: identifier, B: identifier }).strict(),
  relationshipRef: identifier.nullable(),
  participants: z.object({ A: participantVersion, B: participantVersion }).strict(),
  context: identifier,
  contextRevision: revision,
  window: assessmentWindowSchema,
  publicationId: identifier,
  contentHash: identifier,
  rubricVersion: identifier,
  policyVersion: identifier,
  normalizerVersion: identifier,
  solverVersion: identifier,
  templateVersion: identifier,
  consumedInputHash: identifier,
  selectedPublishedActionIds: z.array(identifier).max(14),
  searchActionCatalogIds: z.array(identifier).max(14),
  resourceAssumptions: z.array(resource).max(32),
  searchLimits: z.object({
    maxWorlds: z.number().int().min(1).max(65536),
    maxChecks: z.number().int().min(1).max(2000000),
    maxActionSets: z.number().int().min(1).max(16384),
    maxActionsPerSet: z.number().int().min(1).max(14),
  }).strict(),
  completeness: z.enum(['COMPLETE_WITHIN_LIMITS', 'BUDGET_EXCEEDED']),
  access: z.enum(['AVAILABLE', 'UNAVAILABLE']),
}).strict().superRefine((value, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.actorBindings.A === value.actorBindings.B) invalid('DISTINCT_ACTORS_REQUIRED');
  if (![value.actorBindings.A, value.actorBindings.B].includes(value.viewerId)) invalid('VIEWER_NOT_PARTICIPANT');
  if ((value.mode === 'PAIR') !== (value.purpose === 'PAIR_MODEL')) invalid('PURPOSE_MODE_MISMATCH');
  if (value.mode === 'PAIR' && value.relationshipRef === null) invalid('PAIR_CONTEXT_REQUIRED');
  if (value.audience === 'PAIR_MEMBERS' && value.mode !== 'PAIR') invalid('PAIR_AUDIENCE_REQUIRED');
  if (value.calculationKind === 'CURRENT' && value.selectedPublishedActionIds.length !== 0) invalid('CURRENT_HAS_ACTIONS');
  if (value.calculationKind === 'CURRENT' && value.searchActionCatalogIds.length !== 0) invalid('CURRENT_HAS_ACTION_SEARCH');
  if (new Set(value.selectedPublishedActionIds).size !== value.selectedPublishedActionIds.length) invalid('DUPLICATE_ACTION');
  if (new Set(value.searchActionCatalogIds).size !== value.searchActionCatalogIds.length) invalid('DUPLICATE_SEARCH_ACTION');
  if (value.selectedPublishedActionIds.some((id) => !value.searchActionCatalogIds.includes(id))) invalid('ACTION_OUTSIDE_SEARCH_DOMAIN');
  if (new Set(value.resourceAssumptions.map((item) => item.id)).size !== value.resourceAssumptions.length) invalid('DUPLICATE_RESOURCE');
  if (value.calculationKind === 'CURRENT' && value.resourceAssumptions.some((item) => item.scenarioUse !== 0)) invalid('CURRENT_HAS_SCENARIO_RESOURCE');
});
export type AssessmentCalculationEnvelope = z.infer<typeof assessmentEnvelopeSchema>;

function normalizedEnvelope(value: AssessmentCalculationEnvelope) {
  return {
    ...value,
    selectedPublishedActionIds: [...value.selectedPublishedActionIds].sort(),
    searchActionCatalogIds: [...value.searchActionCatalogIds].sort(),
    resourceAssumptions: [...value.resourceAssumptions].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/** Both arguments are parsed again so stale/malformed persisted data fails closed. */
export function isAssessmentEnvelopeCurrent(saved: AssessmentCalculationEnvelope, current: AssessmentCalculationEnvelope): boolean {
  const prior = assessmentEnvelopeSchema.safeParse(saved);
  const latest = assessmentEnvelopeSchema.safeParse(current);
  return prior.success && latest.success
    && prior.data.access === 'AVAILABLE' && latest.data.access === 'AVAILABLE'
    && JSON.stringify(normalizedEnvelope(prior.data)) === JSON.stringify(normalizedEnvelope(latest.data));
}

export type TimedAssessmentPairReport = PairReport & {
  readonly authorId: string;
  readonly agreementRevision: number;
  readonly context: string;
  readonly window: AssessmentWindow;
};

/** Category change is descriptive, never evidence that a practice caused growth. */
export function compareTemporalPairReports(before: TimedAssessmentPairReport, after: TimedAssessmentPairReport): ReturnType<typeof ordinalReportTrend> {
  const first = assessmentWindowSchema.safeParse(before.window);
  const second = assessmentWindowSchema.safeParse(after.window);
  if (!first.success || !second.success || before.authorId !== after.authorId
    || before.context !== after.context || before.agreementRevision !== after.agreementRevision
    || first.data.definitionVersion !== second.data.definitionVersion
    || first.data.end > second.data.start) return 'INCOMPARABLE';
  const duration = (window: AssessmentWindow) => Date.parse(window.end) - Date.parse(window.start);
  if (duration(first.data) !== duration(second.data)) return 'INCOMPARABLE';
  return ordinalReportTrend(before, after);
}
