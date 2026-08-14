import type {
  FactorDefinition,
  FactorRegistryRelease,
  MatchingImportance,
} from "@/domain/model/definitions/definitionTypes";
import type { PairStrategyEvaluation } from "@/domain/model/pair/strategyTypes";
import type { IndividualFactorSnapshot } from "@/domain/model/snapshots/snapshots";
import type { FactorValue } from "@/domain/model/values/factorValue";

export type MatchingUseGrant = {
  ownerId: string;
  factorKey: string;
  allowed: boolean;
  revision: number;
  consentRevision: string;
  grantedAt: Date;
  revokedAt?: Date;
};

export type MatchingActualFactor = {
  factorKey: string;
  definitionVersion: number;
  snapshotId: string;
  snapshotRevision: number;
  snapshotInputHash: string;
  snapshotOutputHash: string;
  grantRevision: number;
  grantConsentRevision: string;
  value: FactorValue;
  confidence: number;
};

export type MatchingActualProfileIssueCode =
  | "GRANT_MISSING"
  | "GRANT_REVOKED"
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_PURPOSE_INVALID"
  | "SNAPSHOT_OWNER_INVALID"
  | "SNAPSHOT_PAIR_SCOPED"
  | "SNAPSHOT_NOT_CURRENT"
  | "SNAPSHOT_VERSION_MISMATCH"
  | "SNAPSHOT_VALUE_UNAVAILABLE"
  | "SNAPSHOT_CONFIDENCE_LOW";

export type MatchingActualProfileIssue = {
  factorKey: string;
  code: MatchingActualProfileIssueCode;
  required: boolean;
};

export type MatchingActualProfile = {
  ownerId: string;
  revision: number;
  registryKey: string;
  registryVersion: number;
  registryHash: string;
  algorithmVersion: number;
  snapshotVersion: number;
  factors: readonly MatchingActualFactor[];
  issues: readonly MatchingActualProfileIssue[];
  activation: {
    ready: boolean;
    missingRequiredFactorKeys: readonly string[];
  };
  inputHash: string;
  projectedAt: Date;
};

export type BuildMatchingActualProfileInput = {
  ownerId: string;
  revision: number;
  release: FactorRegistryRelease;
  snapshots: readonly IndividualFactorSnapshot[];
  grants: readonly MatchingUseGrant[];
  projectedAt: Date;
};

export const MATCHING_FLEXIBILITY_LEVELS = [
  "FLEXIBLE",
  "PREFER",
  "IMPORTANT",
  "NON_NEGOTIABLE",
] as const;

export type MatchingFlexibility = (typeof MATCHING_FLEXIBILITY_LEVELS)[number];

export const MATCHING_CONSTRAINT_MODES = ["NONE", "SOFT", "HARD"] as const;

export type MatchingConstraintMode = (typeof MATCHING_CONSTRAINT_MODES)[number];

export type ScalarRangeFactorTarget = {
  kind: "SCALAR_RANGE";
  minimum: number;
  maximum: number;
};

export type CategoricalSetFactorTarget = {
  kind: "CATEGORICAL_SET";
  allowedValues: readonly string[];
};

export type ConstraintSetFactorTarget = {
  kind: "CONSTRAINT_SET";
  allowedValues: readonly string[];
};

export type RoleFactorTarget = {
  kind: "ROLE_TARGET";
  desiredPreferenceMinimum: number;
  desiredPreferenceMaximum: number;
};

export type FactorTarget =
  | ScalarRangeFactorTarget
  | CategoricalSetFactorTarget
  | ConstraintSetFactorTarget
  | RoleFactorTarget;

export type PartnerPreferenceInput = {
  factorKey: string;
  desiredValue: FactorTarget;
  importance: MatchingImportance;
  flexibility: MatchingFlexibility;
  constraintMode: MatchingConstraintMode;
};

export type PartnerPreference = PartnerPreferenceInput;

export type PartnerPreferenceProfile = {
  ownerId: string;
  revision: number;
  registryKey: string;
  registryVersion: number;
  registryHash: string;
  preferences: readonly PartnerPreference[];
  inputHash: string;
  updatedAt: Date;
};

export type ValidatePartnerPreferenceProfileInput = {
  ownerId: string;
  revision: number;
  registryKey: string;
  registryVersion: number;
  preferences: readonly PartnerPreferenceInput[];
  updatedAt: Date;
  release: FactorRegistryRelease;
};

export type MatchingPreferenceIssueCode =
  | "OWNER_INVALID"
  | "REVISION_INVALID"
  | "UPDATED_AT_INVALID"
  | "REGISTRY_INVALID"
  | "REGISTRY_VERSION_MISMATCH"
  | "FACTOR_DUPLICATE"
  | "FACTOR_NOT_MATCHING_ENABLED"
  | "TARGET_INVALID"
  | "IMPORTANCE_INVALID"
  | "FLEXIBILITY_INVALID"
  | "CONSTRAINT_MODE_INVALID"
  | "HARD_CONSTRAINT_NOT_ALLOWED"
  | "HARD_CONSTRAINT_REQUIRES_NON_NEGOTIABLE";

