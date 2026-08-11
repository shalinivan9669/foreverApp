import {
  factorValueCanonicalKey,
  isAvailableFactorValue,
  type AvailableFactorValue,
  type FactorValue,
} from '@/domain/model/values/factorValue';
import type {
  CustomMatrixEntry,
  DirectionalExpectation,
  PairEvaluationContext,
  PairEvaluationReasonCode,
  PairEvaluationStatus,
  PairFactorInput,
  PairStrategyDefinition,
  PairStrategyEvaluation,
  PairStrategyValidation,
  RoleContribution,
  RoleCoverageContext,
} from '@/domain/model/pair/strategyTypes';

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const isFiniteBetween = (
  value: number,
  minimum: number,
  maximum: number
): boolean => Number.isFinite(value) && value >= minimum && value <= maximum;

const areFinite = (...values: readonly number[]): boolean =>
  values.every(Number.isFinite);

const isValidDirectionalExpectation = (
  expectation: DirectionalExpectation
): boolean =>
  areFinite(expectation.minimum, expectation.maximum) &&
  expectation.minimum <= expectation.maximum;

const isValidRoleContribution = (role: RoleContribution): boolean =>
  typeof role.roleKey === 'string' &&
  role.roleKey.trim().length > 0 &&
  isFiniteBetween(role.preference01, 0, 1) &&
  isFiniteBetween(role.capability01, 0, 1) &&
  isFiniteBetween(role.load01, 0, 1);

const hasUniqueRoleKeys = (roles: readonly RoleContribution[]): boolean =>
  new Set(roles.map((role) => role.roleKey)).size === roles.length;

const isValidRoleCoverageContext = (
  context: RoleCoverageContext
): boolean =>
  isFiniteBetween(context.fairnessConfidence, 0, 1) &&
  context.partnerA.length > 0 &&
  context.partnerB.length > 0 &&
  hasUniqueRoleKeys(context.partnerA) &&
  hasUniqueRoleKeys(context.partnerB) &&
  context.partnerA.every(isValidRoleContribution) &&
  context.partnerB.every(isValidRoleContribution);

const isRuntimeValidAvailableValue = (value: AvailableFactorValue): boolean => {
  switch (value.kind) {
    case 'SCALAR':
      return Number.isFinite(value.value);
    case 'ORDINAL':
      return Number.isFinite(value.rank);
    case 'RANGE':
      return areFinite(value.low, value.high) && value.low <= value.high;
    case 'MASTERY':
      return isFiniteBetween(value.score01, 0, 1);
    case 'CATEGORY':
    case 'CONSTRAINT':
    case 'TEXT':
      return typeof value.value === 'string';
    case 'SET':
      return value.values.every((entry) => typeof entry === 'string');
    case 'BOOLEAN':
      return typeof value.value === 'boolean';
  }
};

const isRuntimeValidPairInput = (input: PairFactorInput): boolean =>
  isFiniteBetween(input.confidence, 0, 1) &&
  (!isAvailableFactorValue(input.value) ||
    isRuntimeValidAvailableValue(input.value));

const numericValue = (value: AvailableFactorValue): number | undefined => {
  switch (value.kind) {
    case 'SCALAR':
      return value.value;
    case 'BOOLEAN':
      return value.value ? 1 : 0;
    case 'RANGE':
      return (value.low + value.high) / 2;
    case 'MASTERY':
      return value.score01;
    case 'ORDINAL':
      return value.rank;
    case 'CATEGORY':
    case 'CONSTRAINT':
    case 'SET':
    case 'TEXT':
      return undefined;
  }
};

const inputReason = (value: FactorValue): PairEvaluationReasonCode => {
  switch (value.kind) {
    case 'MISSING':
      return 'INPUT_MISSING';
    case 'INVALID':
      return 'INPUT_INVALID';
    case 'UNKNOWN':
      return 'INPUT_UNKNOWN';
    case 'INSUFFICIENT_DATA':
      return 'INPUT_INSUFFICIENT_DATA';
    default:
      return 'VALUE_TYPE_UNSUPPORTED';
  }
};

const unavailableEvaluation = (
  definition: PairStrategyDefinition,
  reasonCodes: readonly PairEvaluationReasonCode[],
  confidence: number
): PairStrategyEvaluation => ({
  strategy: definition.config.type,
  context: definition.context,
  status: 'INSUFFICIENT_DATA',
  confidence: clamp01(confidence),
  reasonCodes,
  actionability: 'NONE',
});

