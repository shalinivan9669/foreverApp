import type {
  UserAxisVector,
  UserDisplayedVectorData,
  UserVectorLayerData,
  VectorLayer,
} from '@/models/User';
import type {
  VectorSnapshotReasonSource,
  VectorSnapshotType,
} from '@/models/VectorSnapshot';
import { AXES, type Axis } from '@/domain/vectors/types';

export type { VectorLayer };

export const DEFAULT_SCORING_CONFIG = {
  key: 'scoring_v1',
  alphaBase: 0.12,
  maxStepTrait: 0.08,
  maxStepState: 0.20,
  maxStepMatching: 0.10,
  confidenceK: 12,
  cooldownHoursTrait: 72,
  cooldownHoursState: 12,
  lowConfidenceThreshold: 0.35,
  axisThresholds: {
    low: 0.38,
    high: 0.67,
    deltaSmall: 0.18,
    deltaModerate: 0.28,
    deltaHigh: 0.38,
  },
} as const;

export type ConfidenceLabel = 'low' | 'medium' | 'high';
export type DataStatus = 'enough' | 'low_confidence' | 'missing';

export type NormalizedVectorLayer = UserVectorLayerData;
export type NormalizedDisplayedVector = UserDisplayedVectorData;

export type NormalizedAxisVector = {
  trait: NormalizedVectorLayer;
  state: NormalizedVectorLayer;
  matching: NormalizedVectorLayer;
  displayed: NormalizedDisplayedVector;
};

export type UserVectorSource = {
  vectors?: Partial<Record<Axis, UserAxisVector | undefined>>;
};

export type ScoringScale =
  | 'likert_5'
  | 'likert5'
  | 'bool'
  | 'yes_no'
  | 'single_choice'
  | 'slider_0_100'
  | {
      type: 'likert_5' | 'likert5' | 'bool' | 'yes_no' | 'single_choice' | 'slider_0_100';
      min?: number;
      max?: number;
      neutral?: number;
      options?: Array<{
        value: string | number;
        label?: string;
        normalized?: number;
        contribution?: number;
      }>;
    };

export type ScoringMapEntry = {
  answerValue: string | number;
  normalized: number;
  contribution?: number;
  facetSignal?: 'positive' | 'negative' | 'neutral';
};

export type ScoringQuestion = {
  id?: string;
  _id?: string;
  axis: Axis;
  facet?: string;
  polarity?: 1 | -1 | '+' | '-' | 'neutral';
  scale?: ScoringScale;
  map?: number[] | ScoringMapEntry[];
  weight?: number;
  reverseScoring?: boolean;
  confidenceWeight?: number;
};

type ScaleKind =
  | 'likert_5'
  | 'likert5'
  | 'bool'
  | 'yes_no'
  | 'single_choice'
  | 'slider_0_100';

export type ScoringAnswerInput = {
  qid: string;
  ui: number | string | boolean;
};

export type ScoredAnswer = {
  axis: Axis;
  facet: string;
  target01: number;
  weight: number;
  confidenceWeight: number;
  facetSignal: 'positive' | 'negative' | 'neutral';
};

export type AxisTarget = {
  axis: Axis;
  target01: number;
  evidenceCount: number;
  questionConfidence: number;
  positives: string[];
  negatives: string[];
};

export type AxisTargetsResult = {
  answeredCount: number;
  matchedCount: number;
  invalidCount: number;
  targetsByAxis: Partial<Record<Axis, AxisTarget>>;
};

export type AppliedVectorDelta = {
  before: NormalizedVectorLayer;
  after: NormalizedVectorLayer;
  displayed: NormalizedDisplayedVector;
  delta: number;
  sessionConfidence: number;
  cooldownFactor: number;
  scoringVersion: string;
};

const EPSILON = 1e-6;
const HOUR_MS = 60 * 60 * 1000;

export const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteNumber = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const uniqueStrings = (items: string[] | undefined): string[] =>
  Array.from(new Set((items ?? []).filter((item) => item.trim().length > 0))).sort();

const scoringVersion = (value: string | undefined): string =>
  value && value.trim().length > 0 ? value : DEFAULT_SCORING_CONFIG.key;

