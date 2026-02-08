import {
  AXES,
  type Axis,
  type VectorAnswerInput,
  type VectorDelta,
  type VectorQuestion,
  type VectorQuestionSource,
} from './types';

const toNumeric = (question: VectorQuestion, ui: number): number => {
  if (question.map.length === 0) return 0;
  const normalizedUi = Number.isFinite(ui) ? ui : 1;
  const idx = Math.max(0, Math.min(normalizedUi - 1, question.map.length - 1));
  return question.map[idx] ?? 0;
};

const createAxisTotals = (): Record<Axis, number> => ({
  communication: 0,
  domestic: 0,
  personalViews: 0,
  finance: 0,
  sexuality: 0,
  psyche: 0,
});

const createAxisFacetSets = (): Record<Axis, Set<string>> => ({
  communication: new Set<string>(),
  domestic: new Set<string>(),
  personalViews: new Set<string>(),
  finance: new Set<string>(),
  sexuality: new Set<string>(),
  psyche: new Set<string>(),
});

export const toVectorQuestionMap = (
  sources: VectorQuestionSource[]
): Record<string, VectorQuestion> => {
  const map: Record<string, VectorQuestion> = {};

  for (const source of sources) {
    const question: VectorQuestion = {
      axis: source.axis,
      facet: source.facet,
      map: source.map,
    };

    if (source.id) {
      map[source.id] = question;
    }
    if (source._id) {
      map[source._id] = question;
    }
  }

  return map;
};

export const scoreAnswersToVectorDelta = (
  answers: VectorAnswerInput[],
  questionById: Record<string, VectorQuestion>
): VectorDelta => {
  const signedByAxis = createAxisTotals();
  const countByAxis = createAxisTotals();
  const positivesByAxis = createAxisFacetSets();
  const negativesByAxis = createAxisFacetSets();

  let matchedCount = 0;

  for (const answer of answers) {
    const question = questionById[answer.qid];
    if (!question || typeof answer.ui !== 'number' || !Number.isFinite(answer.ui)) {
      continue;
    }

    matchedCount += 1;
    const numeric = toNumeric(question, answer.ui);
    const axis = question.axis;

    signedByAxis[axis] += numeric / 3;
    countByAxis[axis] += 1;

    if (numeric >= 2 && question.facet) {
      positivesByAxis[axis].add(question.facet);
    }
    if (numeric <= -2 && question.facet) {
      negativesByAxis[axis].add(question.facet);
    }
  }

  const levelDeltaByAxis: Partial<Record<Axis, number>> = {};
  const positives: Partial<Record<Axis, string[]>> = {};
  const negatives: Partial<Record<Axis, string[]>> = {};

  for (const axis of AXES) {
    const axisCount = countByAxis[axis];
    if (axisCount > 0) {
      levelDeltaByAxis[axis] = (signedByAxis[axis] / axisCount) * 0.25;
    }

    const axisPositives = Array.from(positivesByAxis[axis]).sort();
    if (axisPositives.length > 0) {
      positives[axis] = axisPositives;
    }

    const axisNegatives = Array.from(negativesByAxis[axis]).sort();
    if (axisNegatives.length > 0) {
      negatives[axis] = axisNegatives;
    }
  }

  return {
    answeredCount: answers.length,
    matchedCount,
    levelDeltaByAxis,
    positivesByAxis: positives,
    negativesByAxis: negatives,
  };
};