const result = (
  definition: PairStrategyDefinition,
  status: PairEvaluationStatus,
  fit: number,
  confidence: number,
  reasonCodes: readonly PairEvaluationReasonCode[]
): PairStrategyEvaluation => ({
  strategy: definition.config.type,
  context: definition.context,
  status,
  internalFit: clamp01(fit),
  confidence: clamp01(confidence),
  reasonCodes,
  actionability:
    status === 'ALIGNED' || status === 'COMPLEMENTARY'
      ? 'NONE'
      : status === 'REQUIRES_DISCUSSION'
        ? 'NEGOTIATION'
        : definition.actionability,
});

const distanceFromRange = (
  value: number,
  expectation: DirectionalExpectation
): number => {
  if (value < expectation.minimum) return expectation.minimum - value;
  if (value > expectation.maximum) return value - expectation.maximum;
  return 0;
};

const rangeFit = (
  value: number,
  expectation: DirectionalExpectation,
  maximumDistance: number
): number => {
  const distance = distanceFromRange(value, expectation);
  return distance === 0
    ? 1
    : clamp01(1 - distance / Math.max(maximumDistance, Number.EPSILON));
};

const sortedRoleKeys = (context: RoleCoverageContext): readonly string[] =>
  [...new Set([
    ...context.partnerA.map((item) => item.roleKey),
    ...context.partnerB.map((item) => item.roleKey),
  ])].sort();

const findRole = (
  roles: readonly RoleContribution[],
  key: string
): RoleContribution | undefined => roles.find((role) => role.roleKey === key);

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const calculateRoleMetrics = (context: RoleCoverageContext) => {
  const roleKeys = sortedRoleKeys(context);
  const coverage = average(
    roleKeys.map((roleKey) => {
      const a = findRole(context.partnerA, roleKey);
      const b = findRole(context.partnerB, roleKey);
      return Math.max(a?.capability01 ?? 0, b?.capability01 ?? 0);
    })
  );
  const preferenceSatisfaction = average(
    roleKeys.flatMap((roleKey) => {
      const a = findRole(context.partnerA, roleKey);
      const b = findRole(context.partnerB, roleKey);
      return [
        (a?.preference01 ?? 0) * (a?.capability01 ?? 0),
        (b?.preference01 ?? 0) * (b?.capability01 ?? 0),
      ];
    })
  );
  const loadA = context.partnerA.reduce((sum, role) => sum + role.load01, 0);
  const loadB = context.partnerB.reduce((sum, role) => sum + role.load01, 0);
  const loadImbalance = Math.abs(loadA - loadB) / Math.max(loadA + loadB, 1);

  return {
    coverage: clamp01(coverage),
    loadImbalance: clamp01(loadImbalance),
    preferenceSatisfaction: clamp01(preferenceSatisfaction),
  };
};

const reciprocalMatrixEntry = (
  entries: readonly CustomMatrixEntry[],
  entry: CustomMatrixEntry
): CustomMatrixEntry | undefined =>
  entries.find((candidate) => candidate.a === entry.b && candidate.b === entry.a);

