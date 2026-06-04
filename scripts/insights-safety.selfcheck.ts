import assert from 'node:assert/strict';
import {
  buildPairInsightCandidates,
  buildUserInsightCandidates,
  dedupeInsightCandidates,
  toCandidatePreviewDTO,
  type InsightCandidate,
} from '@/domain/services/insightRules.service';
import type { InsightType } from '@/models/Insight';
import type { Axis } from '@/domain/vectors';
import type { UserAxisVector, UserType } from '@/models/User';

const axisVector = (
  level: number,
  positives: string[] = [],
  negatives: string[] = [],
  confidence = 0.9,
  evidenceCount = 10
): UserAxisVector => ({
  level,
  positives,
  negatives,
  trait: {
    level,
    confidence,
    evidenceCount,
    positives,
    negatives,
    scoringVersion: 'scoring_v1',
  },
});

const makeUser = (
  id: string,
  overrides: Partial<Record<Axis, UserAxisVector>>
): UserType => {
  const base = axisVector(0.5);
  return {
    id,
    username: id,
    avatar: '',
    personal: {
      gender: 'male',
      age: 30,
      city: 'city',
      relationshipStatus: 'seeking',
    },
    vectors: {
      communication: overrides.communication ?? base,
      domestic: overrides.domestic ?? base,
      personalViews: overrides.personalViews ?? base,
      finance: overrides.finance ?? base,
      sexuality: overrides.sexuality ?? base,
      psyche: overrides.psyche ?? base,
    },
    preferences: {
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 50,
    },
  };
};

const left = makeUser('left', {
  communication: axisVector(0.75, ['directness'], ['avoidance']),
  finance: axisVector(0.1),
  domestic: axisVector(0.4, [], ['fairness']),
  psyche: axisVector(0.2),
});
const right = makeUser('right', {
  communication: axisVector(0.25, [], ['avoidance']),
  finance: axisVector(0.9),
  domestic: axisVector(0.5),
  psyche: axisVector(0.5),
});

const candidates = buildPairInsightCandidates({
  pairId: 'pair-1',
  members: ['left', 'right'],
  left,
  right,
  fatigue: { score: 0.82, updatedAt: new Date('2026-06-04T00:00:00.000Z') },
  readiness: { score: 0.2, updatedAt: new Date('2026-06-04T00:00:00.000Z') },
  weekly: { fatigue: 0.9, closeness: 0.2 },
});
const ruleIds = new Set(candidates.map((candidate) => candidate.trigger.ruleId));
const highCommunicationCandidates = buildPairInsightCandidates({
  pairId: 'pair-2',
  members: ['left', 'right'],
  left: makeUser('left-high', {
    communication: axisVector(0.8, ['directness'], []),
    finance: axisVector(0.5),
    domestic: axisVector(0.5),
    psyche: axisVector(0.5),
  }),
  right: makeUser('right-high', {
    communication: axisVector(0.82, ['directness'], []),
    finance: axisVector(0.5),
    domestic: axisVector(0.5),
    psyche: axisVector(0.5),
  }),
});
for (const candidate of highCommunicationCandidates) {
  ruleIds.add(candidate.trigger.ruleId);
}
const insufficientCandidates = buildPairInsightCandidates({
  pairId: 'pair-3',
  members: ['left', 'right'],
  left: makeUser('left-low-data', {
    communication: axisVector(0.5, [], [], 0.1, 1),
    finance: axisVector(0.5, [], [], 0.1, 1),
    domestic: axisVector(0.5, [], [], 0.1, 1),
    psyche: axisVector(0.5, [], [], 0.1, 1),
  }),
  right: makeUser('right-low-data', {
    communication: axisVector(0.5, [], [], 0.1, 1),
    finance: axisVector(0.5, [], [], 0.1, 1),
    domestic: axisVector(0.5, [], [], 0.1, 1),
    psyche: axisVector(0.5, [], [], 0.1, 1),
  }),
});
for (const candidate of insufficientCandidates) {
  ruleIds.add(candidate.trigger.ruleId);
}
assert.ok(ruleIds.size >= 10);
assert.ok(ruleIds.has('both_conflict_avoidance'));
assert.ok(ruleIds.has('finance_delta_high'));
assert.ok(ruleIds.has('directness_asymmetry'));
assert.ok(ruleIds.has('psyche_low_fatigue_high'));
assert.ok(ruleIds.has('domestic_fairness_risk'));
assert.ok(ruleIds.has('low_pair_readiness'));
assert.ok(ruleIds.has('both_high_communication'));
assert.ok(ruleIds.has('weekly_fatigue_increase'));
assert.ok(ruleIds.has('shared_time_delta'));
assert.ok(ruleIds.has('insufficient_data_axis'));

const userCandidates = buildUserInsightCandidates({
  user: left,
  activePair: { fatigue: { score: 0.82, updatedAt: new Date('2026-06-04T00:00:00.000Z') } },
});
assert.equal(userCandidates[0]?.trigger.ruleId, 'psyche_low_fatigue_high');

const forbiddenWording = [
  'диагноз',
  'нарцисс',
  'психопат',
  'травма',
  'психическое расстройство',
  'плохая психика',
  'вы несовместимы',
  'отношения обречены',
  'симптом',
  'расстройство',
  'болезнь',
  'депрессия',
  'тревожность',
];
for (const candidate of [...candidates, ...userCandidates]) {
  const text = `${candidate.title} ${candidate.safeWording} ${candidate.recommendedAction}`.toLowerCase();
  for (const forbidden of forbiddenWording) {
    assert.ok(!text.includes(forbidden), `insight wording must not include "${forbidden}"`);
  }
}

const now = new Date('2026-06-04T00:00:00.000Z');
const first = candidates[0] as InsightCandidate;
const existingActive: Pick<
  InsightType,
  'ownerType' | 'userId' | 'pairId' | 'trigger' | 'status' | 'cooldownUntil'
> = {
  ownerType: first.ownerType,
  userId: first.userId,
  pairId: first.pairId,
  trigger: first.trigger,
  status: 'active',
  cooldownUntil: new Date('2026-06-05T00:00:00.000Z'),
};
assert.equal(dedupeInsightCandidates([first], [existingActive], now).length, 0);
assert.equal(
  dedupeInsightCandidates(
    [first],
    [{ ...existingActive, cooldownUntil: new Date('2026-06-03T00:00:00.000Z') }],
    now
  ).length,
  1
);
assert.equal(
  dedupeInsightCandidates(
    [first],
    [{ ...existingActive, status: 'dismissed' }],
    now
  ).length,
  1
);

const dtoJson = JSON.stringify(toCandidatePreviewDTO(first, now));
assert.ok(!dtoJson.includes('evidence'));
assert.ok(!dtoJson.includes('answers'));
assert.ok(!dtoJson.includes('questionId'));
assert.ok(!dtoJson.includes('"ui"'));

console.log('insights-safety.selfcheck passed');
