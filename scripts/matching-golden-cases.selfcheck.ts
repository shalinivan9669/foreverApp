import assert from "node:assert/strict";
import { MVP_FACTOR_REGISTRY } from "@/domain/model/definitions/mvpDefinitions";
import {
  evaluateMatching,
  isMatchingEvaluationCurrent,
  projectMatchingCandidateIntelligence,
  rankMatchingEvaluations,
  validatePartnerPreferenceProfile,
  MatchingPreferenceValidationError,
  type MatchingActualFactor,
  type MatchingActualProfile,
  type MatchingConstraintMode,
  type MatchingEvaluation,
  type MatchingFlexibility,
  type PartnerPreferenceInput,
} from "@/domain/model/matching/intelligence";
import type {
  FactorValue,
  SkillLevel,
} from "@/domain/model/values/factorValue";

const NOW = new Date("2026-08-13T12:00:00.000Z");

type ActualSpec = {
  children?: "YES" | "NO" | "UNSURE";
  intent?: 0 | 1 | 2;
  structure?: number;
  social?: number;
  cleaning?: number;
  priority?: number;
  repair?: number;
  confidence?: number;
};

type PreferenceSpec = {
  factorKey: string;
  minimum?: number;
  maximum?: number;
  allowedValues?: readonly string[];
  hard?: boolean;
};

type GoldenExpectation = {
  eligibility: MatchingEvaluation["eligibility"]["status"];
  confidenceBand?: "LOW" | "MEDIUM" | "HIGH";
  hasScore?: boolean;
  factorKey?: string;
  mutualStatus?: string;
  contributionAvailable?: boolean;
  directionalBalance?: "BALANCED" | "REQUESTER_HIGHER" | "CANDIDATE_HIGHER";
};

type GoldenFixture = {
  id: string;
  requester: ActualSpec;
  candidate: ActualSpec;
  requesterReady?: boolean;
  candidateReady?: boolean;
  requesterPreferences?: readonly PreferenceSpec[];
  candidatePreferences?: readonly PreferenceSpec[];
  expected: GoldenExpectation;
};

const allAligned: ActualSpec = {
  children: "YES",
  intent: 2,
  structure: 0.4,
  social: 0.2,
  cleaning: 0.1,
  priority: 0.8,
  repair: 0.8,
};

