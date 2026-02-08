import {
  AXES,
  type Axis,
  type VectorAnswerInput,
  type VectorDelta,
  type VectorQuestion,
  type VectorQuestionSource,
} from './types';

const EPSILON = 1e-6;

const toContribution = (question: VectorQuestion, ui: number): number => {
  if (question.map.length === 0) return 0;
  const normalizedUi = Number.isFinite(ui) ? ui : 1;
  const idx = Math.max(0, Math.min(normalizedUi - 1, question.map.length - 1));
  const numeric = question.map[idx] ?? 0;
  const normalizationBase = question.map.reduce((acc, item) => {
    const abs = Math.abs(item);
    return Number.isFinite(abs) ? Math.max(acc, abs) : acc;
  }, 1);
  const normalized = numeric / Math.max(normalizationBase, 1);
  const polarityMultiplier = question.polarity === '-' ? -1 : 1;
  return normalized * polarityMultiplier;
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
    const safeWeight =
      Number.isFinite(source.weight) && source.weight > 0 ? source.weight : 1;
    const safePolarity =
      source.polarity === '+' || source.polarity === '-' || source.polarity === 'neutral'
        ? source.polarity
        : 'neutral';

    const question: VectorQuestion = {
      axis: source.axis,
      facet: source.facet,
      map: source.map,
      weight: safeWeight,
      polarity: safePolarity,
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
  const weightedSumByAxis = createAxisTotals();
  const sumWeightsByAxis = createAxisTotals();
  const matchedByAxis = createAxisTotals();
  const positivesByAxis = createAxisFacetSets();
  const negativesByAxis = createAxisFacetSets();

  let matchedCount = 0;

  for (const answer of answers) {
    const question = questionById[answer.qid];
    if (!question || typeof answer.ui !== 'number' || !Number.isFinite(answer.ui)) {
      continue;
    }

    matchedCount += 1;
    const contribution = toContribution(question, answer.ui);
    const axis = question.axis;
    const weight =
      Number.isFinite(question.weight) && question.weight > 0 ? question.weight : 1;

    weightedSumByAxis[axis] += contribution * weight;
    sumWeightsByAxis[axis] += weight;
    matchedByAxis[axis] += 1;

    if (contribution >= 2 / 3 && question.facet) {
      positivesByAxis[axis].add(question.facet);
    }
    if (contribution <= -2 / 3 && question.facet) {
      negativesByAxis[axis].add(question.facet);
    }
  }

  const levelDeltaByAxis: Partial<Record<Axis, number>> = {};
  const positives: Partial<Record<Axis, string[]>> = {};
  const negatives: Partial<Record<Axis, string[]>> = {};
  const perAxisMatchedCount: Partial<Record<Axis, number>> = {};
  const perAxisSumWeights: Partial<Record<Axis, number>> = {};

  for (const axis of AXES) {
    const axisWeight = sumWeightsByAxis[axis];
    const axisMatched = matchedByAxis[axis];
    if (axisMatched > 0) {
      perAxisMatchedCount[axis] = axisMatched;
    }
    if (axisWeight > 0) {
      perAxisSumWeights[axis] = axisWeight;
      levelDeltaByAxis[axis] = weightedSumByAxis[axis] / Math.max(axisWeight, EPSILON);
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
    perAxisMatchedCount,
    perAxisSumWeights,
    levelDeltaByAxis,
    positivesByAxis: positives,
    negativesByAxis: negatives,
  };
};
