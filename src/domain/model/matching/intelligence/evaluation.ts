import { createHash } from "node:crypto";
import type {
  FactorDefinition,
  MatchingImportance,
} from "@/domain/model/definitions/definitionTypes";
import { verifyFactorRegistryRelease } from "@/domain/model/definitions/registry";
import { evaluatePairStrategy } from "@/domain/model/pair/strategies";
import type { PairStrategyEvaluation } from "@/domain/model/pair/strategyTypes";
import {
  isAvailableFactorValue,
  validateFactorValue,
  type AvailableFactorValue,
} from "@/domain/model/values/factorValue";
import type {
  DirectionalPreferenceFit,
  EvaluateMatchingInput,
  FactorTarget,
  MatchingActualFactor,
  MatchingCandidateIntelligenceProjection,
  MatchingEvaluation,
  MatchingEvaluationVersionState,
  MatchingExplanation,
  MatchingFactorReasonCode,
  MatchingFactorResult,
  MatchingRankingResult,
  MutualFactorFit,
  PartnerPreference,
} from "@/domain/model/matching/intelligence/types";
import { matchingEnabledFactorDefinitions } from "@/domain/model/matching/intelligence/policy";

export class MatchingEvaluationInputError extends Error {
  readonly reasonCode:
    | "SELF_EVALUATION_FORBIDDEN"
    | "CALCULATED_AT_INVALID"
    | "REGISTRY_INVALID"
    | "REGISTRY_VERSION_MISMATCH"
    | "ACTUAL_PROFILE_OWNER_MISMATCH"
    | "PREFERENCE_PROFILE_OWNER_MISMATCH"
    | "MATCHING_POLICY_STRATEGY_MISSING";

  constructor(reasonCode: MatchingEvaluationInputError["reasonCode"]) {
    super(reasonCode);
    this.name = "MatchingEvaluationInputError";
    this.reasonCode = reasonCode;
  }
}

const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("|")).digest("hex");

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const average = (values: readonly number[]): number | undefined =>
  values.length === 0
    ? undefined
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const weightedAverage = (
  values: readonly { value: number; weight: number }[],
): number | undefined => {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (!(totalWeight > 0)) return undefined;
  return clamp01(
    values.reduce((sum, item) => sum + item.value * item.weight, 0) /
      totalWeight,
  );
};

const actualFactor = (
  factors: readonly MatchingActualFactor[],
  factorKey: string,
): MatchingActualFactor | undefined =>
  factors.find((factor) => factor.factorKey === factorKey);

const usableActualFactor = (
  actual: MatchingActualFactor | undefined,
  definition: FactorDefinition,
): MatchingActualFactor | undefined => {
  if (
    !actual ||
    actual.definitionVersion !== definition.definitionVersion ||
    !Number.isFinite(actual.confidence) ||
    actual.confidence <
      definition.confidenceRequirements.minimumSnapshotConfidence
  ) {
    return undefined;
  }
  const validation = validateFactorValue(definition.valueSchema, actual.value);
  return validation.valid && isAvailableFactorValue(actual.value)
    ? actual
    : undefined;
};

const preferenceFor = (
  preferences: readonly PartnerPreference[],
  factorKey: string,
): PartnerPreference | undefined =>
  preferences.find((preference) => preference.factorKey === factorKey);

const numericValue = (value: AvailableFactorValue): number | undefined => {
  switch (value.kind) {
    case "SCALAR":
      return value.value;
    case "BOOLEAN":
      return value.value ? 1 : 0;
    case "ORDINAL":
      return value.rank;
    case "RANGE":
      return (value.low + value.high) / 2;
    case "MASTERY":
      return value.score01;
    case "CATEGORY":
    case "CONSTRAINT":
    case "SET":
    case "TEXT":
      return undefined;
  }
};

