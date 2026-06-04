import assert from 'node:assert/strict';
import {
  applyDeltaToUserVectors,
  scoreAnswersToVectorDelta,
  toVectorQuestionMap,
  type Axis,
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

const makeUser = (communicationLevel = 0.5) => {
  const vectors = baseVectors();
  vectors.communication.level = communicationLevel;
  return { vectors };
};

const questionMap = toVectorQuestionMap([
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
  const firstDelta = scoreAnswersToVectorDelta([{ qid: 'q1', ui: 5 }], questionMap);
  const secondDelta = scoreAnswersToVectorDelta([{ qid: 'q2', ui: 5 }], questionMap);

  const afterFirst = applyDeltaToUserVectors(makeUser(), firstDelta).levelsByAxis
    .communication;
  const fixedFinal = applyDeltaToUserVectors(makeUser(afterFirst), secondDelta).levelsByAxis
    .communication;

  const repeatedDelta = scoreAnswersToVectorDelta(
    [
      { qid: 'q1', ui: 5 },
      { qid: 'q2', ui: 5 },
    ],
    questionMap
  );
  const repeatedFinal = applyDeltaToUserVectors(makeUser(afterFirst), repeatedDelta)
    .levelsByAxis.communication;

  assert(
    fixedFinal > afterFirst,
    'A newly answered second question should still move the vector'
  );
  assert(
    repeatedFinal > fixedFinal,
    'Re-scoring all prior pair answers would over-apply the first answer'
  );

  console.log('Pair questionnaire vector self-check passed (2/2).');
};

run();
