import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AXES,
  applyDeltaToUserVectors,
  scoreAnswersToVectorDelta,
  type Axis,
  type VectorQuestion,
} from '@/domain/vectors';
import {
  DEFAULT_SCORING_CONFIG,
  confidenceLabel,
  createVectorSnapshot,
  dataStatus,
  readAxisLayer,
  readDisplayedAxis,
  recalculateDisplayedVector,
} from '@/domain/services/vectorScoring.service';
import { buildPairDiagnostics } from '@/domain/services/pairDiagnostics.service';
import type { UserAxisVector, UserType } from '@/models/User';

const axisVector = (
  level: number,
  positives: string[] = [],
  negatives: string[] = [],
  confidence = 0,
  evidenceCount = 0
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
    scoringVersion: DEFAULT_SCORING_CONFIG.key,
  },
});

const makeUser = (
  id: string,
  overrides: Partial<Record<Axis, UserAxisVector>> = {}
): UserType => {
  const vectors = AXES.reduce<Record<string, UserAxisVector>>((acc, axis) => {
    acc[axis] = overrides[axis] ?? axisVector(0.5);
    return acc;
  }, {});

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
    vectors,
    preferences: {
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 50,
    },
  };
};

const questionMap: Record<string, VectorQuestion> = {
  q_finance_planning: {
    axis: 'finance',
    facet: 'planning',
    map: [-3, -1, 0, 1, 3],
    weight: 1,
    polarity: '+',
  },
};

const baselineUser = makeUser('baseline-user');
const answers = [{ qid: 'q_finance_planning', ui: 5 }];
const delta = scoreAnswersToVectorDelta(answers, questionMap);
assert.equal(delta.matchedCount, 1);

const applied = applyDeltaToUserVectors(baselineUser, delta);
const financeSnapshotData = applied.snapshotByAxis.finance;
assert.ok(financeSnapshotData, 'baseline finance answer must produce a vector snapshot payload');

const snapshot = createVectorSnapshot({
  userId: baselineUser.id,
  layer: 'trait',
  axis: 'finance',
  before: financeSnapshotData.before,
  after: financeSnapshotData.after,
  reason: {
    source: 'baseline_questionnaire',
    questionnaireId: 'baseline-q',
    questionIds: ['q_finance_planning'],
  },
  scoringVersion: financeSnapshotData.scoringVersion,
});
assert.equal(snapshot.reason.source, 'baseline_questionnaire');
assert.equal(snapshot.reason.questionnaireId, 'baseline-q');
assert.deepEqual(snapshot.reason.questionIds, ['q_finance_planning']);
assert.ok(snapshot.delta > 0);

const updatedUser = makeUser('baseline-user');
const updatedFinanceTrait = {
  ...readAxisLayer(updatedUser, 'finance', 'trait'),
  ...financeSnapshotData.after,
  positives: ['planning'],
  negatives: [],
  scoringVersion: DEFAULT_SCORING_CONFIG.key,
};
updatedUser.vectors.finance.level = updatedFinanceTrait.level;
updatedUser.vectors.finance.positives = updatedFinanceTrait.positives;
updatedUser.vectors.finance.trait = updatedFinanceTrait;
updatedUser.vectors.finance.displayed = recalculateDisplayedVector(updatedFinanceTrait);

const displayed = readDisplayedAxis(updatedUser, 'finance');
const profileSummaryAxis = {
  level: Math.round(displayed.level * 100),
  rawLevel: displayed.level,
  confidence: displayed.confidence,
  confidenceLabel: confidenceLabel(displayed.confidence),
  positives: readAxisLayer(updatedUser, 'finance', 'trait').positives,
  negatives: readAxisLayer(updatedUser, 'finance', 'trait').negatives,
  dataStatus: dataStatus({
    confidence: readAxisLayer(updatedUser, 'finance', 'trait').confidence,
    evidenceCount: readAxisLayer(updatedUser, 'finance', 'trait').evidenceCount,
  }),
};
assert.equal(profileSummaryAxis.rawLevel, displayed.level);
assert.equal(profileSummaryAxis.positives[0], 'planning');
assert.ok(profileSummaryAxis.level >= 0 && profileSummaryAxis.level <= 100);

const pairLeft = makeUser('left', {
  communication: axisVector(0.8, ['directness'], [], 0.9, 10),
  finance: axisVector(0.1, [], [], 0.9, 10),
});
const pairRight = makeUser('right', {
  communication: axisVector(0.2, [], ['avoidance'], 0.9, 10),
  finance: axisVector(0.9, [], [], 0.9, 10),
});
const leftBefore = readAxisLayer(pairLeft, 'communication', 'trait').level;
const rightBefore = readAxisLayer(pairRight, 'communication', 'trait').level;
const diagnostics = buildPairDiagnostics(pairLeft, pairRight);
assert.ok(diagnostics.axes.some((axis) => axis.axis === 'finance' && axis.status === 'risk'));
assert.equal(readAxisLayer(pairLeft, 'communication', 'trait').level, leftBefore);
assert.equal(readAxisLayer(pairRight, 'communication', 'trait').level, rightBefore);

const questionnaireService = readFileSync(
  join(process.cwd(), 'src/domain/services/questionnaires.service.ts'),
  'utf8'
);
assert.ok(
  questionnaireService.includes('PairQuestionnaireAnswer.updateOne'),
  'pair questionnaire answers must persist as PairQuestionnaireAnswer'
);
assert.ok(
  questionnaireService.includes('traitMutationApplied: false'),
  'pair questionnaire answers must explicitly avoid User trait vector mutation'
);
assert.ok(
  questionnaireService.includes('buildPairDiagnostics(memberA, memberB)'),
  'completed pair questionnaire sessions must refresh pair diagnostics'
);
assert.ok(
  questionnaireService.includes('pairDiagnosticsRefreshed: shouldComplete'),
  'pair questionnaire audit must expose diagnostics refresh status'
);

console.log('vector-e2e.selfcheck passed');