const categoricalValues = (
  value: AvailableFactorValue,
): readonly string[] | undefined => {
  switch (value.kind) {
    case "CATEGORY":
    case "CONSTRAINT":
      return [value.value];
    case "ORDINAL":
      return [value.value];
    case "BOOLEAN":
      return [value.value ? "true" : "false"];
    case "SET":
      return value.values;
    case "SCALAR":
    case "RANGE":
    case "MASTERY":
    case "TEXT":
      return undefined;
  }
};

const numericSpan = (definition: FactorDefinition): number => {
  const schema = definition.valueSchema;
  switch (schema.type) {
    case "SCALAR":
    case "RANGE":
      return Math.max(schema.max - schema.min, Number.EPSILON);
    case "MASTERY":
      return 1;
    case "ORDINAL": {
      const ranks = schema.levels.map((level) => level.rank);
      return Math.max(Math.max(...ranks) - Math.min(...ranks), 1);
    }
    case "BOOLEAN":
    case "CATEGORY":
    case "CONSTRAINT":
    case "SET":
    case "TEXT":
      return 1;
  }
};

const distanceFromRange = (
  value: number,
  minimum: number,
  maximum: number,
): number => {
  if (value < minimum) return minimum - value;
  if (value > maximum) return value - maximum;
  return 0;
};

const fitTarget = (
  target: FactorTarget,
  actual: MatchingActualFactor,
  definition: FactorDefinition,
): number | undefined => {
  if (!isAvailableFactorValue(actual.value)) return undefined;
  switch (target.kind) {
    case "SCALAR_RANGE": {
      const numeric = numericValue(actual.value);
      if (numeric === undefined) return undefined;
      return clamp01(
        1 -
          distanceFromRange(numeric, target.minimum, target.maximum) /
            numericSpan(definition),
      );
    }
    case "ROLE_TARGET": {
      const numeric = numericValue(actual.value);
      if (numeric === undefined) return undefined;
      return clamp01(
        1 -
          distanceFromRange(
            numeric,
            target.desiredPreferenceMinimum,
            target.desiredPreferenceMaximum,
          ) /
            numericSpan(definition),
      );
    }
    case "CATEGORICAL_SET":
    case "CONSTRAINT_SET": {
      const values = categoricalValues(actual.value);
      if (!values) return undefined;
      return values.some((value) => target.allowedValues.includes(value))
        ? 1
        : 0;
    }
  }
};

const unavailableDirectional = (
  reasonCode: MatchingFactorReasonCode,
  confidence = 0,
): DirectionalPreferenceFit => ({
  status: "UNAVAILABLE",
  confidence: clamp01(confidence),
  reasonCodes: [reasonCode],
});

const directionalFit = (input: {
  preference: PartnerPreference | undefined;
  actual: MatchingActualFactor | undefined;
  definition: FactorDefinition;
  missingPreferenceCode: MatchingFactorReasonCode;
  missingActualCode: MatchingFactorReasonCode;
}): DirectionalPreferenceFit => {
  if (!input.preference) {
    return unavailableDirectional(input.missingPreferenceCode);
  }
  if (!input.actual) {
    return unavailableDirectional(input.missingActualCode);
  }
  const fit = fitTarget(
    input.preference.desiredValue,
    input.actual,
    input.definition,
  );
  if (fit === undefined) {
    return unavailableDirectional(
      "TARGET_TYPE_MISMATCH",
      input.actual.confidence,
    );
  }
  return {
    status: "AVAILABLE",
    fit,
    confidence: clamp01(input.actual.confidence),
    reasonCodes: [fit === 1 ? "TARGET_MATCH" : "TARGET_DIFFERENCE"],
  };
};

const mutualReason = (
  evaluation: PairStrategyEvaluation,
): MatchingFactorReasonCode => {
  switch (evaluation.status) {
    case "ALIGNED":
      return "MUTUAL_ALIGNED";
    case "COMPLEMENTARY":
      return "MUTUAL_COMPLEMENTARY";
    case "WORKABLE_DIFFERENCE":
    case "REQUIRES_DISCUSSION":
      return "MUTUAL_WORKABLE_DIFFERENCE";
    case "TENSION":
    case "CONSTRAINT_CONFLICT":
      return "MUTUAL_TENSION";
    case "INSUFFICIENT_DATA":
      return "MUTUAL_INSUFFICIENT_DATA";
  }
};

