import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTemporalPairReports, isAssessmentEnvelopeCurrent } from '../../src/domain/assessment/boundaries.ts';
import { assessmentAppliedSkillAtLeast, assessmentDirectAnswersSchema, buildAssessmentComparisonProblem } from '../../src/domain/assessment/comparison.ts';
import { evaluateModel, findConditionalPlans } from '../../src/domain/assessment/engine/matching.ts';

const window = { start: '2026-09-01', end: '2026-09-08', definitionVersion: 'utc-week-v1' };
function envelope() {
  const version = { sourceRevision: 5, profileRevision: 5, permissionRevision: 5, directRevision: 1, directPermissionRevision: 1, directDeletionGeneration: 0, deletionGeneration: 0, accountGeneration: 'synthetic-generation' };
  return {
    schemaVersion: 'assessment-envelope-v1', calculationKind: 'CONDITIONAL', mode: 'MATCHING', purpose: 'MATCHING',
    audience: 'OWNER', viewerId: 'synthetic-A', actorBindings: { A: 'synthetic-A', B: 'synthetic-B' }, relationshipRef: null,
    participants: { A: { ...version }, B: { ...version } }, context: 'household-practice', contextRevision: 1, window,
    publicationId: 'test-publication', contentHash: 'test-content', rubricVersion: '0.2.0-demo', policyVersion: 'author-policy',
    normalizerVersion: 'test-normalizer', solverVersion: '0.3', templateVersion: 'test-template', consumedInputHash: 'test-input',
    selectedPublishedActionIds: ['B_demonstrates_full_cycle'],
    searchActionCatalogIds: ['B_demonstrates_full_cycle'],
    resourceAssumptions: [{ id: 'B_minutes', owner: 'B', unit: 'minute', period: '2026-09-01/2026-09-08', capacity: 300, ordinaryUse: 180, scenarioUse: 90 }],
    searchLimits: { maxWorlds: 1024, maxChecks: 200000, maxActionSets: 512, maxActionsPerSet: 3 },
    completeness: 'COMPLETE_WITHIN_LIMITS', access: 'AVAILABLE',
  };
}

test('INT-046 unchanged complete envelope remains current', () => assert.equal(isAssessmentEnvelopeCurrent(envelope(), structuredClone(envelope())), true));
const invalidations = {
  'BP01 matching-to-pair purpose switch': (value) => { value.mode = 'PAIR'; value.purpose = 'PAIR_MODEL'; value.relationshipRef = 'new-pair'; },
  'audience change': (value) => { value.audience = 'PAIR_MEMBERS'; },
  'viewer change': (value) => { value.viewerId = 'synthetic-B'; },
  'actor swapping': (value) => { value.actorBindings = { A: 'synthetic-B', B: 'synthetic-A' }; },
  'participant A source': (value) => { value.participants.A.sourceRevision++; },
  'participant B source': (value) => { value.participants.B.sourceRevision++; },
  'same revision sum with changed participants': (value) => { value.participants.A.sourceRevision++; value.participants.B.sourceRevision--; },
  'participant A permission': (value) => { value.participants.A.permissionRevision++; },
  'participant B permission': (value) => { value.participants.B.permissionRevision++; },
  'participant A deletion': (value) => { value.participants.A.deletionGeneration++; },
  'participant B deletion': (value) => { value.participants.B.deletionGeneration++; },
  'account generation': (value) => { value.participants.B.accountGeneration = 'recreated-account'; },
  'profile revision': (value) => { value.participants.B.profileRevision++; },
  'direct answer revision': (value) => { value.participants.B.directRevision++; },
  'direct permission revision': (value) => { value.participants.B.directPermissionRevision++; },
  'direct deletion generation': (value) => { value.participants.B.directDeletionGeneration++; },
  'relationship context': (value) => { value.relationshipRef = 'other-connection'; },
  'source context': (value) => { value.context = 'other-context'; },
  'context revision': (value) => { value.contextRevision++; },
  'period': (value) => { value.window = { ...window, end: '2026-09-09' }; },
  'publication': (value) => { value.publicationId = 'different-publication'; },
  'content': (value) => { value.contentHash = 'changed'; },
  'policy': (value) => { value.policyVersion = 'changed'; },
  'normalizer': (value) => { value.normalizerVersion = 'changed'; },
  'solver': (value) => { value.solverVersion = 'changed'; },
  'template': (value) => { value.templateVersion = 'changed'; },
  'consumed input': (value) => { value.consumedInputHash = 'changed'; },
  'action': (value) => { value.selectedPublishedActionIds = []; },
  'resource capacity': (value) => { value.resourceAssumptions[0].capacity = 240; },
  'search domain': (value) => { value.searchLimits.maxActionsPerSet = 4; },
  'incomplete search': (value) => { value.completeness = 'BUDGET_EXCEEDED'; },
  'revoked access': (value) => { value.access = 'UNAVAILABLE'; },
  'unrecognized persisted field': (value) => { value.trusted = true; },
};
for (const [name, mutate] of Object.entries(invalidations)) {
  test(`INT-046 rejects ${name}`, () => {
    const initial = envelope(); const current = structuredClone(initial); mutate(current);
    assert.equal(isAssessmentEnvelopeCurrent(initial, current), false);
  });
}
test('INT-046 CURRENT envelope cannot acquire scenario effects', () => {
  const invalid = envelope(); invalid.calculationKind = 'CURRENT';
  assert.equal(isAssessmentEnvelopeCurrent(invalid, invalid), false);
});

