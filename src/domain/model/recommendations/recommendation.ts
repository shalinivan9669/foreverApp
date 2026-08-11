import type {
  ActionContraindication,
  ActionDefinition,
} from '@/domain/model/definitions/definitionTypes';
import type { RelationshipContext } from '@/domain/model/pair/strategyTypes';
import type {
  IndividualFactorSnapshot,
  PairFactorEvaluationSnapshot,
  PairFactorSnapshot,
} from '@/domain/model/snapshots/snapshots';
import type { FactorValue, SkillLevel } from '@/domain/model/values/factorValue';

export type RecommendationFactorSnapshot =
  | IndividualFactorSnapshot
  | PairFactorSnapshot;

export type ActionRecommendationReasonCode =
  | 'CONTEXT_MATCH'
  | 'TARGET_SIGNAL_AVAILABLE'
  | 'ACTIONABLE_PAIR_EVALUATION'
  | 'LOW_DIFFICULTY_PREFERRED'
  | 'CONTEXT_NOT_SUPPORTED'
  | 'NO_TARGET_SIGNAL'
  | 'SKILL_DATA_UNAVAILABLE'
  | 'SKILL_LEVEL_TOO_LOW'
  | 'CONTRAINDICATION_MET'
  | 'CONTRAINDICATION_DATA_UNAVAILABLE'
  | 'ACTION_EXPLICITLY_BLOCKED';

export type ActionRecommendation = {
  actionKey: string;
  actionVersion: number;
  rank: number;
  internalPriority: number;
  reasonCodes: readonly ActionRecommendationReasonCode[];
  targetFactorKeys: readonly string[];
};

export type ActionRecommendationResult = {
  recommendations: readonly ActionRecommendation[];
  excluded: readonly {
    actionKey: string;
    reasonCodes: readonly ActionRecommendationReasonCode[];
  }[];
};

export type RecommendActionsInput = {
  actions: readonly ActionDefinition[];
  context: RelationshipContext;
  factorSnapshots: readonly RecommendationFactorSnapshot[];
  pairEvaluations: readonly PairFactorEvaluationSnapshot[];
  blockedActionKeys: readonly string[];
  limit: number;
};

const numericValue = (value: FactorValue): number | undefined => {
  switch (value.kind) {
    case 'SCALAR':
      return value.value;
    case 'MASTERY':
      return value.score01;
    case 'BOOLEAN':
      return value.value ? 1 : 0;
    case 'RANGE':
      return (value.low + value.high) / 2;
    case 'CATEGORY':
    case 'ORDINAL':
    case 'CONSTRAINT':
    case 'SET':
    case 'TEXT':
    case 'MISSING':
    case 'INVALID':
    case 'UNKNOWN':
    case 'INSUFFICIENT_DATA':
      return undefined;
  }
};

const skillRank = (level: SkillLevel): number => {
  switch (level) {
    case 'BASIC':
      return 1;
    case 'INTERMEDIATE':
      return 2;
    case 'ADVANCED':
      return 3;
  }
};

const latestFactorSnapshot = (
  snapshots: readonly RecommendationFactorSnapshot[],
  factorKey: string
): RecommendationFactorSnapshot | undefined =>
  snapshots
    .filter((snapshot) => snapshot.factorKey === factorKey)
    .sort(
      (a, b) =>
        b.revision - a.revision ||
        b.calculatedAt.getTime() - a.calculatedAt.getTime() ||
        a.snapshotId.localeCompare(b.snapshotId)
    )[0];

const contraindicationResult = (
  contraindication: ActionContraindication,
  snapshots: readonly RecommendationFactorSnapshot[],
  pairEvaluations: readonly PairFactorEvaluationSnapshot[],
  context: RelationshipContext
): 'CLEAR' | 'MET' | 'DATA_UNAVAILABLE' => {
  const snapshot = latestFactorSnapshot(snapshots, contraindication.factorKey);
  if (!snapshot) {
    const evaluation = pairEvaluations
      .filter(
        (candidate) =>
          candidate.factorKey === contraindication.factorKey &&
          candidate.context === context
      )
      .sort(
        (a, b) =>
          b.revision - a.revision ||
          b.calculatedAt.getTime() - a.calculatedAt.getTime() ||
          a.snapshotId.localeCompare(b.snapshotId)
      )[0];
    if (
      contraindication.type !== 'FACTOR_STATUS' &&
      evaluation?.evaluation.status === 'ALIGNED'
    ) {
      return 'CLEAR';
    }
    return 'DATA_UNAVAILABLE';
  }
  if (contraindication.type === 'FACTOR_STATUS') {
    return snapshot.status === contraindication.status ? 'MET' : 'CLEAR';
  }
  if (snapshot.status !== 'AVAILABLE') return 'DATA_UNAVAILABLE';
  const value = numericValue(snapshot.value);
  if (value === undefined) return 'DATA_UNAVAILABLE';
  if (contraindication.type === 'FACTOR_AT_OR_ABOVE') {
    return value >= contraindication.threshold ? 'MET' : 'CLEAR';
  }
  return value <= contraindication.threshold ? 'MET' : 'CLEAR';
};