const mutualFit = (input: {
  requesterActual: MatchingActualFactor | undefined;
  candidateActual: MatchingActualFactor | undefined;
  definition: FactorDefinition;
}): MutualFactorFit => {
  if (!input.requesterActual) {
    return {
      status: "UNAVAILABLE",
      confidence: 0,
      reasonCodes: ["REQUESTER_ACTUAL_MISSING"],
    };
  }
  if (!input.candidateActual) {
    return {
      status: "UNAVAILABLE",
      confidence: 0,
      reasonCodes: ["CANDIDATE_ACTUAL_MISSING"],
    };
  }
  const policy = input.definition.matchingPolicy;
  const strategy = input.definition.pairStrategies.find(
    (candidate) =>
      candidate.context === policy?.strategy.context &&
      candidate.config.type === policy.strategy.type &&
      candidate.strategyVersion === policy.strategy.strategyVersion,
  );
  if (!strategy) {
    throw new MatchingEvaluationInputError("MATCHING_POLICY_STRATEGY_MISSING");
  }
  const evaluation = evaluatePairStrategy(
    strategy,
    {
      value: input.requesterActual.value,
      confidence: input.requesterActual.confidence,
    },
    {
      value: input.candidateActual.value,
      confidence: input.candidateActual.confidence,
    },
    { relationshipContext: "DATING" },
  );
  return evaluation.internalFit === undefined ||
    evaluation.status === "INSUFFICIENT_DATA"
    ? {
        status: "UNAVAILABLE",
        confidence: clamp01(evaluation.confidence),
        pairEvaluation: evaluation,
        reasonCodes: [mutualReason(evaluation)],
      }
    : {
        status: "AVAILABLE",
        fit: clamp01(evaluation.internalFit),
        confidence: clamp01(evaluation.confidence),
        pairEvaluation: evaluation,
        reasonCodes: [mutualReason(evaluation)],
      };
};

const IMPORTANCE_WEIGHT: Readonly<Record<MatchingImportance, number>> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.75,
  CRITICAL: 1,
};

const effectiveWeight = (
  definition: FactorDefinition,
  requesterPreference: PartnerPreference | undefined,
  candidatePreference: PartnerPreference | undefined,
): number => {
  const policy = definition.matchingPolicy;
  if (!policy?.effects.includes("RANKING")) return 0;
  const importance = Math.max(
    IMPORTANCE_WEIGHT[
      requesterPreference?.importance ?? policy.defaultImportance
    ],
    IMPORTANCE_WEIGHT[
      candidatePreference?.importance ?? policy.defaultImportance
    ],
  );
  return clamp01(policy.rankingWeight) * importance;
};

const hardConflict = (
  preference: PartnerPreference | undefined,
  fit: DirectionalPreferenceFit,
): boolean =>
  preference?.constraintMode === "HARD" &&
  preference.flexibility === "NON_NEGOTIABLE" &&
  fit.status === "AVAILABLE" &&
  fit.fit !== undefined &&
  fit.fit < 1;