const confidenceFromEvidence = (evidenceCount: number): number =>
  clamp01(1 - Math.exp(-Math.max(0, evidenceCount) / DEFAULT_SCORING_CONFIG.confidenceK));

const normalizeLayer = (
  layer: Partial<UserVectorLayerData> | undefined,
  legacy: UserAxisVector | undefined,
  layerName: Exclude<VectorLayer, 'displayed'>
): NormalizedVectorLayer => {
  const legacyEvidence = uniqueStrings([
    ...(legacy?.positives ?? []),
    ...(legacy?.negatives ?? []),
  ]).length;
  const evidenceCount = Math.max(
    0,
    Math.trunc(finiteNumber(layer?.evidenceCount, layerName === 'trait' ? legacyEvidence : 0))
  );
  const confidence = clamp01(
    finiteNumber(
      layer?.confidence,
      layerName === 'trait' && legacyEvidence > 0 ? confidenceFromEvidence(legacyEvidence) : 0
    )
  );

  return {
    level: clamp01(finiteNumber(layer?.level, layerName === 'trait' ? legacy?.level ?? 0 : 0)),
    confidence,
    evidenceCount,
    positives: uniqueStrings(layer?.positives ?? (layerName === 'trait' ? legacy?.positives : [])),
    negatives: uniqueStrings(layer?.negatives ?? (layerName === 'trait' ? legacy?.negatives : [])),
    lastQuestionnaireId: layer?.lastQuestionnaireId,
    lastSessionId: layer?.lastSessionId,
    scoringVersion: scoringVersion(layer?.scoringVersion),
    updatedAt: layer?.updatedAt,
  };
};

export const recalculateDisplayedVector = (
  trait: NormalizedVectorLayer,
  state?: NormalizedVectorLayer
): NormalizedDisplayedVector => {
  if (
    trait.confidence < DEFAULT_SCORING_CONFIG.lowConfidenceThreshold ||
    trait.evidenceCount < 5
  ) {
    return {
      level: trait.level,
      confidence: trait.confidence,
      source: 'insufficient_data',
      updatedAt: trait.updatedAt,
    };
  }

  if (
    state &&
    state.confidence >= DEFAULT_SCORING_CONFIG.lowConfidenceThreshold &&
    state.evidenceCount > 0
  ) {
    return {
      level: clamp01(trait.level * 0.8 + state.level * 0.2),
      confidence: Math.min(trait.confidence, state.confidence),
      source: 'state_adjusted',
      updatedAt: state.updatedAt ?? trait.updatedAt,
    };
  }

  return {
    level: trait.level,
    confidence: trait.confidence,
    source: 'trait',
    updatedAt: trait.updatedAt,
  };
};

export const readLegacyOrLayeredAxis = (
  source: UserVectorSource,
  axis: Axis
): NormalizedAxisVector => {
  const vector = source.vectors?.[axis];
  const trait = normalizeLayer(vector?.trait, vector, 'trait');
  const state = normalizeLayer(vector?.state, vector, 'state');
  const matching = normalizeLayer(vector?.matching, vector, 'matching');
  const displayed = vector?.displayed
    ? {
        level: clamp01(finiteNumber(vector.displayed.level, trait.level)),
        confidence: clamp01(finiteNumber(vector.displayed.confidence, trait.confidence)),
        source: vector.displayed.source ?? recalculateDisplayedVector(trait, state).source,
        updatedAt: vector.displayed.updatedAt,
      }
    : recalculateDisplayedVector(trait, state);

  return {
    trait,
    state,
    matching,
    displayed,
  };
};

export const readAxisLayer = (
  source: UserVectorSource,
  axis: Axis,
  layer: Exclude<VectorLayer, 'displayed'>
): NormalizedVectorLayer => readLegacyOrLayeredAxis(source, axis)[layer];

export const readDisplayedAxis = (
  source: UserVectorSource,
  axis: Axis
): NormalizedDisplayedVector => readLegacyOrLayeredAxis(source, axis).displayed;

