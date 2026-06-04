import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAIR_DIAGNOSTIC_THRESHOLDS,
  buildPairDiagnostics,
} from '@/domain/services/pairDiagnostics.service';
import type { UserAxisVector, UserType } from '@/models/User';

const axisVector = (
  level: number,
  confidence: number,
  evidenceCount: number,
  positives: string[] = [],
  negatives: string[] = []
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
  communicationLevel: number,
  financeLevel: number,
  confidence: number,
  evidenceCount: number
): UserType => ({
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
    communication: axisVector(
      communicationLevel,
      confidence,
      evidenceCount,
      ['directness'],
      communicationLevel < 0.4 ? ['avoidance'] : []
    ),
    domestic: axisVector(0.5, confidence, evidenceCount),
    personalViews: axisVector(0.5, confidence, evidenceCount),
    finance: axisVector(financeLevel, confidence, evidenceCount),
    sexuality: axisVector(0.5, confidence, evidenceCount),
    psyche: axisVector(0.5, confidence, evidenceCount),
  },
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 50,
  },
});

for (const value of Object.values(PAIR_DIAGNOSTIC_THRESHOLDS)) {
  assert.ok(value <= 1, `pair diagnostic threshold ${value} must be <= 1`);
}

const insufficient = buildPairDiagnostics(
  makeUser('a', 0.8, 0.5, 0.1, 1),
  makeUser('b', 0.8, 0.5, 0.1, 1)
);
assert.equal(insufficient.axes[0]?.status, 'insufficient_data');

const strong = buildPairDiagnostics(
  makeUser('a', 0.8, 0.5, 0.9, 10),
  makeUser('b', 0.78, 0.5, 0.9, 10)
);
assert.equal(strong.axes[0]?.status, 'strong');

const financeRisk = buildPairDiagnostics(
  makeUser('a', 0.5, 0.1, 0.9, 10),
  makeUser('b', 0.5, 0.9, 0.9, 10)
);
const financeAxis = financeRisk.axes.find((axis) => axis.axis === 'finance');
assert.equal(financeAxis?.status, 'risk');
assert.ok(JSON.stringify(financeRisk).includes('По ответам видно'));
assert.ok(!JSON.stringify(financeRisk).includes('answers'));
assert.ok(!JSON.stringify(financeRisk).includes('ui'));

const questionnaireService = readFileSync(
  join(process.cwd(), 'src/domain/services/questionnaires.service.ts'),
  'utf8'
);
const pairAnswerScoringService = readFileSync(
  join(process.cwd(), 'src/domain/services/pairAnswerScoring.service.ts'),
  'utf8'
);
const forbiddenPairTraitApply = [
  'const applied = insertedNewAnswer ?',
  'applyDeltaToUserVectors',
].join(' ');
assert.ok(
  questionnaireService.includes('traitMutationApplied: false'),
  'pair questionnaire audit must explicitly mark trait mutation as disabled'
);
assert.ok(
  !questionnaireService.includes(forbiddenPairTraitApply),
  'pair questionnaire answers must not apply user trait vector deltas'
);
assert.ok(
  questionnaireService.includes('buildPairAnswerDiagnostics({'),
  'pair questionnaire completion must use pair-answer-aware diagnostics'
);
assert.ok(
  pairAnswerScoringService.includes('PairQuestionnaireAnswer.find'),
  'pair-answer diagnostics must read pair answers'
);
assert.ok(
  !pairAnswerScoringService.includes('User.update'),
  'pair-answer diagnostics must not mutate users'
);
assert.ok(!pairAnswerScoringService.includes('ui,'));

console.log('pair-diagnostics.selfcheck passed');