function report(overrides = {}) {
  return { actor: 'A', authorId: 'synthetic-A', pairId: 'synthetic-pair', period: 'first', metricId: 'household-satisfaction',
    scaleVersion: 'category-v1', value: 'NEEDS_CHANGE', shared: true, agreementRevision: 1, context: 'household-practice', window, ...overrides };
}
const later = () => report({ value: 'GOOD', period: 'second', window: { ...window, start: '2026-09-08', end: '2026-09-15' } });
test('INT-058 proper ordered windows compare reported categories', () => assert.equal(compareTemporalPairReports(report(), later()), 'IMPROVED_REPORTED_CATEGORY'));
test('INT-058 BP02 reversed dates cannot invent improvement', () => assert.equal(compareTemporalPairReports(later(), report({ value: 'GOOD' })), 'INCOMPARABLE'));
test('INT-058 same-window correction is not a trend', () => assert.equal(compareTemporalPairReports(report(), report({ value: 'GOOD' })), 'INCOMPARABLE'));
test('INT-058 overlap is incomparable', () => assert.equal(compareTemporalPairReports(report(), report({ value: 'GOOD', window: { ...window, start: '2026-09-07', end: '2026-09-14' } })), 'INCOMPARABLE'));
test('INT-058 unequal reporting durations are incomparable', () => assert.equal(compareTemporalPairReports(report(), report({ value: 'GOOD', window: { ...window, start: '2026-09-08', end: '2026-09-16' } })), 'INCOMPARABLE'));
for (const field of ['authorId', 'actor', 'pairId', 'metricId', 'scaleVersion', 'context', 'agreementRevision']) {
  test(`INT-058 changed ${field} is incomparable`, () => {
    const next = later(); next[field] = field === 'agreementRevision' ? 2 : 'other';
    assert.equal(compareTemporalPairReports(report(), next), 'INCOMPARABLE');
  });
}
test('INT-058 invalid calendar date is incomparable', () => assert.equal(compareTemporalPairReports(report({ window: { ...window, start: '2026-02-30' } }), later()), 'INCOMPARABLE'));
test('INT-058 missing value stays unknown', () => assert.equal(compareTemporalPairReports(report({ value: null }), later()), 'UNKNOWN'));

