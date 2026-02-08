import assert from 'node:assert/strict';
import {
  AXES,
  applyDeltaToUserVectors,
  scoreAnswersToVectorDelta,
  toVectorQuestionMap,
  type Axis,
  type VectorDelta,
} from '@/domain/vectors';

type UserVectorState = {
  level: number;
  positives: string[];
  negatives: string[];
};

const baseVectors = (): Record<Axis, UserVectorState> => ({
  communication: { level: 0.5, positives: [], negatives: [] },
  domestic: { level: 0.5, positives: [], negatives: [] },
  personalViews: { level: 0.5, positives: [], negatives: [] },
  finance: { level: 0.5, positives: [], negatives: [] },
  sexuality: { level: 0.5, positives: [], negatives: [] },
  psyche: { level: 0.5, positives: [], negatives: [] },
});

const makeUser = (overrides?: Partial<Record<Axis, number>>) => {
  const vectors = baseVectors();
  for (const axis of AXES) {
    const next = Number(overrides?.[axis] ?? vectors[axis].level);
    vectors[axis].level = Number.isFinite(next) ? next : vectors[axis].level;
  }

  return { vectors };
};

const baseQuestionMap = toVectorQuestionMap([
  {
    id: 'q1',
    axis: 'communication',
    facet: 'clarity',
    map: [-3, -1, 0, 1, 3],
    weight: 1,
    polarity: '+',
  },
  {
    id: 'q2',
    axis: 'communication',
    facet: 'empathy',
    map: [-3, -1, 0, 1, 3],
    weight: 1,
    polarity: '+',
  },
]);

const run = () => {
  {
    const deltaShort = scoreAnswersToVectorDelta(
      [
        { qid: 'q1', ui: 5 },
        { qid: 'q2', ui: 5 },
      ],
      baseQuestionMap
    );
    const appliedShort = applyDeltaToUserVectors(makeUser({ communication: 0.5 }), deltaShort);
    const shortStep = appliedShort.appliedStepByAxis.communication ?? 0;

    assert(shortStep > 0, 'Short submit should move level positively');
    assert(shortStep < 0.03, 'Short submit should have a small step');
  }

  {
    const longAnswers = Array.from({ length: 20 }, (_, index) => ({
      qid: index % 2 === 0 ? 'q1' : 'q2',
      ui: 5,
    }));
    const deltaLong = scoreAnswersToVectorDelta(longAnswers, baseQuestionMap);
    const appliedLong = applyDeltaToUserVectors(makeUser({ communication: 0.5 }), deltaLong);
    const longStep = appliedLong.appliedStepByAxis.communication ?? 0;

    assert(longStep > 0.07, 'Long submit should approach alpha-limited step');
    assert(longStep <= 0.08, 'Long submit should respect maxStepPerSubmit');
  }

  {
    const longAnswers = Array.from({ length: 20 }, (_, index) => ({
      qid: index % 2 === 0 ? 'q1' : 'q2',
      ui: 5,
    }));
    const deltaLong = scoreAnswersToVectorDelta(longAnswers, baseQuestionMap);
    const centerStep =
      applyDeltaToUserVectors(makeUser({ communication: 0.5 }), deltaLong).appliedStepByAxis
        .communication ?? 0;
    const edgeStep =
      applyDeltaToUserVectors(makeUser({ communication: 0.95 }), deltaLong).appliedStepByAxis
        .communication ?? 0;

    assert(edgeStep > 0, 'Edge submit should still move level');
    assert(edgeStep < centerStep, 'Edge damping should reduce step near 0 or 1');
  }

  {
    const weightedMap = toVectorQuestionMap([
      {
        id: 'w-strong',
        axis: 'communication',
        facet: 'clarity',
        map: [-3, -1, 0, 1, 3],
        weight: 2,
        polarity: '+',
      },
      {
        id: 'w-weak',
        axis: 'communication',
        facet: 'clarity',
        map: [-3, -1, 0, 1, 3],
        weight: 1,
        polarity: '+',
      },
    ]);

    const weightedDelta = scoreAnswersToVectorDelta(
      [
        { qid: 'w-strong', ui: 5 },
        { qid: 'w-weak', ui: 1 },
      ],
      weightedMap
    );

    const communicationDelta = weightedDelta.levelDeltaByAxis.communication ?? 0;
    assert(
      communicationDelta > 0.3 && communicationDelta < 0.34,
      'Weight=2 answer should dominate a conflicting weight=1 answer'
    );
  }

  {
    const clampDelta: VectorDelta = {
      answeredCount: 20,
      matchedCount: 20,
      perAxisMatchedCount: { communication: 20 },
      perAxisSumWeights: { communication: 20 },
      levelDeltaByAxis: { communication: 1 },
      positivesByAxis: {},
      negativesByAxis: {},
    };

    const nearTop = applyDeltaToUserVectors(makeUser({ communication: 0.99 }), clampDelta);
    const nearBottom = applyDeltaToUserVectors(
      makeUser({ communication: 0.01 }),
      {
        ...clampDelta,
        levelDeltaByAxis: { communication: -1 },
      }
    );

    const topLevel = nearTop.levelsByAxis.communication;
    const bottomLevel = nearBottom.levelsByAxis.communication;
    assert(topLevel <= 1 && topLevel >= 0, 'Top clamp should stay inside [0,1]');
    assert(bottomLevel <= 1 && bottomLevel >= 0, 'Bottom clamp should stay inside [0,1]');
    assert(
      nearTop.clampedAxes.includes('communication') ||
        nearBottom.clampedAxes.includes('communication'),
      'Clamp metadata should include clamped axis'
    );
  }

  console.log('Vector policy self-check passed (5/5).');
};

run();
