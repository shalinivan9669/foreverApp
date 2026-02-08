import {
  AXES,
  DEFAULT_VECTOR_UPDATE_POLICY,
  type ApplyContext,
  type Axis,
  type VectorUpdatePolicy,
  type UserVectorApplyResult,
  type VectorDelta,
} from './types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const isFiniteNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isPositiveFiniteNumber = (value: number | undefined): value is number =>
  isFiniteNumber(value) && value > 0;

const readCurrentLevel = (current: ApplyContext, axis: Axis): number => {
  const value = Number(current.vectors?.[axis]?.level ?? 0);
  if (!Number.isFinite(value)) return 0;
  return clamp01(value);
};

const resolvePolicy = (
  overrides?: Partial<VectorUpdatePolicy>
): VectorUpdatePolicy => {
  const alphaCandidate = overrides?.alphaBase;
  const alphaBase =
    isPositiveFiniteNumber(alphaCandidate)
      ? alphaCandidate
      : DEFAULT_VECTOR_UPDATE_POLICY.alphaBase;

  const maxStepCandidate = overrides?.maxStepPerSubmit;
  const maxStepPerSubmit =
    isPositiveFiniteNumber(maxStepCandidate)
      ? maxStepCandidate
      : DEFAULT_VECTOR_UPDATE_POLICY.maxStepPerSubmit;

  const confidenceKCandidate = overrides?.confidenceK;
  const confidenceK =
    isPositiveFiniteNumber(confidenceKCandidate)
      ? confidenceKCandidate
      : DEFAULT_VECTOR_UPDATE_POLICY.confidenceK;

  const edgeDiminishMinCandidate = overrides?.edgeDiminishMin;
  const edgeDiminishMin = isFiniteNumber(edgeDiminishMinCandidate)
    ? clamp(edgeDiminishMinCandidate, 0, 1)
    : DEFAULT_VECTOR_UPDATE_POLICY.edgeDiminishMin;

  return {
    alphaBase,
    maxStepPerSubmit,
    confidenceK,
    edgeDiminishMin,
  };
};

export const applyDeltaToUserVectors = (
  current: ApplyContext,
  delta: VectorDelta,
  policyOverrides?: Partial<VectorUpdatePolicy>
): UserVectorApplyResult => {
  const policy = resolvePolicy(policyOverrides);
  const confidence = clamp(delta.matchedCount / policy.confidenceK, 0, 1);
  const effectiveAlpha = policy.alphaBase * confidence;

  const levelsByAxis = AXES.reduce<Record<Axis, number>>((acc, axis) => {
    acc[axis] = readCurrentLevel(current, axis);
    return acc;
  }, {
    communication: 0,
    domestic: 0,
    personalViews: 0,
    finance: 0,
    sexuality: 0,
    psyche: 0,
  });

  const setLevels: Record<string, number> = {};
  const appliedStepByAxis: Partial<Record<Axis, number>> = {};
  const clampedAxes: Axis[] = [];

  for (const axis of AXES) {
    if (!Object.prototype.hasOwnProperty.call(delta.levelDeltaByAxis, axis)) continue;

    const axisDelta = Number(delta.levelDeltaByAxis[axis] ?? 0);
    const safeDelta = Number.isFinite(axisDelta) ? axisDelta : 0;

    const rawStep = safeDelta * effectiveAlpha;
    const stepBeforeEdge = clamp(
      rawStep,
      -policy.maxStepPerSubmit,
      policy.maxStepPerSubmit
    );
    const stepWasClamped = stepBeforeEdge !== rawStep;

    const level = levelsByAxis[axis];
    const edge = 1 - Math.abs(level - 0.5) * 2;
    const edgeFactor =
      policy.edgeDiminishMin + (1 - policy.edgeDiminishMin) * clamp(edge, 0, 1);
    const step = stepBeforeEdge * edgeFactor;

    const unclampedNext = level + step;
    const next = clamp01(unclampedNext);
    const levelWasClamped = next !== unclampedNext;

    if (stepWasClamped || levelWasClamped) {
      clampedAxes.push(axis);
    }

    const appliedStep = next - level;
    levelsByAxis[axis] = next;
    setLevels[`vectors.${axis}.level`] = next;
    appliedStepByAxis[axis] = appliedStep;
  }

  const addToSet: Record<string, { $each: string[] }> = {};
  for (const axis of AXES) {
    const positives = delta.positivesByAxis[axis] ?? [];
    if (positives.length > 0) {
      addToSet[`vectors.${axis}.positives`] = { $each: positives };
    }

    const negatives = delta.negativesByAxis[axis] ?? [];
    if (negatives.length > 0) {
      addToSet[`vectors.${axis}.negatives`] = { $each: negatives };
    }
  }

  return {
    levelsByAxis,
    setLevels,
    addToSet,
    appliedStepByAxis,
    clampedAxes,
    confidence,
    alphaBase: policy.alphaBase,
    maxStepPerSubmit: policy.maxStepPerSubmit,
    effectiveAlpha,
  };
};
