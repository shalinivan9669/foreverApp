import {
  AXES,
  type ApplyContext,
  type Axis,
  type UserVectorApplyResult,
  type VectorDelta,
} from './types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const readCurrentLevel = (current: ApplyContext, axis: Axis): number => {
  const value = Number(current.vectors?.[axis]?.level ?? 0);
  if (!Number.isFinite(value)) return 0;
  return clamp01(value);
};

export const applyDeltaToUserVectors = (
  current: ApplyContext,
  delta: VectorDelta
): UserVectorApplyResult => {
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

  for (const axis of AXES) {
    if (!Object.prototype.hasOwnProperty.call(delta.levelDeltaByAxis, axis)) continue;

    const axisDelta = Number(delta.levelDeltaByAxis[axis] ?? 0);
    const safeDelta = Number.isFinite(axisDelta) ? axisDelta : 0;
    const next = clamp01(levelsByAxis[axis] + safeDelta);
    levelsByAxis[axis] = next;
    setLevels[`vectors.${axis}.level`] = next;
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
  };
};