const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  {
    id: "01-both-want-children",
    requester: allAligned,
    candidate: allAligned,
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.family.childrenIntent",
      mutualStatus: "ALIGNED",
      hasScore: true,
      confidenceBand: "HIGH",
    },
  },
  {
    id: "02-children-hard-conflict",
    requester: { ...allAligned, children: "YES" },
    candidate: { ...allAligned, children: "NO" },
    requesterPreferences: [
      {
        factorKey: "lifePlans.family.childrenIntent",
        allowedValues: ["YES"],
        hard: true,
      },
    ],
    candidatePreferences: [
      {
        factorKey: "lifePlans.family.childrenIntent",
        allowedValues: ["NO"],
        hard: true,
      },
    ],
    expected: {
      eligibility: "HARD_REJECT",
      factorKey: "lifePlans.family.childrenIntent",
      mutualStatus: "CONSTRAINT_CONFLICT",
      hasScore: true,
    },
  },
  {
    id: "03-cleaning-complement",
    requester: { ...allAligned, cleaning: 0.1 },
    candidate: { ...allAligned, cleaning: 0.85 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.roles.cleaningPreference",
      mutualStatus: "COMPLEMENTARY",
    },
  },
  {
    id: "04-cleaning-role-gap",
    requester: { ...allAligned, cleaning: 0.1 },
    candidate: { ...allAligned, cleaning: 0.1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.roles.cleaningPreference",
      mutualStatus: "WORKABLE_DIFFERENCE",
    },
  },
  {
    id: "05-structure-workable",
    requester: { ...allAligned, structure: 0.8 },
    candidate: { ...allAligned, structure: 0.1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.planning.structurePreference",
      mutualStatus: "WORKABLE_DIFFERENCE",
    },
  },
  {
    id: "06-half-optional-missing-low-confidence",
    requester: { children: "YES", intent: 2, confidence: 0.75 },
    candidate: { children: "YES", intent: 2, confidence: 0.75 },
    expected: {
      eligibility: "ELIGIBLE",
      confidenceBand: "LOW",
      hasScore: true,
    },
  },
  {
    id: "07-directional-imbalance-requester",
    requester: allAligned,
    candidate: { ...allAligned, structure: 0.9 },
    requesterPreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0.8,
        maximum: 1,
      },
    ],
    candidatePreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: -1,
        maximum: -0.8,
      },
    ],
    expected: {
      eligibility: "ELIGIBLE",
      directionalBalance: "REQUESTER_HIGHER",
    },
  },
  {
    id: "08-requester-required-missing",
    requester: { ...allAligned, intent: undefined },
    candidate: allAligned,
    requesterReady: false,
    expected: {
      eligibility: "REQUIRED_DATA_MISSING",
      factorKey: "lifePlans.relationship.intent",
      contributionAvailable: false,
    },
  },
  {
    id: "09-optional-missing-no-neutral",
    requester: { ...allAligned, social: undefined },
    candidate: { ...allAligned, social: undefined },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.lifestyle.socialActivityPreference",
      contributionAvailable: false,
    },
  },
  {
    id: "10-structure-aligned",
    requester: { ...allAligned, structure: -0.1 },
    candidate: { ...allAligned, structure: 0.2 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.planning.structurePreference",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "11-structure-tension",
    requester: { ...allAligned, structure: -1 },
    candidate: { ...allAligned, structure: 1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.planning.structurePreference",
      mutualStatus: "TENSION",
    },
  },
  {
    id: "12-social-aligned",
    requester: { ...allAligned, social: -0.2 },
    candidate: { ...allAligned, social: 0.2 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.lifestyle.socialActivityPreference",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "13-social-workable",
    requester: { ...allAligned, social: -0.5 },
    candidate: { ...allAligned, social: 0.5 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.lifestyle.socialActivityPreference",
      mutualStatus: "WORKABLE_DIFFERENCE",
    },
  },
  {
    id: "14-social-tension",
    requester: { ...allAligned, social: -1 },
    candidate: { ...allAligned, social: 1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.lifestyle.socialActivityPreference",
      mutualStatus: "TENSION",
    },
  },
  {
    id: "15-intent-aligned",
    requester: { ...allAligned, intent: 1 },
    candidate: { ...allAligned, intent: 1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.relationship.intent",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "16-intent-workable",
    requester: { ...allAligned, intent: 0 },
    candidate: { ...allAligned, intent: 1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.relationship.intent",
      mutualStatus: "WORKABLE_DIFFERENCE",
    },
  },
  {
    id: "17-intent-tension",
    requester: { ...allAligned, intent: 0 },
    candidate: { ...allAligned, intent: 2 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.relationship.intent",
      mutualStatus: "TENSION",
    },
  },
  {
    id: "18-priority-aligned",
    requester: { ...allAligned, priority: 0.7 },
    candidate: { ...allAligned, priority: 0.8 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.values.relationshipPriority",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "19-priority-workable",
    requester: { ...allAligned, priority: 0.3 },
    candidate: { ...allAligned, priority: 0.7 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.values.relationshipPriority",
      mutualStatus: "WORKABLE_DIFFERENCE",
    },
  },
  {
    id: "20-priority-tension",
    requester: { ...allAligned, priority: 0 },
    candidate: { ...allAligned, priority: 1 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.values.relationshipPriority",
      mutualStatus: "TENSION",
    },
  },
  {
    id: "21-repair-aligned",
    requester: { ...allAligned, repair: 0.8 },
    candidate: { ...allAligned, repair: 0.6 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "communication.conflict.repairSkill",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "22-repair-tension",
    requester: { ...allAligned, repair: 0.2 },
    candidate: { ...allAligned, repair: 0.8 },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "communication.conflict.repairSkill",
      mutualStatus: "TENSION",
    },
  },
  {
    id: "23-children-unsure-yes",
    requester: { ...allAligned, children: "UNSURE" },
    candidate: { ...allAligned, children: "YES" },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.family.childrenIntent",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "24-children-unsure-no",
    requester: { ...allAligned, children: "UNSURE" },
    candidate: { ...allAligned, children: "NO" },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.family.childrenIntent",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "25-children-actual-difference-without-hard-pref",
    requester: { ...allAligned, children: "YES" },
    candidate: { ...allAligned, children: "NO" },
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "lifePlans.family.childrenIntent",
      mutualStatus: "CONSTRAINT_CONFLICT",
    },
  },
  {
    id: "26-all-soft-aligned",
    requester: allAligned,
    candidate: allAligned,
    expected: {
      eligibility: "ELIGIBLE",
      hasScore: true,
      confidenceBand: "HIGH",
    },
  },
  {
    id: "27-soft-tensions-remain-eligible",
    requester: {
      ...allAligned,
      structure: -1,
      social: -1,
      priority: 0,
      repair: 0.2,
    },
    candidate: {
      ...allAligned,
      structure: 1,
      social: 1,
      priority: 1,
      repair: 0.2,
    },
    expected: { eligibility: "ELIGIBLE", hasScore: true },
  },
  {
    id: "28-hard-reject-not-compensated",
    requester: { ...allAligned, children: "YES" },
    candidate: { ...allAligned, children: "NO" },
    requesterPreferences: [
      {
        factorKey: "lifePlans.family.childrenIntent",
        allowedValues: ["YES"],
        hard: true,
      },
    ],
    expected: { eligibility: "HARD_REJECT", hasScore: true },
  },
  {
    id: "29-candidate-hard-only",
    requester: { ...allAligned, children: "YES" },
    candidate: { ...allAligned, children: "NO" },
    candidatePreferences: [
      {
        factorKey: "lifePlans.family.childrenIntent",
        allowedValues: ["NO"],
        hard: true,
      },
    ],
    expected: { eligibility: "HARD_REJECT" },
  },
  {
    id: "30-hard-preference-satisfied",
    requester: { ...allAligned, children: "YES" },
    candidate: { ...allAligned, children: "YES" },
    requesterPreferences: [
      {
        factorKey: "lifePlans.family.childrenIntent",
        allowedValues: ["YES"],
        hard: true,
      },
    ],
    expected: { eligibility: "ELIGIBLE" },
  },
  {
    id: "31-directional-both-match",
    requester: { ...allAligned, structure: 0.2 },
    candidate: { ...allAligned, structure: 0.8 },
    requesterPreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0.7,
        maximum: 1,
      },
    ],
    candidatePreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0,
        maximum: 0.3,
      },
    ],
    expected: { eligibility: "ELIGIBLE", directionalBalance: "BALANCED" },
  },
  {
    id: "32-directional-requester-higher",
    requester: { ...allAligned, structure: -0.8 },
    candidate: { ...allAligned, structure: 0.8 },
    requesterPreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0.7,
        maximum: 1,
      },
    ],
    candidatePreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0.7,
        maximum: 1,
      },
    ],
    expected: {
      eligibility: "ELIGIBLE",
      directionalBalance: "REQUESTER_HIGHER",
    },
  },
  {
    id: "33-directional-candidate-higher",
    requester: { ...allAligned, structure: 0.8 },
    candidate: { ...allAligned, structure: -0.8 },
    requesterPreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0.7,
        maximum: 1,
      },
    ],
    candidatePreferences: [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: 0.7,
        maximum: 1,
      },
    ],
    expected: {
      eligibility: "ELIGIBLE",
      directionalBalance: "CANDIDATE_HIGHER",
    },
  },
  {
    id: "34-no-preferences-still-mutual",
    requester: allAligned,
    candidate: allAligned,
    expected: {
      eligibility: "ELIGIBLE",
      hasScore: true,
      directionalBalance: "BALANCED",
    },
  },
  {
    id: "35-required-only-medium-confidence",
    requester: { children: "YES", intent: 2 },
    candidate: { children: "YES", intent: 2 },
    expected: {
      eligibility: "ELIGIBLE",
      confidenceBand: "MEDIUM",
      hasScore: true,
    },
  },
  {
    id: "36-identical-input-deterministic",
    requester: allAligned,
    candidate: allAligned,
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.planning.structurePreference",
      mutualStatus: "ALIGNED",
    },
  },
  {
    id: "37-medium-source-confidence",
    requester: { ...allAligned, confidence: 0.82 },
    candidate: { ...allAligned, confidence: 0.82 },
    expected: { eligibility: "ELIGIBLE", confidenceBand: "HIGH" },
  },
  {
    id: "38-low-source-confidence-unavailable",
    requester: { ...allAligned, confidence: 0.2 },
    candidate: { ...allAligned, confidence: 0.2 },
    expected: {
      eligibility: "ELIGIBLE",
      confidenceBand: "LOW",
      hasScore: false,
    },
  },
  {
    id: "39-one-sided-optional-missing",
    requester: { ...allAligned, social: undefined },
    candidate: allAligned,
    expected: {
      eligibility: "ELIGIBLE",
      factorKey: "sharedLife.lifestyle.socialActivityPreference",
      contributionAvailable: false,
    },
  },
  {
    id: "40-candidate-required-missing",
    requester: allAligned,
    candidate: { ...allAligned, children: undefined },
    candidateReady: false,
    expected: {
      eligibility: "REQUIRED_DATA_MISSING",
      factorKey: "lifePlans.family.childrenIntent",
      contributionAvailable: false,
    },
  },
] as const;