export function validatePairStrategyDefinition(
  definition: PairStrategyDefinition
): PairStrategyValidation {
  const reasons: string[] = [];
  if (!Number.isInteger(definition.strategyVersion) || definition.strategyVersion < 1) {
    reasons.push('STRATEGY_VERSION_INVALID');
  }
  if (
    definition.directionality !== 'SYMMETRIC' &&
    definition.directionality !== 'DIRECTIONAL'
  ) {
    reasons.push('DIRECTIONALITY_INVALID');
  }
  if (!isFiniteBetween(definition.minimumConfidence, 0, 1)) {
    reasons.push('MINIMUM_CONFIDENCE_OUT_OF_RANGE');
  }

  const config = definition.config;
  if (
    (config.type === 'DIRECTIONAL_EXPECTATION') !==
    (definition.directionality === 'DIRECTIONAL')
  ) {
    reasons.push('STRATEGY_DIRECTIONALITY_MISMATCH');
  }
  switch (config.type) {
    case 'SIMILARITY':
      if (!Number.isFinite(config.maximumDistance) || config.maximumDistance <= 0) {
        reasons.push('MAXIMUM_DISTANCE_INVALID');
      }
      break;
    case 'BOUNDED_GAP':
      if (
        !areFinite(config.comfortableGap, config.maximumGap) ||
        config.comfortableGap < 0 ||
        config.maximumGap <= config.comfortableGap
      ) {
        reasons.push('GAP_BOUNDS_INVALID');
      }
      break;
    case 'TARGET_RANGE':
      if (
        !areFinite(config.targetMin, config.targetMax) ||
        config.targetMin > config.targetMax
      ) {
        reasons.push('TARGET_RANGE_INVALID');
      }
      break;
    case 'COMPLEMENT':
      if (
        !areFinite(config.idealGap, config.tolerance) ||
        config.idealGap < 0 ||
        config.tolerance <= 0
      ) {
        reasons.push('COMPLEMENT_CONFIG_INVALID');
      }
      break;
    case 'BOUNDED_COMPLEMENT':
      if (
        !areFinite(
          config.minimumUsefulGap,
          config.idealGap,
          config.maximumGap
        ) ||
        config.minimumUsefulGap < 0 ||
        config.minimumUsefulGap > config.idealGap ||
        config.idealGap >= config.maximumGap
      ) {
        reasons.push('COMPLEMENT_BOUNDS_INVALID');
      }
      break;
    case 'MINIMUM_BOTH':
      if (!Number.isFinite(config.minimum)) reasons.push('MINIMUM_INVALID');
      break;
    case 'ROLE_COVERAGE':
      if (!isFiniteBetween(config.minimumCoverage, 0, 1)) {
        reasons.push('MINIMUM_COVERAGE_INVALID');
      }
      if (!isFiniteBetween(config.maximumLoadImbalance, 0, 1)) {
        reasons.push('MAXIMUM_LOAD_IMBALANCE_INVALID');
      }
      break;
    case 'DIRECTIONAL_EXPECTATION':
      if (
        !Number.isFinite(config.maximumDistanceFromRange) ||
        config.maximumDistanceFromRange <= 0
      ) {
        reasons.push('MAXIMUM_DISTANCE_INVALID');
      }
      break;
    case 'CUSTOM_MATRIX': {
      if (config.entries.length === 0) reasons.push('CUSTOM_MATRIX_EMPTY');
      const keys = new Set<string>();
      for (const entry of config.entries) {
        const key = `${entry.a}\u0000${entry.b}`;
        if (keys.has(key)) reasons.push('CUSTOM_MATRIX_DUPLICATE_ENTRY');
        keys.add(key);
        if (!isFiniteBetween(entry.fit, 0, 1)) {
          reasons.push('CUSTOM_MATRIX_FIT_INVALID');
        }
        const reciprocal = reciprocalMatrixEntry(config.entries, entry);
        if (
          !reciprocal ||
          reciprocal.fit !== entry.fit ||
          reciprocal.status !== entry.status
        ) {
          reasons.push('CUSTOM_MATRIX_NOT_SYMMETRIC');
        }
      }
      break;
    }
    case 'HARD_CONSTRAINT': {
      if (config.allowedPairs.length === 0) reasons.push('ALLOWED_PAIRS_EMPTY');
      const keys = new Set(
        config.allowedPairs.map((pair) => `${pair.a}\u0000${pair.b}`)
      );
      for (const pair of config.allowedPairs) {
        if (!keys.has(`${pair.b}\u0000${pair.a}`)) {
          reasons.push('HARD_CONSTRAINT_NOT_SYMMETRIC');
        }
      }
      break;
    }
  }

  return reasons.length === 0
    ? { valid: true }
    : { valid: false, reasonCodes: [...new Set(reasons)].sort() };
}