export const normalizeUserVectors = (
  source: UserVectorSource
): Record<Axis, NormalizedAxisVector> =>
  AXES.reduce<Record<Axis, NormalizedAxisVector>>(
    (acc, axis) => {
      acc[axis] = readLegacyOrLayeredAxis(source, axis);
      return acc;
    },
    {
      communication: readLegacyOrLayeredAxis(source, 'communication'),
      domestic: readLegacyOrLayeredAxis(source, 'domestic'),
      personalViews: readLegacyOrLayeredAxis(source, 'personalViews'),
      finance: readLegacyOrLayeredAxis(source, 'finance'),
      sexuality: readLegacyOrLayeredAxis(source, 'sexuality'),
      psyche: readLegacyOrLayeredAxis(source, 'psyche'),
    }
  );

const normalizePolarity = (polarity: ScoringQuestion['polarity']): 1 | -1 | 0 => {
  if (polarity === '-' || polarity === -1) return -1;
  if (polarity === 'neutral') return 0;
  return 1;
};

const scaleType = (scale: ScoringScale | undefined): ScaleKind => {
  if (!scale) return 'likert5';
  return typeof scale === 'string' ? scale : scale.type;
};

const numericRaw = (value: number | string | boolean): number | undefined => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mappedAnswer = (
  question: ScoringQuestion,
  rawValue: number | string | boolean
): { target01: number; facetSignal: ScoredAnswer['facetSignal'] } | null => {
  const entries = question.map;
  if (!entries || entries.length === 0) return null;

  const first = entries[0];
  if (typeof first === 'number') {
    const raw = numericRaw(rawValue);
    if (raw === undefined) return null;
    const numericEntries = entries as number[];
    const index = Math.max(0, Math.min(Math.trunc(raw) - 1, numericEntries.length - 1));
    const contribution = numericEntries[index] ?? 0;
    const maxAbs = numericEntries.reduce((acc, item) => Math.max(acc, Math.abs(item)), 1);
    const normalized = clamp(contribution / Math.max(maxAbs, 1), -1, 1);
    const signed = normalized * normalizePolarity(question.polarity);
    return {
      target01: clamp01((signed + 1) / 2),
      facetSignal: signed >= 2 / 3 ? 'positive' : signed <= -2 / 3 ? 'negative' : 'neutral',
    };
  }

  const stringRaw = String(rawValue);
  const entry = (entries as ScoringMapEntry[]).find(
    (item) => String(item.answerValue) === stringRaw
  );
  if (!entry) return null;

  const base =
    typeof entry.contribution === 'number'
      ? (clamp(entry.contribution, -1, 1) + 1) / 2
      : entry.normalized;
  return {
    target01: clamp01(base),
    facetSignal: entry.facetSignal ?? 'neutral',
  };
};

export const normalizeAnswer = (
  question: ScoringQuestion,
  rawValue: number | string | boolean
): number => {
  const mapped = mappedAnswer(question, rawValue);
  if (mapped) {
    return question.reverseScoring ? 1 - mapped.target01 : mapped.target01;
  }

  const raw = numericRaw(rawValue);
  if (raw === undefined) return 0.5;

  const scale = question.scale;
  const kind = scaleType(scale);
  const min = typeof scale === 'object' ? finiteNumber(scale.min, kind === 'slider_0_100' ? 0 : 1) : kind === 'slider_0_100' ? 0 : 1;
  const max = typeof scale === 'object' ? finiteNumber(scale.max, kind === 'slider_0_100' ? 100 : 5) : kind === 'slider_0_100' ? 100 : kind === 'bool' || kind === 'yes_no' ? 1 : 5;

  if (kind === 'bool' || kind === 'yes_no') {
    return question.reverseScoring ? 1 - clamp01(raw) : clamp01(raw);
  }

  const normalized01 = clamp01((raw - min) / Math.max(max - min, EPSILON));
  const polarity = normalizePolarity(question.polarity);
  if (polarity === 0) return 0.5;

  const centered = normalized01 * 2 - 1;
  const signed = centered * polarity;
  const target01 = clamp01((signed + 1) / 2);
  return question.reverseScoring ? 1 - target01 : target01;
};