assert.equal(GOLDEN_FIXTURES.length, 40);

const skillLevel = (score: number): SkillLevel =>
  score < 0.4 ? "BASIC" : score < 0.75 ? "INTERMEDIATE" : "ADVANCED";

const actualValue = (
  key: string,
  spec: ActualSpec,
): FactorValue | undefined => {
  switch (key) {
    case "lifePlans.family.childrenIntent":
      return spec.children
        ? { kind: "CONSTRAINT", value: spec.children }
        : undefined;
    case "lifePlans.relationship.intent": {
      const intent = spec.intent;
      if (intent === undefined) return undefined;
      const values = [
        "GETTING_TO_KNOW",
        "OPEN_TO_RELATIONSHIP",
        "LOOKING_FOR_LONG_TERM",
      ] as const;
      return { kind: "ORDINAL", rank: intent, value: values[intent] };
    }
    case "sharedLife.planning.structurePreference":
      return spec.structure === undefined
        ? undefined
        : { kind: "SCALAR", value: spec.structure };
    case "sharedLife.lifestyle.socialActivityPreference":
      return spec.social === undefined
        ? undefined
        : { kind: "SCALAR", value: spec.social };
    case "sharedLife.roles.cleaningPreference":
      return spec.cleaning === undefined
        ? undefined
        : { kind: "SCALAR", value: spec.cleaning };
    case "sharedLife.values.relationshipPriority":
      return spec.priority === undefined
        ? undefined
        : { kind: "SCALAR", value: spec.priority };
    case "communication.conflict.repairSkill":
      return spec.repair === undefined
        ? undefined
        : {
            kind: "MASTERY",
            score01: spec.repair,
            level: skillLevel(spec.repair),
          };
    default:
      return undefined;
  }
};

