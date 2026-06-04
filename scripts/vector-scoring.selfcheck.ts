import assert from 'node:assert/strict';
import {
  DEFAULT_SCORING_CONFIG,
  applyVectorDelta,
  createVectorSnapshot,
  dataStatus,
  normalizeAnswer,
  normalizeUserVectors,
  readAxisLayer,
  scoreAnswersToAxisTargets,
  type ScoringQuestion,
} from '@/domain/services/vectorScoring.service';
import type { UserVectorSource } from '@/domain/services/vectorScoring.service';

const legacyUser: UserVectorSource = {
  vectors: {
    communication: {
      level: 0.42,
      positives: ['directness'],
      negatives: ['avoidance'],
    },
  },
};

const legacyTrait = readAxisLayer(legacyUser, 'communication', 'trait');
assert.equal(legacyTrait.level, 0.42);
assert.deepEqual(legacyTrait.positives, ['directness']);
assert.deepEqual(legacyTrait.negatives, ['avoidance']);

const normalized = normalizeUserVectors({
  vectors: {
    finance: {
      level: 2,
      positives: [],
      negatives: [],
      trait: {
        level: -1,
        confidence: 3,
        evidenceCount: -10,
        positives: [],
        negatives: [],
        scoringVersion: 'scoring_v1',
      },
    },
  },
});
assert.equal(normalized.finance.trait.level, 0);
assert.equal(normalized.finance.trait.confidence, 1);
assert.equal(normalized.finance.trait.evidenceCount, 0);

const reverseQuestion: ScoringQuestion = {
  id: 'q_reverse',
  axis: 'communication',
  facet: 'directness',
  polarity: '+',
  scale: 'likert5',
  weight: 1,
  reverseScoring: true,
};
assert.equal(normalizeAnswer(reverseQuestion, 5), 0);

const targets = scoreAnswersToAxisTargets(
  [{ qid: 'q_reverse', ui: 5 }],
  { q_reverse: reverseQuestion }
);
assert.equal(targets.matchedCount, 1);
assert.equal(targets.targetsByAxis.communication?.target01, 0);

const current = {
  level: 0,
  confidence: 0,
  evidenceCount: 0,
  positives: [],
  negatives: [],
  scoringVersion: DEFAULT_SCORING_CONFIG.key,
};
const oneAnswerDelta = applyVectorDelta({
  current,
  target: {
    axis: 'communication',
    target01: 1,
    evidenceCount: 1,
    questionConfidence: 1,
    positives: ['directness'],
    negatives: [],
  },
  layer: 'trait',
  now: new Date('2026-06-04T00:00:00.000Z'),
});
assert.ok(oneAnswerDelta.delta <= DEFAULT_SCORING_CONFIG.maxStepTrait);

const recent = applyVectorDelta({
  current: {
    ...current,
    updatedAt: new Date('2026-06-04T00:00:00.000Z'),
  },
  target: {
    axis: 'finance',
    target01: 1,
    evidenceCount: 10,
    questionConfidence: 1,
    positives: [],
    negatives: [],
  },
  layer: 'trait',
  now: new Date('2026-06-04T01:00:00.000Z'),
});
const cooledDown = applyVectorDelta({
  current: {
    ...current,
    updatedAt: new Date('2026-05-28T00:00:00.000Z'),
  },
  target: {
    axis: 'finance',
    target01: 1,
    evidenceCount: 10,
    questionConfidence: 1,
    positives: [],
    negatives: [],
  },
  layer: 'trait',
  now: new Date('2026-06-04T01:00:00.000Z'),
});
assert.ok(Math.abs(recent.delta) < Math.abs(cooledDown.delta));

const stateDelta = applyVectorDelta({
  current,
  target: {
    axis: 'psyche',
    target01: 1,
    evidenceCount: 10,
    questionConfidence: 1,
    positives: [],
    negatives: [],
  },
  layer: 'state',
  now: new Date('2026-06-04T00:00:00.000Z'),
});
assert.ok(stateDelta.delta <= DEFAULT_SCORING_CONFIG.maxStepState);
assert.notEqual(stateDelta.after.level, oneAnswerDelta.after.level);

assert.equal(
  dataStatus({ confidence: 0.2, evidenceCount: 1 }),
  'low_confidence'
);

const snapshot = createVectorSnapshot({
  userId: 'u1',
  layer: 'trait',
  axis: 'communication',
  before: oneAnswerDelta.before,
  after: oneAnswerDelta.after,
  reason: { source: 'baseline_questionnaire', questionnaireId: 'q1' },
});
assert.equal(snapshot.scoringVersion, DEFAULT_SCORING_CONFIG.key);

const uiLevel = Math.round(oneAnswerDelta.after.level * 100);
assert.ok(uiLevel >= 0 && uiLevel <= 100);

console.log('vector-scoring.selfcheck passed');