export const scoreAnswer = (
  question: ScoringQuestion,
  answer: ScoringAnswerInput
): ScoredAnswer | null => {
  const weight = finiteNumber(question.weight, 1);
  if (weight <= 0) return null;

  const mapped = mappedAnswer(question, answer.ui);
  const target01 = mapped
    ? question.reverseScoring
      ? 1 - mapped.target01
      : mapped.target01
    : normalizeAnswer(question, answer.ui);
  const centered = target01 * 2 - 1;
  const facetSignal =
    mapped?.facetSignal ??
    (centered >= 2 / 3 ? 'positive' : centered <= -2 / 3 ? 'negative' : 'neutral');

  return {
    axis: question.axis,
    facet: question.facet ?? '',
    target01,
    weight,
    confidenceWeight: clamp01(finiteNumber(question.confidenceWeight, 1)),
    facetSignal,
  };
};

export const scoreAnswersToAxisTargets = (
  answers: ScoringAnswerInput[],
  questionById: Record<string, ScoringQuestion>
): AxisTargetsResult => {
  const sums: Partial<Record<Axis, number>> = {};
  const weights: Partial<Record<Axis, number>> = {};
  const confidenceSums: Partial<Record<Axis, number>> = {};
  const positives: Partial<Record<Axis, Set<string>>> = {};
  const negatives: Partial<Record<Axis, Set<string>>> = {};
  const evidence: Partial<Record<Axis, number>> = {};
  let matchedCount = 0;
  let invalidCount = 0;

  for (const answer of answers) {
    const question = questionById[answer.qid];
    if (!question) {
      invalidCount += 1;
      continue;
    }

    const scored = scoreAnswer(question, answer);
    if (!scored) {
      invalidCount += 1;
      continue;
    }

    matchedCount += 1;
    sums[scored.axis] = (sums[scored.axis] ?? 0) + scored.target01 * scored.weight;
    weights[scored.axis] = (weights[scored.axis] ?? 0) + scored.weight;
    confidenceSums[scored.axis] =
      (confidenceSums[scored.axis] ?? 0) + scored.confidenceWeight;
    evidence[scored.axis] = (evidence[scored.axis] ?? 0) + 1;

    if (scored.facet && scored.facetSignal === 'positive') {
      positives[scored.axis] = positives[scored.axis] ?? new Set<string>();
      positives[scored.axis]?.add(scored.facet);
    }
    if (scored.facet && scored.facetSignal === 'negative') {
      negatives[scored.axis] = negatives[scored.axis] ?? new Set<string>();
      negatives[scored.axis]?.add(scored.facet);
    }
  }

  const targetsByAxis: Partial<Record<Axis, AxisTarget>> = {};
  for (const axis of AXES) {
    const axisWeight = weights[axis] ?? 0;
    if (axisWeight <= 0) continue;
    const axisEvidence = evidence[axis] ?? 0;
    targetsByAxis[axis] = {
      axis,
      target01: clamp01((sums[axis] ?? 0) / axisWeight),
      evidenceCount: axisEvidence,
      questionConfidence: clamp01((confidenceSums[axis] ?? axisEvidence) / Math.max(axisEvidence, 1)),
      positives: Array.from(positives[axis] ?? []).sort(),
      negatives: Array.from(negatives[axis] ?? []).sort(),
    };
  }

  return {
    answeredCount: answers.length,
    matchedCount,
    invalidCount,
    targetsByAxis,
  };
};

export const calculateConfidence = (
  evidenceCount: number,
  questionConfidence = 1
): number => {
  const evidenceConfidence =
    1 - Math.exp(-Math.max(0, evidenceCount) / DEFAULT_SCORING_CONFIG.confidenceK);
  return clamp01(evidenceConfidence * clamp01(questionConfidence));
};

const maxStepForLayer = (layer: Exclude<VectorLayer, 'displayed'>): number => {
  if (layer === 'state') return DEFAULT_SCORING_CONFIG.maxStepState;
  if (layer === 'matching') return DEFAULT_SCORING_CONFIG.maxStepMatching;
  return DEFAULT_SCORING_CONFIG.maxStepTrait;
};