const actualProfile = (
  ownerId: string,
  spec: ActualSpec,
  ready = true,
): MatchingActualProfile => {
  const factors = MVP_FACTOR_REGISTRY.factors.flatMap((definition) => {
    if (!definition.matchingPolicy?.enabled) return [];
    const value = actualValue(definition.key, spec);
    if (!value) return [];
    const factor: MatchingActualFactor = {
      factorKey: definition.key,
      definitionVersion: definition.definitionVersion,
      snapshotId: `${ownerId}:${definition.key}:snapshot`,
      snapshotRevision: 1,
      snapshotInputHash: `${ownerId}:${definition.key}:input`,
      snapshotOutputHash: `${ownerId}:${definition.key}:output`,
      grantRevision: 1,
      grantConsentRevision: `${ownerId}:consent:1`,
      value,
      confidence: spec.confidence ?? 0.9,
    };
    return [factor];
  });
  return {
    ownerId,
    revision: 1,
    registryKey: MVP_FACTOR_REGISTRY.registryKey,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    registryHash: MVP_FACTOR_REGISTRY.hash,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    factors,
    issues: [],
    activation: {
      ready,
      missingRequiredFactorKeys: ready
        ? []
        : MVP_FACTOR_REGISTRY.factors
            .filter(
              (factor) =>
                factor.matchingPolicy?.requiredData !== "OPTIONAL" &&
                !factors.some((actual) => actual.factorKey === factor.key),
            )
            .map((factor) => factor.key)
            .sort(),
    },
    inputHash: `${ownerId}:actual:${JSON.stringify(spec)}:${ready}`,
    projectedAt: NOW,
  };
};

