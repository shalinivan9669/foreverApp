import type { PairType } from '@/models/Pair';
import type { UserType } from '@/models/User';
import { AXES, type Axis } from '@/domain/vectors';
import {
  DEFAULT_SCORING_CONFIG,
  readAxisLayer,
  type NormalizedVectorLayer,
} from '@/domain/services/vectorScoring.service';

export const PAIR_DIAGNOSTIC_THRESHOLDS = {
  LEVEL_LOW: DEFAULT_SCORING_CONFIG.axisThresholds.low,
  LEVEL_HIGH: DEFAULT_SCORING_CONFIG.axisThresholds.high,
  DELTA_SMALL: DEFAULT_SCORING_CONFIG.axisThresholds.deltaSmall,
  DELTA_MODERATE: DEFAULT_SCORING_CONFIG.axisThresholds.deltaModerate,
  DELTA_HIGH: DEFAULT_SCORING_CONFIG.axisThresholds.deltaHigh,
  CONF_LOW: DEFAULT_SCORING_CONFIG.lowConfidenceThreshold,
  CONF_MEDIUM: 0.55,
  CONF_HIGH: 0.75,
} as const;

export type PairAxisDiagnosticStatus =
  | 'insufficient_data'
  | 'strong'
  | 'risk'
  | 'complement'
  | 'neutral';

export type PairAxisDiagnostic = {
  axis: Axis;
  status: PairAxisDiagnosticStatus;
  a: number;
  b: number;
  delta: number;
  confidence: number;
  safeWording: string;
};

export type PairDiagnosticsResult = {
  passport: NonNullable<PairType['passport']>;
  axes: PairAxisDiagnostic[];
};

const intersect = (left: string[] = [], right: string[] = []): string[] =>
  left.filter((item) => right.includes(item));

const axisStatus = (
  left: NormalizedVectorLayer,
  right: NormalizedVectorLayer,
  noActiveHighFatigueOrCrisis = true
): PairAxisDiagnosticStatus => {
  const delta = Math.abs(left.level - right.level);
  const pairConfidence = Math.min(left.confidence, right.confidence);

  if (pairConfidence < PAIR_DIAGNOSTIC_THRESHOLDS.CONF_LOW) {
    return 'insufficient_data';
  }
  if (
    left.level >= PAIR_DIAGNOSTIC_THRESHOLDS.LEVEL_HIGH &&
    right.level >= PAIR_DIAGNOSTIC_THRESHOLDS.LEVEL_HIGH &&
    delta <= PAIR_DIAGNOSTIC_THRESHOLDS.DELTA_MODERATE
  ) {
    return 'strong';
  }
  if (
    delta >= PAIR_DIAGNOSTIC_THRESHOLDS.DELTA_HIGH ||
    (left.level <= PAIR_DIAGNOSTIC_THRESHOLDS.LEVEL_LOW &&
      right.level <= PAIR_DIAGNOSTIC_THRESHOLDS.LEVEL_LOW)
  ) {
    return 'risk';
  }
  if (
    delta >= PAIR_DIAGNOSTIC_THRESHOLDS.DELTA_MODERATE &&
    delta < PAIR_DIAGNOSTIC_THRESHOLDS.DELTA_HIGH &&
    pairConfidence >= PAIR_DIAGNOSTIC_THRESHOLDS.CONF_MEDIUM &&
    noActiveHighFatigueOrCrisis
  ) {
    return 'complement';
  }
  return 'neutral';
};

const safeWordingForStatus = (status: PairAxisDiagnosticStatus): string => {
  if (status === 'insufficient_data') {
    return 'Данных пока мало: вывод по этой теме лучше воспринимать как предварительное наблюдение по ответам.';
  }
  if (status === 'risk') {
    return 'По ответам видно различие в подходе к этой теме. Это не приговор, но лучше обсудить правила заранее.';
  }
  if (status === 'strong') {
    return 'По ответам видно похожий устойчивый подход к этой теме.';
  }
  if (status === 'complement') {
    return 'По ответам видно различие в подходах, которое может дополнять пару при ясных правилах.';
  }
  return 'По ответам пока нет выраженного сигнала по этой теме.';
};

const severityFor = (
  status: PairAxisDiagnosticStatus,
  delta: number,
  negativesCount: number
): 1 | 2 | 3 => {
  if (status === 'risk' && delta >= PAIR_DIAGNOSTIC_THRESHOLDS.DELTA_HIGH) return 3;
  if (status === 'risk' || negativesCount >= 2) return 2;
  return 1;
};

export const buildPairDiagnostics = (
  left: UserType,
  right: UserType
): PairDiagnosticsResult => {
  const strongSides: { axis: Axis; facets: string[] }[] = [];
  const riskZones: { axis: Axis; facets: string[]; severity: 1 | 2 | 3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta: { axis: Axis; delta: number }[] = [];
  const axes: PairAxisDiagnostic[] = [];

  for (const axis of AXES) {
    const leftVector = readAxisLayer(left, axis, 'trait');
    const rightVector = readAxisLayer(right, axis, 'trait');
    const delta = Math.abs(leftVector.level - rightVector.level);
    const status = axisStatus(leftVector, rightVector);
    const positives = intersect(leftVector.positives, rightVector.positives);
    const negatives = intersect(leftVector.negatives, rightVector.negatives);
    const leftCoversRight = intersect(leftVector.positives, rightVector.negatives);
    const rightCoversLeft = intersect(rightVector.positives, leftVector.negatives);

    axes.push({
      axis,
      status,
      a: leftVector.level,
      b: rightVector.level,
      delta,
      confidence: Math.min(leftVector.confidence, rightVector.confidence),
      safeWording: safeWordingForStatus(status),
    });

    if (status === 'strong' || positives.length > 0) {
      strongSides.push({ axis, facets: positives });
    }

    if (status === 'risk' || negatives.length > 0) {
      riskZones.push({
        axis,
        facets: negatives,
        severity: severityFor(status, delta, negatives.length),
      });
    }

    if (status === 'complement' || leftCoversRight.length > 0 || rightCoversLeft.length > 0) {
      complementMap.push({
        axis,
        A_covers_B: leftCoversRight,
        B_covers_A: rightCoversLeft,
      });
    }

    if (delta > 0.01) {
      levelDelta.push({ axis, delta });
    }
  }

  return {
    passport: {
      strongSides,
      riskZones,
      complementMap,
      levelDelta,
    },
    axes,
  };
};

export const buildPairPassport = (
  left: UserType,
  right: UserType
): NonNullable<PairType['passport']> => buildPairDiagnostics(left, right).passport;