const comparisonWindow = { start: '2026-09-01', end: '2026-09-29', definitionVersion: 'household-responsibility-28d-v1' };
function direct(overrides = {}) {
  return { parenthood: 'WANT_CHILDREN', relationshipFormat: 'EXCLUSIVE', offersShopping: true, offersCooking: true,
    acceptableMeetingSlots: ['WEEKDAY_EVENING'], proposedMeetingSlots: ['WEEKEND_MORNING'], capacityMinutes: 300,
    ordinaryTaskMinutes: 180, practiceBudgetMinutes: 90, scheduleBudgetMinutes: 15, willingPractice: true, willingSchedule: true, ...overrides };
}
function skill(levels = [2], overrides = {}) {
  return { skillId: 'DOM.S07', rubricVersion: '0.2.0-demo', track: 'SELF_REPORT', phase: 'BASELINE', context: 'household-practice', window: comparisonWindow,
    possibleLevels: levels, status: levels.length === 1 ? 'RUBRIC_LEVEL' : 'PARTIAL_LEVEL', ...overrides };
}
function input() {
  return { snapshotId: 'synthetic-input', snapshotRevision: 1, permissionRevision: 1, mode: 'MATCHING', context: 'household-practice', window: comparisonWindow, access: 'AVAILABLE',
    A: { ownerId: 'synthetic-A', direct: direct(), protection: 'ALLOW', skills: [skill()] }, B: { ownerId: 'synthetic-B', direct: direct(), protection: 'ALLOW', skills: [skill([1])] } };
}
test('INT-014 own direct schema rejects actor, effects and computed scores', () => {
  for (const field of ['ownerId', 'actor', 'effects', 'score', 'BfullCycle', 'permissionRevision']) assert.equal(assessmentDirectAnswersSchema.safeParse({ ...direct(), [field]: 'forged' }).success, false);
});
test('INT-009 {2,3} supports threshold while {1,2} remains unknown', () => {
  assert.equal(assessmentAppliedSkillAtLeast([skill([2, 3])], 'household-practice', comparisonWindow), 'T');
  assert.equal(assessmentAppliedSkillAtLeast([skill([1, 2])], 'household-practice', comparisonWindow), 'U');
});
test('INT-034 TASK L3 and assisted evidence cannot assert applied capacity', () => {
  assert.equal(assessmentAppliedSkillAtLeast([skill([3], { track: 'TASK' })], 'household-practice', comparisonWindow), 'U');
  assert.equal(assessmentAppliedSkillAtLeast([skill([3], { phase: 'ASSISTED' })], 'household-practice', comparisonWindow), 'U');
});
test('INT-034 other context, period or rubric cannot assert applied capacity', () => {
  for (const overrides of [{ context: 'other' }, { window: { ...comparisonWindow, definitionVersion: 'other' } }, { rubricVersion: 'other' }]) assert.equal(assessmentAppliedSkillAtLeast([skill([3], overrides)], 'household-practice', comparisonWindow), 'U');
});
test('INT-009 inconsistent levels never become optimistic support', () => assert.equal(assessmentAppliedSkillAtLeast([skill([3]), skill([1])], 'household-practice', comparisonWindow), 'U'));
test('INT-033 profile snapshot determines applied fact', () => {
  const value = input(); assert.equal(buildAssessmentComparisonProblem(value).snapshot.values.BfullCycle, 'F');
  value.B.skills = [skill([2, 3])]; assert.equal(buildAssessmentComparisonProblem(value).snapshot.values.BfullCycle, 'T');
});
test('INT-035 high skill without an offer does not cover a role', () => {
  const value = input(); value.B.skills = [skill([3])]; value.B.direct.offersShopping = false;
  const result = evaluateModel(buildAssessmentComparisonProblem(value));
  assert.equal(result.kind, 'RESULT'); assert.equal(result.value.plans[0].requirementStatus.A_need_shopping_cycle, 'F');
});
test('INT-036 unknown skill asks clarification without prescribed development', () => {
  const value = input(); value.B.skills = []; const problem = buildAssessmentComparisonProblem(value);
  assert.equal(problem.snapshot.values.BfullCycle, 'U'); assert.equal(problem.changes.some((action) => action.id === 'B_demonstrates_full_cycle'), false);
  assert.equal(evaluateModel(problem).value.status, 'NEEDS_CLARIFICATION');
});
test('INT-037 scenario repairs one stated barrier without changing current', () => {
  const problem = buildAssessmentComparisonProblem(input()); const initial = JSON.stringify(problem.snapshot);
  const result = findConditionalPlans(problem);
  assert.equal(result.kind, 'SEARCH'); assert.ok(result.plans.some((plan) => plan.actionIds.includes('B_demonstrates_full_cycle')));
  assert.equal(JSON.stringify(problem.snapshot), initial); assert.equal(evaluateModel(problem).value.status, 'NO_TARGET_PLAN_IN_CATALOG');
});
test('INT-038 two barriers require one combined feasible plan', () => {
  const value = input(); value.B.direct.acceptableMeetingSlots = ['WEEKEND_EVENING'];
  const result = findConditionalPlans(buildAssessmentComparisonProblem(value));
  assert.equal(result.kind, 'SEARCH'); assert.ok(result.plans.some((plan) => plan.actionIds.length === 2));
  assert.ok(result.plans.every((plan) => plan.actionIds.length === 2));
});
test('INT-039 opposed necessary parenthood positions are not trainable', () => {
  const value = input(); value.B.direct.parenthood = 'DO_NOT_WANT_CHILDREN';
  const result = findConditionalPlans(buildAssessmentComparisonProblem(value));
  assert.equal(result.kind, 'SEARCH'); assert.equal(result.plans.length, 0);
});
test('INT-040 ordinary task and attempt share the same resource budget', () => {
  const value = input(); value.B.direct.capacityMinutes = 240;
  assert.equal(findConditionalPlans(buildAssessmentComparisonProblem(value)).plans.length, 0);
  value.B.direct.capacityMinutes = 300;
  assert.ok(findConditionalPlans(buildAssessmentComparisonProblem(value)).plans.length > 0);
});
test('INT-042 refusal excludes a scenario and unknown willingness is unchosen', () => {
  const value = input(); value.B.direct.willingPractice = false;
  assert.equal(findConditionalPlans(buildAssessmentComparisonProblem(value)).plans.length, 0);
  value.B.direct.willingPractice = null;
  assert.equal(findConditionalPlans(buildAssessmentComparisonProblem(value)).plans[0].phase, 'MODEL_OPTION_NOT_CHOSEN');
});
test('INT-005 missing acceptable set differs from explicitly empty set', () => {
  const value = input(); value.B.direct.acceptableMeetingSlots = null;
  assert.equal(buildAssessmentComparisonProblem(value).snapshot.values.timeFits, 'U');
  value.B.direct.acceptableMeetingSlots = [];
  assert.equal(buildAssessmentComparisonProblem(value).snapshot.values.timeFits, 'F');
});
test('INT-062 access gate always wins over positive skill and conditional effects', () => {
  const value = input(); value.access = 'UNAVAILABLE';
  assert.equal(evaluateModel(buildAssessmentComparisonProblem(value)).kind, 'UNAVAILABLE');
  assert.equal(findConditionalPlans(buildAssessmentComparisonProblem(value)).kind, 'UNAVAILABLE');
});
test('INT-062 positive skills never compensate a protective route', () => {
  const value = input(); value.B.skills = [skill([3])]; value.B.protection = 'BLOCK';
  assert.equal(evaluateModel(buildAssessmentComparisonProblem(value)).kind, 'UNAVAILABLE');
  assert.equal(findConditionalPlans(buildAssessmentComparisonProblem(value)).kind, 'UNAVAILABLE');
});