const preferenceInput = (
  specification: PreferenceSpec,
): PartnerPreferenceInput => {
  const hard = specification.hard === true;
  const flexibility: MatchingFlexibility = hard ? "NON_NEGOTIABLE" : "PREFER";
  const constraintMode: MatchingConstraintMode = hard ? "HARD" : "SOFT";
  return specification.allowedValues
    ? {
        factorKey: specification.factorKey,
        desiredValue: {
          kind: "CONSTRAINT_SET",
          allowedValues: specification.allowedValues,
        },
        importance: hard ? "CRITICAL" : "HIGH",
        flexibility,
        constraintMode,
      }
    : {
        factorKey: specification.factorKey,
        desiredValue: {
          kind: "SCALAR_RANGE",
          minimum: specification.minimum ?? 0,
          maximum: specification.maximum ?? 1,
        },
        importance: "HIGH",
        flexibility,
        constraintMode,
      };
};

const preferences = (
  ownerId: string,
  specifications: readonly PreferenceSpec[] = [],
  revision = 1,
) =>
  validatePartnerPreferenceProfile({
    ownerId,
    revision,
    registryKey: MVP_FACTOR_REGISTRY.registryKey,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    preferences: specifications.map(preferenceInput),
    updatedAt: NOW,
    release: MVP_FACTOR_REGISTRY,
  });

const evaluationFor = (fixture: GoldenFixture): MatchingEvaluation =>
  evaluateMatching({
    release: MVP_FACTOR_REGISTRY,
    requesterActualProfile: actualProfile(
      "requester",
      fixture.requester,
      fixture.requesterReady ?? true,
    ),
    candidateActualProfile: actualProfile(
      `candidate:${fixture.id}`,
      fixture.candidate,
      fixture.candidateReady ?? true,
    ),
    requesterPreferences: preferences(
      "requester",
      fixture.requesterPreferences,
    ),
    candidatePreferences: preferences(
      `candidate:${fixture.id}`,
      fixture.candidatePreferences,
    ),
    calculatedAt: NOW,
  });

const directionalBalance = (
  evaluation: MatchingEvaluation,
): GoldenExpectation["directionalBalance"] => {
  const requester = evaluation.requesterExpectationFit.fit;
  const candidate = evaluation.candidateExpectationFit.fit;
  if (requester === undefined && candidate === undefined) return "BALANCED";
  if ((requester ?? 0) > (candidate ?? 0)) return "REQUESTER_HIGHER";
  if ((candidate ?? 0) > (requester ?? 0)) return "CANDIDATE_HIGHER";
  return "BALANCED";
};

const evaluations: MatchingEvaluation[] = [];
for (const fixture of GOLDEN_FIXTURES) {
  const evaluation = evaluationFor(fixture);
  evaluations.push(evaluation);
  if (evaluation.ranking.score01 !== undefined) {
    assert.ok(
      Number.isFinite(evaluation.ranking.score01) &&
        evaluation.ranking.score01 >= 0 &&
        evaluation.ranking.score01 <= 1,
      fixture.id,
    );
  }
  if (evaluation.ranking.confidenceAdjustedScore01 !== undefined) {
    assert.ok(
      Number.isFinite(evaluation.ranking.confidenceAdjustedScore01) &&
        evaluation.ranking.confidenceAdjustedScore01 >= 0 &&
        evaluation.ranking.confidenceAdjustedScore01 <= 1,
      fixture.id,
    );
  }
  assert.equal(
    evaluation.eligibility.status,
    fixture.expected.eligibility,
    fixture.id,
  );
  if (fixture.expected.confidenceBand) {
    assert.equal(
      projectMatchingCandidateIntelligence(evaluation).confidenceBand,
      fixture.expected.confidenceBand,
      fixture.id,
    );
  }
  if (fixture.expected.hasScore !== undefined) {
    assert.equal(
      evaluation.ranking.score01 !== undefined,
      fixture.expected.hasScore,
      fixture.id,
    );
  }
  if (fixture.expected.directionalBalance) {
    assert.equal(
      directionalBalance(evaluation),
      fixture.expected.directionalBalance,
      fixture.id,
    );
  }
  if (fixture.expected.factorKey) {
    const result = evaluation.factorResults.find(
      (candidate) => candidate.factorKey === fixture.expected.factorKey,
    );
    assert.ok(result, fixture.id);
    if (fixture.expected.mutualStatus) {
      assert.equal(
        result.mutualFactorFit.pairEvaluation?.status,
        fixture.expected.mutualStatus,
        fixture.id,
      );
    }
    if (fixture.expected.contributionAvailable !== undefined) {
      assert.equal(
        result.contribution !== undefined,
        fixture.expected.contributionAvailable,
        fixture.id,
      );
    }
  }
}

