import assert from 'node:assert/strict';
import { betaDirectPlanSchema, BetaComparisonMutationSchema, type BetaDirectPlan } from '@/lib/dto/assessmentBeta.dto';
import { buildBetaComparisonProblem, betaAppliedPredicate, betaComparisonResult, BETA_COMPARISON_LIMITS } from '@/domain/assessment/betaComparison';
import { computeAssessmentProfile } from '@/domain/assessment/profile';
import { betaIntervalsOverlap, betaInQuietHours, expandBetaRecurrence, localTimeToInstant, type BetaRecurrence } from '@/domain/assessment/schedule';
import { evaluateModel, findConditionalPlans } from '@/domain/assessment/engine/matching';
import { comparePairReports } from '@/domain/assessment/engine/pair';
import { compareBetaOccurrenceReports } from '@/domain/assessment/betaPair';
import type { TimedAssessmentPairReport } from '@/domain/assessment/boundaries';

const plan: BetaDirectPlan = {
  templateId: 'DOM.S07', period: { startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-01-29T00:00:00.000Z' }, timezone: 'Asia/Qyzylorda', calendarComplete: true,
  availableIntervals: [{ startsAt: '2027-01-02T13:00:00.000Z', endsAt: '2027-01-02T14:00:00.000Z' }], alternativeIntervals: [{ startsAt: '2027-01-03T13:00:00.000Z', endsAt: '2027-01-03T14:00:00.000Z' }],
  offer: 'COOKING', acceptableOffers: ['COOKING', 'SHOPPING'], idealOffer: 'SHOPPING', excludedOffers: [], conditionImportance: 'MUST', requireAppliedCriterion: false,
  willingness: true, alternativeOffer: 'SHOPPING', willingAlternative: true,
  resource: { unit: 'minute', lineageId: 'my-planning-budget', capacity: 300, basis: 'TOTAL', ordinaryUse: 180 }, criterionAttemptMinutes: 90, scheduleAttemptMinutes: 15, organizationAttemptMinutes: 20,
  willingCriterion: true, willingSchedule: true, provenance: 'USER_INPUT', disclosureVersion: 'beta-direct-predicate-v1',
};
const make = (A: BetaDirectPlan = plan, B: BetaDirectPlan = plan, skillA: 'T' | 'F' | 'U' = 'T', skillB: 'T' | 'F' | 'U' = 'T') => buildBetaComparisonProblem({ identity: 'synthetic-beta-test', mode: 'PAIR', A, B, appliedA: skillA, appliedB: skillB, allowComputedCriteria: true });
const searchPlans = (problem: ReturnType<typeof make>) => { const searched = findConditionalPlans(problem, BETA_COMPARISON_LIMITS); assert.ok('plans' in searched); return searched; };
const result = (A = plan, B = plan) => { const problem = make(A, B); return betaComparisonResult(evaluateModel(problem, [], BETA_COMPARISON_LIMITS), problem); };
let count = 0;
function check(id: string, name: string, work: () => void) { work(); count++; process.stdout.write(`${JSON.stringify({ suite: 'beta-comparison', id, test: name, status: 'PASSED' })}\n`); }
check('BETA-041', 'strict direct author shape rejects actor and effects', () => {
  assert.equal(betaDirectPlanSchema.safeParse({ ...plan, actorId: 'peer' }).success, false);
  assert.equal(BetaComparisonMutationSchema.safeParse({ actionIds: [], effects: { ACriterion: 'T' } }).success, false);
  assert.equal(result(plan, { ...plan, offer: null }).directions.A_FROM_B, 'UNRESOLVED');
});
check('BETA-042', 'empty known offers differ from unknown offers', () => {
  assert.equal(result({ ...plan, acceptableOffers: [] }).directions.A_FROM_B, 'NOT_SUPPORTED');
  assert.equal(result({ ...plan, acceptableOffers: null }).directions.A_FROM_B, 'UNRESOLVED');
});
check('BETA-043', 'resource uses own entered finite values', () => {
  assert.equal(result().resourceStatus, 'SUPPORTED');
  assert.equal(result({ ...plan, resource: { ...plan.resource, capacity: 179 } }).resourceStatus, 'NOT_SUPPORTED');
  for (const capacity of [NaN, Infinity, -1]) assert.equal(betaDirectPlanSchema.safeParse({ ...plan, resource: { ...plan.resource, capacity } }).success, false);
  assert.equal(betaDirectPlanSchema.safeParse({ ...plan, resource: { ...plan.resource, unit: 'hour' } }).success, false);
});
check('BETA-044', 'unsupported numeric range is rejected instead of averaged', () => {
  assert.equal(betaDirectPlanSchema.safeParse({ ...plan, resource: { ...plan.resource, capacity: [2, 4] } }).success, false);
});
check('BETA-045', 'half-open intervals and DST reject ambiguity and nonexistent time', () => {
  assert.equal(betaIntervalsOverlap([{ startsAt: '2027-01-02T13:00:00Z', endsAt: '2027-01-02T14:00:00Z' }], [{ startsAt: '2027-01-02T14:00:00Z', endsAt: '2027-01-02T15:00:00Z' }]), false);
  assert.throws(() => localTimeToInstant('2027-03-28', '02:30', 'Europe/Paris'), /NONEXISTENT/);
  assert.throws(() => localTimeToInstant('2027-10-31', '02:30', 'Europe/Paris'), /AMBIGUOUS/);
  assert.equal(betaDirectPlanSchema.safeParse({ ...plan, timezone: 'Unknown/Nowhere' }).success, false);
  assert.equal(betaDirectPlanSchema.safeParse({ ...plan, availableIntervals: [{ startsAt: plan.period.endsAt, endsAt: plan.period.startsAt }] }).success, false);
  assert.equal(betaDirectPlanSchema.safeParse({ ...plan, availableIntervals: [{ startsAt: '2026-12-31T13:00:00Z', endsAt: '2026-12-31T14:00:00Z' }] }).success, false);
});
check('BETA-046', 'monthly resource cannot create an evening availability', () => {
  const dto = result({ ...plan, availableIntervals: [], calendarComplete: false });
  assert.equal(dto.resourceStatus, 'SUPPORTED'); assert.equal(dto.directions.A_FROM_B, 'UNRESOLVED');
});
check('BETA-047', 'residual budget is not charged ordinary work twice', () => {
  assert.equal(result({ ...plan, resource: { ...plan.resource, capacity: 30, basis: 'REMAINING_AFTER_ORDINARY' } }).resourceStatus, 'SUPPORTED');
});
check('BETA-048', 'bounded recurring identity survives repeated expansion', () => {
  const recurrence: BetaRecurrence = { timezone: 'Asia/Qyzylorda', startsOn: '2027-01-01', endsBefore: '2027-01-15', weekdays: [1, 4], localTime: '19:00', durationMinutes: 30, ambiguousTimePolicy: 'REJECT', nonexistentTimePolicy: 'REJECT' };
  const occurrences = expandBetaRecurrence(recurrence); assert.equal(occurrences.length, 4); assert.deepEqual(expandBetaRecurrence(recurrence), occurrences);
  assert.equal(new Set(occurrences.map(value => value.key)).size, occurrences.length);
  assert.throws(() => expandBetaRecurrence({ ...recurrence, endsBefore: '2027-04-01' }));
});
check('BETA-050', 'two individually satisfied directions survive shared resource failure', () => {
  const dto = result({ ...plan, resource: { ...plan.resource, capacity: 1 } });
  assert.deepEqual(dto.directions, { A_FROM_B: 'SUPPORTED', B_FROM_A: 'SUPPORTED' }); assert.equal(dto.resourceStatus, 'NOT_SUPPORTED');
  assert.deepEqual(result({ ...plan, acceptableOffers: [] }).directions, { A_FROM_B: 'NOT_SUPPORTED', B_FROM_A: 'SUPPORTED' });
});
check('BETA-051', 'achieved criterion preserves offer and actual snapshot', () => {
  const problem = make({ ...plan, requireAppliedCriterion: true }, plan, 'T', 'F'), before = JSON.stringify(problem.snapshot);
  const search = searchPlans(problem);
  assert.notEqual(search.kind, 'UNAVAILABLE'); assert.ok(search.plans.some(value => value.actionIds.includes('B_CRITERION')));
  assert.equal(JSON.stringify(problem.snapshot), before); assert.equal(problem.changes.find(action => action.id === 'B_CRITERION')?.effects.BOfferFits, undefined);
});
check('BETA-052', 'unknown skill asks for clarification without remedial criterion action', () => {
  const problem = make({ ...plan, requireAppliedCriterion: true }, plan, 'T', 'U');
  assert.equal(betaComparisonResult(evaluateModel(problem, [], BETA_COMPARISON_LIMITS), problem).status, 'NEEDS_CLARIFICATION');
  assert.equal(problem.changes.some(action => action.id === 'B_CRITERION'), false);
});
check('BETA-053', 'criterion and schedule must be jointly feasible', () => {
  const problem = make({ ...plan, requireAppliedCriterion: true, availableIntervals: [] }, plan, 'T', 'F');
  const search = searchPlans(problem);
  assert.ok(search.plans.some(value => value.actionIds.includes('B_CRITERION') && value.actionIds.includes('JOINT_SCHEDULE')));
  assert.ok(search.plans.every(value => value.actionIds.length >= 2));
});
check('BETA-054', 'combined skill and schedule costs can defeat all plans', () => {
  const problem = make({ ...plan, requireAppliedCriterion: true, availableIntervals: [] }, { ...plan, resource: { ...plan.resource, capacity: 280 } }, 'T', 'F');
  assert.equal(searchPlans(problem).plans.length, 0);
});
check('BETA-056', 'unpublished action and peer resource overrides are rejected', () => {
  for (const input of [{ actionIds: ['OTHER'] }, { actionIds: ['A_CRITERION'], participantBBudget: 99999 }, { actionIds: [], safety: false }]) assert.equal(BetaComparisonMutationSchema.safeParse(input).success, false);
});
check('BETA-057', 'declined action excluded while unknown willingness remains unchosen', () => {
  const declined = make({ ...plan, requireAppliedCriterion: true }, { ...plan, willingCriterion: false }, 'T', 'F');
  assert.equal(searchPlans({ ...declined, changes: declined.changes.filter(action => action.owners.every(owner => action.willingness[owner] !== 'F')) }).plans.length, 0);
  const undecided = make({ ...plan, requireAppliedCriterion: true }, { ...plan, willingCriterion: null }, 'T', 'F');
  assert.equal(undecided.changes.find(action => action.id === 'B_CRITERION')?.willingness.B, 'U');
});
check('BETA-058', 'bounded search reports exhausted computation budget', () => {
  const problem = make({ ...plan, requireAppliedCriterion: true }, plan, 'T', 'U');
  assert.equal(evaluateModel(problem, [], { ...BETA_COMPARISON_LIMITS, maxChecks: 1 }).kind, 'BUDGET_EXCEEDED');
});
check('BETA-068', 'feed direct-only output does not depend on hidden skill values', () => {
  const compare = (level: 'T' | 'F' | 'U') => {
    const problem = buildBetaComparisonProblem({ identity: 'same', mode: 'MATCHING', A: { ...plan, requireAppliedCriterion: true }, B: plan, appliedA: level, appliedB: level, allowComputedCriteria: false });
    return { current: betaComparisonResult(evaluateModel(problem, [], BETA_COMPARISON_LIMITS), problem), actions: problem.changes, plans: searchPlans(problem).plans };
  };
  assert.deepEqual(compare('T'), compare('F')); assert.deepEqual(compare('F'), compare('U'));
});
check('BETA-077', 'hidden partner report values cannot change shared summary', () => {
  const common = { pairId: 'pair', period: 'week', metricId: 'metric', scaleVersion: 'v1' };
  const own = { ...common, actor: 'A' as const, value: 'GOOD' as const, shared: true };
  assert.deepEqual(comparePairReports(own, { ...common, actor: 'B', value: 'GOOD', shared: false }, 'pair'), comparePairReports(own, { ...common, actor: 'B', value: 'NEEDS_CHANGE', shared: false }, 'pair'));
});
check('BETA-079', 'quiet hours respect participant timezone including midnight', () => {
  assert.equal(betaInQuietHours(new Date('2027-01-01T18:00:00Z'), 'Asia/Qyzylorda', 22, 8), true);
  assert.equal(betaInQuietHours(new Date('2027-01-01T10:00:00Z'), 'Asia/Qyzylorda', 22, 8), false);
});
check('BETA-049', 'possible levels reject empty and preserve unknown instead of vacuous support', () => {
  const snapshot = computeAssessmentProfile({ subjectId: 'synthetic', sourceId: 'source', revision: 1, generation: 0, period: { id: 'window', startsAt: '2027-01-01T00:00:00Z', endsAt: '2027-01-29T00:00:00Z' }, answers: [] });
  const skill = snapshot.skills.find(value => value.skillId === 'DOM.S07')!;
  skill.A.status = 'SUPPORTED'; skill.A.observationCount = 1;
  skill.A.possibleLevels = [2, 3]; assert.equal(betaAppliedPredicate(snapshot, 'DOM.S07'), 'T');
  skill.A.possibleLevels = [0, 1, 2, 3]; assert.equal(betaAppliedPredicate(snapshot, 'DOM.S07'), 'U');
  skill.A.possibleLevels = []; assert.equal(betaAppliedPredicate(snapshot, 'DOM.S07'), 'U');
});
check('BETA-051', 'COM pause template never requires COM request as global criterion', () => {
  const communication: BetaDirectPlan = { ...plan, templateId: 'COM.S04', offer: 'PAUSE_RETURN', acceptableOffers: ['PAUSE_RETURN'], idealOffer: 'PAUSE_RETURN', alternativeOffer: null,
    offeredChannel: 'TEXT', acceptableChannels: ['TEXT'], conversationPrivacy: { offered: 'PRIVATE', required: 'PRIVATE' },
    pauseReturn: { notice: 'MESSAGE', acceptableNotices: ['MESSAGE'], returnMinutes: 60, acceptableReturnMinutes: { min: 30, max: 120 }, allowRevision: true } };
  const problem = make(communication, communication, 'U', 'U');
  assert.equal(betaComparisonResult(evaluateModel(problem, [], BETA_COMPARISON_LIMITS), problem).status, 'TARGET_SUPPORTED');
  assert.equal(JSON.stringify(problem).includes('COM.S02'), false);
  assert.equal(result({ ...communication, offeredChannel: 'VOICE' }, communication).directions.B_FROM_A, 'NOT_SUPPORTED');
  assert.equal(result({ ...communication, pauseReturn: null }, communication).directions.B_FROM_A, 'UNRESOLVED');
});
check('BETA-078', 'occurrence trend requires same author context version metric and comparable instants', () => {
  const before: TimedAssessmentPairReport = { actor: 'A', authorId: 'author', pairId: 'pair', period: 'first', metricId: 'COM.S04:agreement-acceptability-v1', scaleVersion: 'v1', value: 'ACCEPTABLE', shared: false, agreementRevision: 1, context: 'pair:pair:COM.S04', window: { start: '2027-01-01T12:00:00Z', end: '2027-01-01T12:30:00Z', definitionVersion: 'beta-agreement-occurrence-v1' } };
  const after: TimedAssessmentPairReport = { ...before, period: 'second', value: 'GOOD', window: { ...before.window, start: '2027-01-02T12:00:00Z', end: '2027-01-02T12:30:00Z' } };
  assert.equal(compareBetaOccurrenceReports(before, after), 'IMPROVED_REPORTED_CATEGORY');
  for (const changed of [{ ...after, authorId: 'peer' }, { ...after, context: 'different' }, { ...after, agreementRevision: 2 }, { ...after, metricId: 'other' }, { ...after, window: before.window }, { ...after, window: { ...after.window, end: '2027-01-02T13:00:00Z' } }]) assert.equal(compareBetaOccurrenceReports(before, changed), 'INCOMPARABLE');
  assert.equal(compareBetaOccurrenceReports(before, { ...after, value: null }), 'UNKNOWN');
});
process.stdout.write(`${JSON.stringify({ suite: 'beta-comparison', status: 'PASSED', tests: count })}\n`);