const actionableEvaluationWeight = (
  snapshot: PairFactorEvaluationSnapshot
): number => {
  switch (snapshot.evaluation.status) {
    case 'CONSTRAINT_CONFLICT':
    case 'REQUIRES_DISCUSSION':
    case 'TENSION':
      return 1;
    case 'WORKABLE_DIFFERENCE':
      return 0.65;
    case 'INSUFFICIENT_DATA':
      return 0;
    case 'COMPLEMENTARY':
    case 'ALIGNED':
      return 0.15;
  }
};

const assessAction = (
  action: ActionDefinition,
  input: RecommendActionsInput
):
  | { eligible: true; priority: number; reasons: ActionRecommendationReasonCode[] }
  | { eligible: false; reasons: ActionRecommendationReasonCode[] } => {
  const reasons: ActionRecommendationReasonCode[] = [];
  if (!action.contexts.includes(input.context)) {
    return { eligible: false, reasons: ['CONTEXT_NOT_SUPPORTED'] };
  }
  reasons.push('CONTEXT_MATCH');
  if (input.blockedActionKeys.includes(action.key)) {
    return { eligible: false, reasons: ['ACTION_EXPLICITLY_BLOCKED'] };
  }

  for (const contraindication of action.contraindications) {
    const contraindicationStatus = contraindicationResult(
      contraindication,
      input.factorSnapshots,
      input.pairEvaluations,
      input.context
    );
    if (contraindicationStatus === 'MET') {
      return { eligible: false, reasons: ['CONTRAINDICATION_MET'] };
    }
    if (contraindicationStatus === 'DATA_UNAVAILABLE') {
      return {
        eligible: false,
        reasons: ['CONTRAINDICATION_DATA_UNAVAILABLE'],
      };
    }
  }

  if (action.minimumSkillLevel && action.minimumSkillFactorKey) {
    const skill = latestFactorSnapshot(
      input.factorSnapshots,
      action.minimumSkillFactorKey
    );
    if (
      !skill ||
      skill.status !== 'AVAILABLE' ||
      skill.value.kind !== 'MASTERY'
    ) {
      return { eligible: false, reasons: ['SKILL_DATA_UNAVAILABLE'] };
    }
    if (skillRank(skill.value.level) < skillRank(action.minimumSkillLevel)) {
      return { eligible: false, reasons: ['SKILL_LEVEL_TOO_LOW'] };
    }
  }

  const targets = action.targetFactors
    .map((factorKey) => latestFactorSnapshot(input.factorSnapshots, factorKey))
    .filter((snapshot): snapshot is RecommendationFactorSnapshot =>
      Boolean(snapshot && snapshot.status === 'AVAILABLE')
    );
  const evaluations = input.pairEvaluations.filter(
    (snapshot) =>
      action.targetFactors.includes(snapshot.factorKey) &&
      snapshot.context === input.context
  );
  if (targets.length === 0 && evaluations.length === 0) {
    return { eligible: false, reasons: ['NO_TARGET_SIGNAL'] };
  }

  if (targets.length > 0) reasons.push('TARGET_SIGNAL_AVAILABLE');
  const evaluationPriority = evaluations.reduce(
    (sum, snapshot) =>
      sum + actionableEvaluationWeight(snapshot) * snapshot.evaluation.confidence,
    0
  );
  if (evaluationPriority > 0.15) reasons.push('ACTIONABLE_PAIR_EVALUATION');
  if (action.difficulty <= 2) reasons.push('LOW_DIFFICULTY_PREFERRED');
  const targetConfidence = targets.length === 0
    ? 0
    : targets.reduce((sum, snapshot) => sum + snapshot.metrics.confidence, 0) /
      targets.length;
  const priority =
    targetConfidence * 0.45 +
    Math.min(1, evaluationPriority) * 0.45 +
    ((6 - action.difficulty) / 5) * 0.1;
  return { eligible: true, priority, reasons };
};

export function recommendActions(
  input: RecommendActionsInput
): ActionRecommendationResult {
  const eligible: {
    action: ActionDefinition;
    priority: number;
    reasons: ActionRecommendationReasonCode[];
  }[] = [];
  const excluded: {
    actionKey: string;
    reasonCodes: readonly ActionRecommendationReasonCode[];
  }[] = [];

  for (const action of [...input.actions].sort((a, b) => a.key.localeCompare(b.key))) {
    const assessment = assessAction(action, input);
    if (assessment.eligible) {
      eligible.push({ action, priority: assessment.priority, reasons: assessment.reasons });
    } else {
      excluded.push({ actionKey: action.key, reasonCodes: assessment.reasons });
    }
  }

  const recommendations = eligible
    .sort(
      (a, b) =>
        b.priority - a.priority || a.action.key.localeCompare(b.action.key)
    )
    .slice(0, Math.max(0, input.limit))
    .map((item, index): ActionRecommendation => ({
      actionKey: item.action.key,
      actionVersion: item.action.actionVersion,
      rank: index + 1,
      internalPriority: Number(item.priority.toFixed(6)),
      reasonCodes: [...new Set(item.reasons)].sort(),
      targetFactorKeys: [...item.action.targetFactors].sort(),
    }));

  return { recommendations, excluded };
}