const deterministicA = evaluationFor(GOLDEN_FIXTURES[35]);
const deterministicB = evaluationFor(GOLDEN_FIXTURES[35]);
assert.equal(deterministicA.inputHash, deterministicB.inputHash);
assert.equal(deterministicA.evaluationId, deterministicB.evaluationId);
assert.deepEqual(deterministicA.factorResults, deterministicB.factorResults);

const hardRejected = evaluations.find(
  (evaluation) => evaluation.eligibility.status === "HARD_REJECT",
);
assert.ok(hardRejected);
assert.ok(!rankMatchingEvaluations(evaluations).includes(hardRejected));

const tied = [
  { ...deterministicA, candidateId: "candidate-b" },
  { ...deterministicA, candidateId: "candidate-a" },
];
assert.deepEqual(
  rankMatchingEvaluations(tied).map((evaluation) => evaluation.candidateId),
  ["candidate-a", "candidate-b"],
);

assert.equal(
  isMatchingEvaluationCurrent(deterministicA, deterministicA.versions),
  true,
);
const staleVersionStates = [
  {
    ...deterministicA.versions,
    requesterActualRevision:
      deterministicA.versions.requesterActualRevision + 1,
  },
  {
    ...deterministicA.versions,
    candidateActualRevision:
      deterministicA.versions.candidateActualRevision + 1,
  },
  {
    ...deterministicA.versions,
    requesterPreferenceRevision:
      deterministicA.versions.requesterPreferenceRevision + 1,
  },
  {
    ...deterministicA.versions,
    candidatePreferenceRevision:
      deterministicA.versions.candidatePreferenceRevision + 1,
  },
  {
    ...deterministicA.versions,
    registryVersion: deterministicA.versions.registryVersion + 1,
  },
  {
    ...deterministicA.versions,
    registryHash: "different-registry-hash",
  },
  {
    ...deterministicA.versions,
    algorithmVersion: deterministicA.versions.algorithmVersion + 1,
  },
  {
    ...deterministicA.versions,
    requesterActualInputHash: "requester-grant-revoked",
  },
  {
    ...deterministicA.versions,
    candidateActualInputHash: "candidate-grant-revoked",
  },
  {
    ...deterministicA.versions,
    requesterPreferenceInputHash: "requester-preference-changed",
  },
  {
    ...deterministicA.versions,
    candidatePreferenceInputHash: "candidate-preference-changed",
  },
] as const;
for (const stale of staleVersionStates) {
  assert.equal(isMatchingEvaluationCurrent(deterministicA, stale), false);
}

const safeProjection = projectMatchingCandidateIntelligence(deterministicA);
assert.deepEqual(Object.keys(safeProjection).sort(), [
  "candidateId",
  "confidenceBand",
  "eligibility",
  "explanations",
]);
assert.ok(deterministicA.explanations.length <= 3);
assert.ok(
  deterministicA.explanations.every((explanation) =>
    MVP_FACTOR_REGISTRY.factors.some(
      (factor) =>
        factor.privacyClass === "NORMAL" &&
        factor.displayKeys.explanationKey === explanation.key,
    ),
  ),
);

assert.throws(
  () =>
    preferences("requester", [
      {
        factorKey: "sharedLife.planning.structurePreference",
        minimum: -1,
        maximum: 1,
        hard: true,
      },
    ]),
  (error) =>
    error instanceof MatchingPreferenceValidationError &&
    error.issues.some((issue) => issue.code === "HARD_CONSTRAINT_NOT_ALLOWED"),
);

console.log(
  JSON.stringify({
    ok: true,
    literalGoldenFixtures: GOLDEN_FIXTURES.length,
    deterministicTieBreak: true,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  }),
);