const cooldownHoursForLayer = (layer: Exclude<VectorLayer, 'displayed'>): number => {
  if (layer === 'state') return DEFAULT_SCORING_CONFIG.cooldownHoursState;
  if (layer === 'matching') return DEFAULT_SCORING_CONFIG.cooldownHoursTrait;
  return DEFAULT_SCORING_CONFIG.cooldownHoursTrait;
};

export const applyVectorDelta = (input: {
  current: NormalizedVectorLayer;
  target: AxisTarget;
  layer: Exclude<VectorLayer, 'displayed'>;
  now?: Date;
}): AppliedVectorDelta => {
  const now = input.now ?? new Date();
  const current = input.current;
  const sessionConfidence = calculateConfidence(
    input.target.evidenceCount,
    input.target.questionConfidence
  );
  const hoursSinceLastUpdate = current.updatedAt
    ? Math.max(0, (now.getTime() - current.updatedAt.getTime()) / HOUR_MS)
    : cooldownHoursForLayer(input.layer);
  const cooldownFactor = clamp(
    hoursSinceLastUpdate / cooldownHoursForLayer(input.layer),
    0.25,
    1
  );

  const proposedDelta = input.target.target01 - current.level;
  const rawDelta =
    proposedDelta *
    DEFAULT_SCORING_CONFIG.alphaBase *
    sessionConfidence *
    cooldownFactor;
  const finalDelta = clamp(rawDelta, -maxStepForLayer(input.layer), maxStepForLayer(input.layer));
  const afterLevel = clamp01(current.level + finalDelta);
  const afterEvidence = Math.max(0, current.evidenceCount + input.target.evidenceCount);
  const afterConfidence = Math.max(
    current.confidence,
    calculateConfidence(afterEvidence, input.target.questionConfidence)
  );
  const after: NormalizedVectorLayer = {
    ...current,
    level: afterLevel,
    confidence: afterConfidence,
    evidenceCount: afterEvidence,
    positives: uniqueStrings([...current.positives, ...input.target.positives]),
    negatives: uniqueStrings([...current.negatives, ...input.target.negatives]),
    scoringVersion: DEFAULT_SCORING_CONFIG.key,
    updatedAt: now,
  };

  return {
    before: current,
    after,
    displayed: recalculateDisplayedVector(input.layer === 'trait' ? after : current),
    delta: after.level - current.level,
    sessionConfidence,
    cooldownFactor,
    scoringVersion: DEFAULT_SCORING_CONFIG.key,
  };
};

export const createVectorSnapshot = (input: {
  userId: string;
  pairId?: string;
  layer: VectorLayer;
  axis: Axis;
  before: Pick<UserVectorLayerData, 'level' | 'confidence' | 'evidenceCount'>;
  after: Pick<UserVectorLayerData, 'level' | 'confidence' | 'evidenceCount'>;
  reason: {
    source: VectorSnapshotReasonSource;
    questionnaireId?: string;
    sessionId?: string;
    questionIds?: string[];
  };
  scoringVersion?: string;
  createdAt?: Date;
}): VectorSnapshotType => ({
  userId: input.userId,
  pairId: input.pairId,
  layer: input.layer,
  axis: input.axis,
  before: {
    level: clamp01(input.before.level),
    confidence: clamp01(input.before.confidence),
    evidenceCount: Math.max(0, input.before.evidenceCount),
  },
  after: {
    level: clamp01(input.after.level),
    confidence: clamp01(input.after.confidence),
    evidenceCount: Math.max(0, input.after.evidenceCount),
  },
  delta: clamp01(input.after.level) - clamp01(input.before.level),
  reason: input.reason,
  scoringVersion: scoringVersion(input.scoringVersion),
  createdAt: input.createdAt ?? new Date(),
});

export const confidenceLabel = (confidence: number): ConfidenceLabel => {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
};

export const dataStatus = (input: {
  confidence: number;
  evidenceCount: number;
}): DataStatus => {
  if (input.evidenceCount <= 0) return 'missing';
  if (
    input.confidence < DEFAULT_SCORING_CONFIG.lowConfidenceThreshold ||
    input.evidenceCount < 5
  ) {
    return 'low_confidence';
  }
  return 'enough';
};