const factorResult = (
  definition: FactorDefinition,
  input: EvaluateMatchingInput,
): MatchingFactorResult => {
  const requesterActual = usableActualFactor(
    actualFactor(input.requesterActualProfile.factors, definition.key),
    definition,
  );
  const candidateActual = usableActualFactor(
    actualFactor(input.candidateActualProfile.factors, definition.key),
    definition,
  );
  const requesterPreference = preferenceFor(
    input.requesterPreferences.preferences,
    definition.key,
  );
  const candidatePreference = preferenceFor(
    input.candidatePreferences.preferences,
    definition.key,
  );
  const requesterExpectationFit = directionalFit({
    preference: requesterPreference,
    actual: candidateActual,
    definition,
    missingPreferenceCode: "REQUESTER_PREFERENCE_MISSING",
    missingActualCode: "CANDIDATE_ACTUAL_MISSING",
  });
  const candidateExpectationFit = directionalFit({
    preference: candidatePreference,
    actual: requesterActual,
    definition,
    missingPreferenceCode: "CANDIDATE_PREFERENCE_MISSING",
    missingActualCode: "REQUESTER_ACTUAL_MISSING",
  });
  const mutualFactorFit = mutualFit({
    requesterActual,
    candidateActual,
    definition,
  });
  const requesterHardConflict = hardConflict(
    requesterPreference,
    requesterExpectationFit,
  );
  const candidateHardConflict = hardConflict(
    candidatePreference,
    candidateExpectationFit,
  );
  const scores = [
    requesterExpectationFit.status === "AVAILABLE"
      ? requesterExpectationFit.fit
      : undefined,
    candidateExpectationFit.status === "AVAILABLE"
      ? candidateExpectationFit.fit
      : undefined,
    mutualFactorFit.status === "AVAILABLE" ? mutualFactorFit.fit : undefined,
  ].filter((value): value is number => value !== undefined);
  const confidenceValues = [
    requesterExpectationFit.status === "AVAILABLE"
      ? requesterExpectationFit.confidence
      : undefined,
    candidateExpectationFit.status === "AVAILABLE"
      ? candidateExpectationFit.confidence
      : undefined,
    mutualFactorFit.status === "AVAILABLE"
      ? mutualFactorFit.confidence
      : undefined,
  ].filter((value): value is number => value !== undefined);
  const reasonCodes = [
    ...requesterExpectationFit.reasonCodes,
    ...candidateExpectationFit.reasonCodes,
    ...mutualFactorFit.reasonCodes,
    ...(requesterHardConflict ? (["REQUESTER_HARD_CONFLICT"] as const) : []),
    ...(candidateHardConflict ? (["CANDIDATE_HARD_CONFLICT"] as const) : []),
  ];
  const policy = definition.matchingPolicy;
  return {
    factorKey: definition.key,
    definitionVersion: definition.definitionVersion,
    strategyType: policy?.strategy.type ?? "SIMILARITY",
    strategyVersion: policy?.strategy.strategyVersion ?? 0,
    rankingWeight: effectiveWeight(
      definition,
      requesterPreference,
      candidatePreference,
    ),
    requesterExpectationFit,
    candidateExpectationFit,
    mutualFactorFit,
    hardConflict: requesterHardConflict || candidateHardConflict,
    contribution: average(scores),
    confidence: clamp01(average(confidenceValues) ?? 0),
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
};

const assertCompatible = (input: EvaluateMatchingInput): void => {
  const requesterId = input.requesterActualProfile.ownerId;
  const candidateId = input.candidateActualProfile.ownerId;
  if (requesterId === candidateId) {
    throw new MatchingEvaluationInputError("SELF_EVALUATION_FORBIDDEN");
  }
  if (!Number.isFinite(input.calculatedAt.getTime())) {
    throw new MatchingEvaluationInputError("CALCULATED_AT_INVALID");
  }
  if (
    input.release.status !== "PUBLISHED" ||
    !verifyFactorRegistryRelease(input.release)
  ) {
    throw new MatchingEvaluationInputError("REGISTRY_INVALID");
  }
  if (
    input.requesterPreferences.ownerId !== requesterId ||
    input.candidatePreferences.ownerId !== candidateId
  ) {
    throw new MatchingEvaluationInputError("PREFERENCE_PROFILE_OWNER_MISMATCH");
  }
  if (!requesterId.trim() || !candidateId.trim()) {
    throw new MatchingEvaluationInputError("ACTUAL_PROFILE_OWNER_MISMATCH");
  }
  const release = input.release;
  const registryReferences = [
    input.requesterActualProfile,
    input.candidateActualProfile,
    input.requesterPreferences,
    input.candidatePreferences,
  ];
  if (
    registryReferences.some(
      (reference) =>
        reference.registryKey !== release.registryKey ||
        reference.registryVersion !== release.registryVersion ||
        reference.registryHash !== release.hash,
    ) ||
    input.requesterActualProfile.algorithmVersion !==
      release.algorithmVersion ||
    input.candidateActualProfile.algorithmVersion !==
      release.algorithmVersion ||
    input.requesterActualProfile.snapshotVersion !== release.snapshotVersion ||
    input.candidateActualProfile.snapshotVersion !== release.snapshotVersion
  ) {
    throw new MatchingEvaluationInputError("REGISTRY_VERSION_MISMATCH");
  }
};

const aggregateDirectional = (
  results: readonly MatchingFactorResult[],
  side: "requester" | "candidate",
): { fit?: number; confidence: number } => {
  const values = results.flatMap((result) => {
    const fit =
      side === "requester"
        ? result.requesterExpectationFit
        : result.candidateExpectationFit;
    return fit.status === "AVAILABLE" &&
      fit.fit !== undefined &&
      result.rankingWeight > 0
      ? [{ value: fit.fit, weight: result.rankingWeight }]
      : [];
  });
  const confidenceValues = results.flatMap((result) => {
    const fit =
      side === "requester"
        ? result.requesterExpectationFit
        : result.candidateExpectationFit;
    return fit.status === "AVAILABLE" && result.rankingWeight > 0
      ? [{ value: fit.confidence, weight: result.rankingWeight }]
      : [];
  });
  return {
    fit: weightedAverage(values),
    confidence: weightedAverage(confidenceValues) ?? 0,
  };
};

const aggregateMutual = (
  results: readonly MatchingFactorResult[],
): { fit?: number; confidence: number } => ({
  fit: weightedAverage(
    results.flatMap((result) =>
      result.mutualFactorFit.status === "AVAILABLE" &&
      result.mutualFactorFit.fit !== undefined &&
      result.rankingWeight > 0
        ? [{ value: result.mutualFactorFit.fit, weight: result.rankingWeight }]
        : [],
    ),
  ),
  confidence:
    weightedAverage(
      results.flatMap((result) =>
        result.mutualFactorFit.status === "AVAILABLE" &&
        result.rankingWeight > 0
          ? [
              {
                value: result.mutualFactorFit.confidence,
                weight: result.rankingWeight,
              },
            ]
          : [],
      ),
    ) ?? 0,
});

const rankingFor = (
  results: readonly MatchingFactorResult[],
  confidence: number,
): MatchingRankingResult => {
  const possibleWeight = results.reduce(
    (sum, result) => sum + result.rankingWeight,
    0,
  );
  const available = results.filter(
    (result) => result.contribution !== undefined && result.rankingWeight > 0,
  );
  const evaluatedWeight = available.reduce(
    (sum, result) => sum + result.rankingWeight,
    0,
  );
  const score01 = weightedAverage(
    available.map((result) => ({
      value: result.contribution ?? 0,
      weight: result.rankingWeight,
    })),
  );
  return {
    score01,
    confidenceAdjustedScore01:
      score01 === undefined ? undefined : clamp01(score01 * confidence),
    evaluatedWeight,
    possibleWeight,
  };
};

const explanationTone = (
  result: MatchingFactorResult,
): MatchingExplanation["tone"] | undefined => {
  switch (result.mutualFactorFit.pairEvaluation?.status) {
    case "ALIGNED":
      return "ALIGNED";
    case "COMPLEMENTARY":
      return "COMPLEMENTARY";
    case "WORKABLE_DIFFERENCE":
    case "REQUIRES_DISCUSSION":
      return "WORKABLE_DIFFERENCE";
    case "TENSION":
    case "CONSTRAINT_CONFLICT":
    case "INSUFFICIENT_DATA":
    case undefined:
      return undefined;
  }
};

const explanationsFor = (
  definitions: readonly FactorDefinition[],
  results: readonly MatchingFactorResult[],
): readonly MatchingExplanation[] =>
  results
    .flatMap((result) => {
      const definition = definitions.find(
        (candidate) => candidate.key === result.factorKey,
      );
      const tone = explanationTone(result);
      return definition?.matchingPolicy?.effects.includes("EXPLANATION") &&
        definition.matchingPolicy.privacy.explanation ===
          "COARSE_ALLOWLISTED" &&
        definition.privacyClass === "NORMAL" &&
        !result.hardConflict &&
        result.contribution !== undefined &&
        tone
        ? [
            {
              key: definition.displayKeys.explanationKey,
              tone,
              weight: result.rankingWeight,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        right.weight - left.weight || left.key.localeCompare(right.key),
    )
    .slice(0, 3)
    .map(({ key, tone }) => ({ key, tone }));

export function evaluateMatching(
  input: EvaluateMatchingInput,
): MatchingEvaluation {
  assertCompatible(input);
  const definitions = matchingEnabledFactorDefinitions(input.release);
  const factorResults = definitions.map((definition) =>
    factorResult(definition, input),
  );
  const hardReject = factorResults.some((result) => result.hardConflict);
  const requesterMissing = !input.requesterActualProfile.activation.ready;
  const candidateMissing = !input.candidateActualProfile.activation.ready;
  const eligibility = hardReject
    ? {
        status: "HARD_REJECT" as const,
        eligible: false,
        internalReasonCodes: ["USER_HARD_CONSTRAINT_CONFLICT" as const],
      }
    : requesterMissing || candidateMissing
      ? {
          status: "REQUIRED_DATA_MISSING" as const,
          eligible: false,
          internalReasonCodes: [
            ...(requesterMissing
              ? (["REQUESTER_REQUIRED_DATA_MISSING"] as const)
              : []),
            ...(candidateMissing
              ? (["CANDIDATE_REQUIRED_DATA_MISSING"] as const)
              : []),
          ],
        }
      : {
          status: "ELIGIBLE" as const,
          eligible: true,
          internalReasonCodes: [],
        };
  const possibleWeight = factorResults.reduce(
    (sum, result) => sum + result.rankingWeight,
    0,
  );
  const evaluatedResults = factorResults.filter(
    (result) => result.contribution !== undefined && result.rankingWeight > 0,
  );
  const evaluatedWeight = evaluatedResults.reduce(
    (sum, result) => sum + result.rankingWeight,
    0,
  );
  const coverage =
    possibleWeight > 0 ? clamp01(evaluatedWeight / possibleWeight) : 0;
  const factorConfidence =
    weightedAverage(
      evaluatedResults.map((result) => ({
        value: result.confidence,
        weight: result.rankingWeight,
      })),
    ) ?? 0;
  const confidence = clamp01(factorConfidence * coverage);
  const requesterExpectationFit = aggregateDirectional(
    factorResults,
    "requester",
  );
  const candidateExpectationFit = aggregateDirectional(
    factorResults,
    "candidate",
  );
  const mutualFactorFit = aggregateMutual(factorResults);
  const ranking = rankingFor(factorResults, confidence);
  const versions = {
    registryKey: input.release.registryKey,
    registryVersion: input.release.registryVersion,
    registryHash: input.release.hash,
    algorithmVersion: input.release.algorithmVersion,
    requesterActualRevision: input.requesterActualProfile.revision,
    candidateActualRevision: input.candidateActualProfile.revision,
    requesterActualInputHash: input.requesterActualProfile.inputHash,
    candidateActualInputHash: input.candidateActualProfile.inputHash,
    requesterPreferenceRevision: input.requesterPreferences.revision,
    candidatePreferenceRevision: input.candidatePreferences.revision,
    requesterPreferenceInputHash: input.requesterPreferences.inputHash,
    candidatePreferenceInputHash: input.candidatePreferences.inputHash,
  };
  const inputHash = hash([
    "MATCHING_EVALUATION",
    input.requesterActualProfile.ownerId,
    input.candidateActualProfile.ownerId,
    versions.registryKey,
    String(versions.registryVersion),
    versions.registryHash,
    String(versions.algorithmVersion),
    String(versions.requesterActualRevision),
    String(versions.candidateActualRevision),
    versions.requesterActualInputHash,
    versions.candidateActualInputHash,
    String(versions.requesterPreferenceRevision),
    String(versions.candidatePreferenceRevision),
    versions.requesterPreferenceInputHash,
    versions.candidatePreferenceInputHash,
  ]);

  return {
    evaluationId: `matching-evaluation:${inputHash}`,
    requesterId: input.requesterActualProfile.ownerId,
    candidateId: input.candidateActualProfile.ownerId,
    requesterExpectationFit,
    candidateExpectationFit,
    mutualFactorFit,
    eligibility,
    ranking,
    confidence,
    coverage,
    factorResults,
    explanations: explanationsFor(definitions, factorResults),
    versions,
    inputHash,
    calculatedAt: new Date(input.calculatedAt.getTime()),
  };
}

export const isMatchingEvaluationCurrent = (
  evaluation: MatchingEvaluation,
  current: MatchingEvaluationVersionState,
): boolean =>
  evaluation.versions.registryKey === current.registryKey &&
  evaluation.versions.registryVersion === current.registryVersion &&
  evaluation.versions.registryHash === current.registryHash &&
  evaluation.versions.algorithmVersion === current.algorithmVersion &&
  evaluation.versions.requesterActualRevision ===
    current.requesterActualRevision &&
  evaluation.versions.candidateActualRevision ===
    current.candidateActualRevision &&
  evaluation.versions.requesterActualInputHash ===
    current.requesterActualInputHash &&
  evaluation.versions.candidateActualInputHash ===
    current.candidateActualInputHash &&
  evaluation.versions.requesterPreferenceRevision ===
    current.requesterPreferenceRevision &&
  evaluation.versions.candidatePreferenceRevision ===
    current.candidatePreferenceRevision &&
  evaluation.versions.requesterPreferenceInputHash ===
    current.requesterPreferenceInputHash &&
  evaluation.versions.candidatePreferenceInputHash ===
    current.candidatePreferenceInputHash;

export const rankMatchingEvaluations = (
  evaluations: readonly MatchingEvaluation[],
): readonly MatchingEvaluation[] =>
  evaluations
    .filter((evaluation) => evaluation.eligibility.eligible)
    .sort((left, right) => {
      const leftScore = left.ranking.confidenceAdjustedScore01;
      const rightScore = right.ranking.confidenceAdjustedScore01;
      if (leftScore === undefined && rightScore !== undefined) return 1;
      if (leftScore !== undefined && rightScore === undefined) return -1;
      return (
        (rightScore ?? 0) - (leftScore ?? 0) ||
        right.confidence - left.confidence ||
        right.coverage - left.coverage ||
        left.candidateId.localeCompare(right.candidateId) ||
        left.evaluationId.localeCompare(right.evaluationId)
      );
    });

export const projectMatchingCandidateIntelligence = (
  evaluation: MatchingEvaluation,
): MatchingCandidateIntelligenceProjection => ({
  candidateId: evaluation.candidateId,
  eligibility: evaluation.eligibility.eligible ? "ELIGIBLE" : "UNAVAILABLE",
  confidenceBand:
    evaluation.confidence >= 0.7
      ? "HIGH"
      : evaluation.confidence >= 0.4
        ? "MEDIUM"
        : "LOW",
  explanations: evaluation.eligibility.eligible ? evaluation.explanations : [],
});