export function evaluatePairStrategy(
  definition: PairStrategyDefinition,
  partnerA: PairFactorInput,
  partnerB: PairFactorInput,
  context: PairEvaluationContext
): PairStrategyEvaluation {
  const validation = validatePairStrategyDefinition(definition);
  if (!validation.valid) {
    return unavailableEvaluation(
      definition,
      ['STRATEGY_DEFINITION_INVALID'],
      0
    );
  }

  if (
    !isRuntimeValidPairInput(partnerA) ||
    !isRuntimeValidPairInput(partnerB)
  ) {
    return unavailableEvaluation(definition, ['INPUT_INVALID'], 0);
  }

  const inputConfidence = Math.min(
    clamp01(partnerA.confidence),
    clamp01(partnerB.confidence)
  );
  if (context.relationshipContext !== definition.context) {
    return unavailableEvaluation(
      definition,
      ['RELATIONSHIP_CONTEXT_MISMATCH'],
      inputConfidence
    );
  }

  const aValue = partnerA.value;
  const bValue = partnerB.value;
  if (!isAvailableFactorValue(aValue) || !isAvailableFactorValue(bValue)) {
    const unavailableReasons: PairEvaluationReasonCode[] = [];
    if (!isAvailableFactorValue(aValue)) {
      unavailableReasons.push(inputReason(aValue));
    }
    if (!isAvailableFactorValue(bValue)) {
      unavailableReasons.push(inputReason(bValue));
    }
    return unavailableEvaluation(
      definition,
      [...new Set(unavailableReasons)].sort() as PairEvaluationReasonCode[],
      inputConfidence
    );
  }
  if (inputConfidence < definition.minimumConfidence) {
    return unavailableEvaluation(
      definition,
      ['CONFIDENCE_BELOW_MINIMUM'],
      inputConfidence
    );
  }

  const a = numericValue(aValue);
  const b = numericValue(bValue);
  const config = definition.config;

  if (config.type === 'CUSTOM_MATRIX') {
    const aKey = factorValueCanonicalKey(aValue);
    const bKey = factorValueCanonicalKey(bValue);
    const entry = config.entries.find(
      (candidate) => candidate.a === aKey && candidate.b === bKey
    );
    return entry
      ? result(
          definition,
          entry.status,
          entry.fit,
          inputConfidence,
          ['CUSTOM_MATRIX_MATCH']
        )
      : unavailableEvaluation(
          definition,
          ['CUSTOM_MATRIX_ENTRY_MISSING'],
          inputConfidence
        );
  }

  if (config.type === 'HARD_CONSTRAINT') {
    const aKey = factorValueCanonicalKey(aValue);
    const bKey = factorValueCanonicalKey(bValue);
    const allowed = config.allowedPairs.some(
      (pair) => pair.a === aKey && pair.b === bKey
    );
    const conflictStatus = context.relationshipContext === 'DATING'
      ? 'CONSTRAINT_CONFLICT'
      : 'REQUIRES_DISCUSSION';
    const conflictReason = context.relationshipContext === 'DATING'
      ? 'HARD_CONSTRAINT_CONFLICT'
      : 'HARD_CONSTRAINT_REQUIRES_DISCUSSION';
    return result(
      definition,
      allowed ? 'ALIGNED' : conflictStatus,
      allowed ? 1 : 0,
      inputConfidence,
      [allowed ? 'HARD_CONSTRAINT_ALLOWED' : conflictReason]
    );
  }

  if (config.type === 'ROLE_COVERAGE') {
    if (
      !context.roleCoverage ||
      sortedRoleKeys(context.roleCoverage).length === 0
    ) {
      return unavailableEvaluation(
        definition,
        ['ROLE_CONTEXT_MISSING'],
        inputConfidence
      );
    }
    if (!isValidRoleCoverageContext(context.roleCoverage)) {
      return unavailableEvaluation(
        definition,
        ['ROLE_CONTEXT_INVALID'],
        inputConfidence
      );
    }
    const roleMetrics = calculateRoleMetrics(context.roleCoverage);
    const coverageMet = roleMetrics.coverage >= config.minimumCoverage;
    const loadBalanced =
      roleMetrics.loadImbalance <= config.maximumLoadImbalance;
    const status = coverageMet && loadBalanced
      ? 'COMPLEMENTARY'
      : coverageMet
        ? 'TENSION'
        : 'TENSION';
    const evaluation = result(
      definition,
      status,
      Math.min(
        roleMetrics.coverage,
        1 - roleMetrics.loadImbalance,
        roleMetrics.preferenceSatisfaction
      ),
      inputConfidence * context.roleCoverage.fairnessConfidence,
      [
        coverageMet ? 'ROLE_COVERAGE_MET' : 'ROLE_COVERAGE_GAP',
        ...(loadBalanced ? [] : (['ROLE_LOAD_IMBALANCE'] as const)),
      ]
    );
    return { ...evaluation, roleMetrics };
  }

  if (a === undefined || b === undefined) {
    return unavailableEvaluation(
      definition,
      ['VALUE_TYPE_UNSUPPORTED'],
      inputConfidence
    );
  }

  const gap = Math.abs(a - b);
  switch (config.type) {
    case 'SIMILARITY': {
      const fit = clamp01(1 - gap / config.maximumDistance);
      return result(
        definition,
        fit >= 0.8 ? 'ALIGNED' : fit >= 0.4 ? 'WORKABLE_DIFFERENCE' : 'TENSION',
        fit,
        inputConfidence,
        [fit >= 0.8 ? 'VALUES_ALIGNED' : 'VALUES_DIFFER']
      );
    }
    case 'BOUNDED_GAP': {
      const withinComfort = gap <= config.comfortableGap;
      const withinMaximum = gap <= config.maximumGap;
      const fit = withinComfort
        ? 1
        : clamp01(
            1 -
              (gap - config.comfortableGap) /
                (config.maximumGap - config.comfortableGap)
          );
      return result(
        definition,
        withinComfort
          ? 'ALIGNED'
          : withinMaximum
            ? 'WORKABLE_DIFFERENCE'
            : 'TENSION',
        fit,
        inputConfidence,
        [
          withinComfort
            ? 'GAP_WITHIN_COMFORT'
            : withinMaximum
              ? 'GAP_WORKABLE'
              : 'GAP_EXCEEDS_BOUND',
        ]
      );
    }
    case 'TARGET_RANGE': {
      const expectation = {
        minimum: config.targetMin,
        maximum: config.targetMax,
      };
      const aFit = rangeFit(a, expectation, Math.max(config.targetMax - config.targetMin, 1));
      const bFit = rangeFit(b, expectation, Math.max(config.targetMax - config.targetMin, 1));
      const fit = Math.min(aFit, bFit);
      return result(
        definition,
        fit === 1 ? 'ALIGNED' : fit >= 0.5 ? 'WORKABLE_DIFFERENCE' : 'TENSION',
        fit,
        inputConfidence,
        [fit === 1 ? 'TARGET_RANGE_MET' : 'TARGET_RANGE_MISSED']
      );
    }
    case 'COMPLEMENT': {
      const fit = clamp01(1 - Math.abs(gap - config.idealGap) / config.tolerance);
      return result(
        definition,
        fit >= 0.8 ? 'COMPLEMENTARY' : fit >= 0.4 ? 'WORKABLE_DIFFERENCE' : 'TENSION',
        fit,
        inputConfidence,
        [fit >= 0.8 ? 'COMPLEMENT_IDEAL' : 'COMPLEMENT_WORKABLE']
      );
    }
    case 'BOUNDED_COMPLEMENT': {
      const belowUseful = gap < config.minimumUsefulGap;
      const aboveMaximum = gap > config.maximumGap;
      const fit = belowUseful
        ? clamp01(gap / Math.max(config.minimumUsefulGap, Number.EPSILON))
        : aboveMaximum
          ? 0
          : clamp01(
              1 -
                Math.abs(gap - config.idealGap) /
                  Math.max(
                    config.idealGap - config.minimumUsefulGap,
                    config.maximumGap - config.idealGap
                  )
            );
      return result(
        definition,
        aboveMaximum
          ? 'TENSION'
          : fit >= 0.7
            ? 'COMPLEMENTARY'
            : 'WORKABLE_DIFFERENCE',
        fit,
        inputConfidence,
        [
          aboveMaximum
            ? 'COMPLEMENT_OUTSIDE_BOUND'
            : fit >= 0.7
              ? 'COMPLEMENT_IDEAL'
              : 'COMPLEMENT_WORKABLE',
        ]
      );
    }
    case 'MINIMUM_BOTH': {
      const met = a >= config.minimum && b >= config.minimum;
      const fit = clamp01(Math.min(a, b) / Math.max(config.minimum, Number.EPSILON));
      return result(
        definition,
        met ? 'ALIGNED' : 'TENSION',
        fit,
        inputConfidence,
        [met ? 'BOTH_MINIMUM_MET' : 'ONE_OR_BOTH_BELOW_MINIMUM']
      );
    }
    case 'DIRECTIONAL_EXPECTATION': {
      if (!context.directional) {
        return unavailableEvaluation(
          definition,
          ['DIRECTIONAL_CONTEXT_MISSING'],
          inputConfidence
        );
      }
      if (
        !isValidDirectionalExpectation(context.directional.desiredByA) ||
        !isValidDirectionalExpectation(context.directional.desiredByB)
      ) {
        return unavailableEvaluation(
          definition,
          ['DIRECTIONAL_CONTEXT_INVALID'],
          inputConfidence
        );
      }
      const aAcceptsB = rangeFit(
        b,
        context.directional.desiredByA,
        config.maximumDistanceFromRange
      );
      const bAcceptsA = rangeFit(
        a,
        context.directional.desiredByB,
        config.maximumDistanceFromRange
      );
      const fit = Math.min(aAcceptsB, bAcceptsA);
      const evaluation = result(
        definition,
        fit === 1 ? 'ALIGNED' : fit >= 0.5 ? 'WORKABLE_DIFFERENCE' : 'TENSION',
        fit,
        inputConfidence,
        [
          fit === 1
            ? 'DIRECTIONAL_EXPECTATIONS_MET'
            : 'DIRECTIONAL_EXPECTATION_ONE_SIDED',
        ]
      );
      return {
        ...evaluation,
        directionalFit: { aAcceptsB, bAcceptsA },
      };
    }
  }
}