export type MatchingPreferenceIssue = {
  factorKey: string;
  code: MatchingPreferenceIssueCode;
};

export type DirectionalPreferenceFit = {
  status: "AVAILABLE" | "UNAVAILABLE";
  fit?: number;
  confidence: number;
  reasonCodes: readonly MatchingFactorReasonCode[];
};

export type MutualFactorFit = {
  status: "AVAILABLE" | "UNAVAILABLE";
  fit?: number;
  confidence: number;
  pairEvaluation?: PairStrategyEvaluation;
  reasonCodes: readonly MatchingFactorReasonCode[];
};

export type MatchingFactorReasonCode =
  | "REQUESTER_ACTUAL_MISSING"
  | "CANDIDATE_ACTUAL_MISSING"
  | "REQUESTER_PREFERENCE_MISSING"
  | "CANDIDATE_PREFERENCE_MISSING"
  | "TARGET_TYPE_MISMATCH"
  | "TARGET_MATCH"
  | "TARGET_DIFFERENCE"
  | "MUTUAL_ALIGNED"
  | "MUTUAL_COMPLEMENTARY"
  | "MUTUAL_WORKABLE_DIFFERENCE"
  | "MUTUAL_TENSION"
  | "MUTUAL_INSUFFICIENT_DATA"
  | "REQUESTER_HARD_CONFLICT"
  | "CANDIDATE_HARD_CONFLICT";

export type MatchingFactorResult = {
  factorKey: string;
  definitionVersion: number;
  strategyType: FactorDefinition["pairStrategies"][number]["config"]["type"];
  strategyVersion: number;
  rankingWeight: number;
  requesterExpectationFit: DirectionalPreferenceFit;
  candidateExpectationFit: DirectionalPreferenceFit;
  mutualFactorFit: MutualFactorFit;
  hardConflict: boolean;
  contribution?: number;
  confidence: number;
  reasonCodes: readonly MatchingFactorReasonCode[];
};

export type MatchingEligibilityResult = {
  status: "ELIGIBLE" | "HARD_REJECT" | "REQUIRED_DATA_MISSING";
  eligible: boolean;
  internalReasonCodes: readonly (
    | "REQUESTER_REQUIRED_DATA_MISSING"
    | "CANDIDATE_REQUIRED_DATA_MISSING"
    | "USER_HARD_CONSTRAINT_CONFLICT"
  )[];
};

export type MatchingRankingResult = {
  score01?: number;
  confidenceAdjustedScore01?: number;
  evaluatedWeight: number;
  possibleWeight: number;
};

export type MatchingExplanation = {
  key: string;
  tone: "ALIGNED" | "COMPLEMENTARY" | "WORKABLE_DIFFERENCE";
};

export type MatchingEvaluationVersions = {
  registryKey: string;
  registryVersion: number;
  registryHash: string;
  algorithmVersion: number;
  requesterActualRevision: number;
  candidateActualRevision: number;
  requesterActualInputHash: string;
  candidateActualInputHash: string;
  requesterPreferenceRevision: number;
  candidatePreferenceRevision: number;
  requesterPreferenceInputHash: string;
  candidatePreferenceInputHash: string;
};

export type MatchingEvaluation = {
  evaluationId: string;
  requesterId: string;
  candidateId: string;
  requesterExpectationFit: {
    fit?: number;
    confidence: number;
  };
  candidateExpectationFit: {
    fit?: number;
    confidence: number;
  };
  mutualFactorFit: {
    fit?: number;
    confidence: number;
  };
  eligibility: MatchingEligibilityResult;
  ranking: MatchingRankingResult;
  confidence: number;
  coverage: number;
  factorResults: readonly MatchingFactorResult[];
  explanations: readonly MatchingExplanation[];
  versions: MatchingEvaluationVersions;
  inputHash: string;
  calculatedAt: Date;
};

export type EvaluateMatchingInput = {
  release: FactorRegistryRelease;
  requesterActualProfile: MatchingActualProfile;
  candidateActualProfile: MatchingActualProfile;
  requesterPreferences: PartnerPreferenceProfile;
  candidatePreferences: PartnerPreferenceProfile;
  calculatedAt: Date;
};

export type MatchingEvaluationVersionState = MatchingEvaluationVersions;

export type MatchingCandidateIntelligenceProjection = {
  candidateId: string;
  eligibility: "ELIGIBLE" | "UNAVAILABLE";
  confidenceBand: "LOW" | "MEDIUM" | "HIGH";
  explanations: readonly MatchingExplanation[];
};
