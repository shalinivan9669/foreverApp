import assert from "node:assert/strict";
import { MVP_FACTOR_REGISTRY } from "@/domain/model/definitions/mvpDefinitions";
import {
  buildMatchingActualProfile,
  projectMatchingCandidateIntelligence,
  validatePartnerPreferenceProfile,
  type MatchingEvaluation,
  type MatchingUseGrant,
  type PartnerPreferenceProfile,
} from "@/domain/model/matching/intelligence";
import type { IndividualFactorSnapshot } from "@/domain/model/snapshots/snapshots";
import type {
  FactorValue,
  SkillLevel,
} from "@/domain/model/values/factorValue";
import {
  createMatchingIntelligenceService,
  type MatchingActualProfileSource,
  type MatchingIntelligencePorts,
} from "@/domain/services/matching/intelligence";

const NOW = new Date("2026-08-13T12:00:00.000Z");

const skillLevel = (score: number): SkillLevel =>
  score < 0.4 ? "BASIC" : score < 0.75 ? "INTERMEDIATE" : "ADVANCED";

const valueFor = (factorKey: string, variant: number): FactorValue => {
  switch (factorKey) {
    case "lifePlans.family.childrenIntent":
      return { kind: "CONSTRAINT", value: "YES" };
    case "lifePlans.relationship.intent":
      return {
        kind: "ORDINAL",
        value: "LOOKING_FOR_LONG_TERM",
        rank: 2,
      };
    case "communication.conflict.repairSkill": {
      const score = 0.72 + variant * 0.03;
      return { kind: "MASTERY", score01: score, level: skillLevel(score) };
    }
    case "sharedLife.planning.structurePreference":
      return { kind: "SCALAR", value: 0.1 + variant * 0.2 };
    case "sharedLife.lifestyle.socialActivityPreference":
      return { kind: "SCALAR", value: -0.2 + variant * 0.2 };
    case "sharedLife.roles.cleaningPreference":
      return { kind: "SCALAR", value: 0.15 + variant * 0.35 };
    case "sharedLife.values.relationshipPriority":
      return { kind: "SCALAR", value: 0.75 };
    default:
      throw new Error(`NO_VALUE_FOR_${factorKey}`);
  }
};

const matchingMeasurement = (factorKey: string) => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) =>
      candidate.factorKey === factorKey &&
      candidate.key.startsWith("matching."),
  );
  assert.ok(measurement, factorKey);
  return measurement;
};

const matchingInstrument = MVP_FACTOR_REGISTRY.instruments.find(
  (instrument) => instrument.key === "matching.profile.mvp",
);
assert.ok(matchingInstrument);

const snapshotFor = (
  ownerId: string,
  factorKey: string,
  variant: number,
  overrides: Partial<IndividualFactorSnapshot> = {},
): IndividualFactorSnapshot => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === factorKey,
  );
  assert.ok(factor);
  const measurement = matchingMeasurement(factorKey);
  const base: IndividualFactorSnapshot = {
    snapshotId: `${ownerId}:${factorKey}:snapshot:1`,
    subjectId: ownerId,
    projectionPurpose: "MATCHING",
    factorKey,
    revision: 1,
    status: "AVAILABLE",
    value: valueFor(factorKey, variant),
    metrics: {
      confidence: 0.9,
      coverage: 1,
      freshness: 1,
      consistency: 1,
      evidenceCount: 1,
    },
    evidenceIds: [`${ownerId}:${factorKey}:evidence:1`],
    versions: {
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      definitionVersion: factor.definitionVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
      displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
      measurementRefs: [
        { key: measurement.key, version: measurement.measurementVersion },
      ],
      instrumentRefs: [
        {
          key: matchingInstrument.key,
          version: matchingInstrument.instrumentVersion,
        },
      ],
    },
    inputHash: `${ownerId}:${factorKey}:input:1`,
    outputHash: `${ownerId}:${factorKey}:output:1`,
    calculatedAt: new Date("2026-08-13T00:00:00.000Z"),
    effectiveFrom: new Date("2026-08-13T00:00:00.000Z"),
  };
  return { ...base, ...overrides };
};

const grantsFor = (ownerId: string): readonly MatchingUseGrant[] =>
  MVP_FACTOR_REGISTRY.factors
    .filter((factor) => factor.matchingPolicy?.enabled)
    .map((factor) => ({
      ownerId,
      factorKey: factor.key,
      allowed: true,
      revision: 1,
      consentRevision: `${ownerId}:matching-consent:1`,
      grantedAt: new Date("2026-08-12T00:00:00.000Z"),
    }));

const sourceFor = (
  ownerId: string,
  variant: number,
): MatchingActualProfileSource => ({
  ownerId,
  revision: 1,
  snapshots: MVP_FACTOR_REGISTRY.factors
    .filter((factor) => factor.matchingPolicy?.enabled)
    .map((factor) => snapshotFor(ownerId, factor.key, variant)),
  grants: grantsFor(ownerId),
});

const preferencesFor = (ownerId: string): PartnerPreferenceProfile =>
  validatePartnerPreferenceProfile({
    ownerId,
    revision: 1,
    registryKey: MVP_FACTOR_REGISTRY.registryKey,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    preferences: [],
    updatedAt: NOW,
    release: MVP_FACTOR_REGISTRY,
  });

const sources = [
  sourceFor("requester", 0),
  sourceFor("candidate-a", 1),
  sourceFor("candidate-b", 2),
];
const preferenceProfiles = sources.map((source) =>
  preferencesFor(source.ownerId),
);

const persistedByHash = new Map<string, MatchingEvaluation>();
let registryLoads = 0;
let sourceBatchLoads = 0;
let preferenceBatchLoads = 0;
let evaluationBatchLoads = 0;
let evaluationBatchWrites = 0;

const ports: MatchingIntelligencePorts = {
  async loadPublishedRegistry() {
    registryLoads += 1;
    return MVP_FACTOR_REGISTRY;
  },
  async loadActualProfileSources(input) {
    sourceBatchLoads += 1;
    assert.ok(input.ownerIds.length <= 3);
    assert.equal(
      input.factorKeys.length,
      MVP_FACTOR_REGISTRY.factors.filter(
        (factor) => factor.matchingPolicy?.enabled,
      ).length,
    );
    return sources.filter((source) => input.ownerIds.includes(source.ownerId));
  },
  async loadPreferenceProfiles(input) {
    preferenceBatchLoads += 1;
    return preferenceProfiles.filter((profile) =>
      input.ownerIds.includes(profile.ownerId),
    );
  },
  async loadEvaluationsByInputHashes(inputHashes) {
    evaluationBatchLoads += 1;
    return inputHashes.flatMap((inputHash) => {
      const stored = persistedByHash.get(inputHash);
      return stored ? [stored] : [];
    });
  },
  async persistEvaluations(evaluations) {
    evaluationBatchWrites += 1;
    for (const evaluation of evaluations) {
      const existing = persistedByHash.get(evaluation.inputHash);
      assert.ok(!existing || existing.evaluationId === evaluation.evaluationId);
      persistedByHash.set(evaluation.inputHash, evaluation);
    }
    return evaluations;
  },
};

async function main(): Promise<void> {
  const service = createMatchingIntelligenceService(ports);
  const ranked = await service.rankCandidates(
    "requester",
    ["candidate-b", "candidate-a"],
    NOW,
  );
  assert.equal(ranked.length, 2);
  assert.equal(registryLoads, 1);
  assert.equal(sourceBatchLoads, 1, "actual profiles must batch-load");
  assert.equal(preferenceBatchLoads, 1, "preferences must batch-load");
  assert.equal(evaluationBatchLoads, 1);
  assert.equal(evaluationBatchWrites, 1);
  assert.equal(persistedByHash.size, 2);
  assert.ok(
    ranked.every(
      (evaluation) =>
        projectMatchingCandidateIntelligence(evaluation).eligibility ===
        "ELIGIBLE",
    ),
  );

  const replayed = await service.rankCandidates(
    "requester",
    ["candidate-a", "candidate-b"],
    NOW,
  );
  assert.deepEqual(
    replayed.map((evaluation) => evaluation.evaluationId),
    ranked.map((evaluation) => evaluation.evaluationId),
  );
  assert.equal(sourceBatchLoads, 2);
  assert.equal(preferenceBatchLoads, 2);
  assert.equal(evaluationBatchLoads, 2);
  assert.equal(
    evaluationBatchWrites,
    1,
    "canonical input replay must not write another evaluation",
  );

  const requesterSource = sources[0];
  const validProfile = buildMatchingActualProfile({
    ownerId: requesterSource.ownerId,
    revision: requesterSource.revision,
    release: MVP_FACTOR_REGISTRY,
    snapshots: requesterSource.snapshots,
    grants: requesterSource.grants,
    projectedAt: NOW,
  });
  assert.equal(validProfile.activation.ready, true);
  assert.equal(validProfile.factors.length, 7);

  const requiredFactorKey = "lifePlans.family.childrenIntent";
  const revokedProfile = buildMatchingActualProfile({
    ownerId: requesterSource.ownerId,
    revision: 2,
    release: MVP_FACTOR_REGISTRY,
    snapshots: requesterSource.snapshots,
    grants: [
      ...requesterSource.grants,
      {
        ownerId: requesterSource.ownerId,
        factorKey: requiredFactorKey,
        allowed: false,
        revision: 2,
        consentRevision: "requester:matching-consent:2",
        grantedAt: new Date("2026-08-13T01:00:00.000Z"),
        revokedAt: new Date("2026-08-13T02:00:00.000Z"),
      },
    ],
    projectedAt: NOW,
  });
  assert.equal(revokedProfile.activation.ready, false);
  assert.ok(
    revokedProfile.issues.some(
      (issue) =>
        issue.factorKey === requiredFactorKey && issue.code === "GRANT_REVOKED",
    ),
  );
  assert.notEqual(revokedProfile.inputHash, validProfile.inputHash);

  const staleProfile = buildMatchingActualProfile({
    ownerId: requesterSource.ownerId,
    revision: 2,
    release: MVP_FACTOR_REGISTRY,
    snapshots: requesterSource.snapshots.map((snapshot) =>
      snapshot.factorKey === requiredFactorKey
        ? {
            ...snapshot,
            effectiveUntil: new Date("2026-08-13T11:00:00.000Z"),
          }
        : snapshot,
    ),
    grants: requesterSource.grants,
    projectedAt: NOW,
  });
  assert.equal(staleProfile.activation.ready, false);
  assert.ok(
    staleProfile.issues.some(
      (issue) =>
        issue.factorKey === requiredFactorKey &&
        issue.code === "SNAPSHOT_NOT_CURRENT",
    ),
  );

  const wrongPurposeProfile = buildMatchingActualProfile({
    ownerId: requesterSource.ownerId,
    revision: 2,
    release: MVP_FACTOR_REGISTRY,
    snapshots: requesterSource.snapshots.map((snapshot) =>
      snapshot.factorKey === requiredFactorKey
        ? { ...snapshot, projectionPurpose: "OWNER_PROFILE" }
        : snapshot,
    ),
    grants: requesterSource.grants,
    projectedAt: NOW,
  });
  assert.ok(
    wrongPurposeProfile.issues.some(
      (issue) =>
        issue.factorKey === requiredFactorKey &&
        issue.code === "SNAPSHOT_PURPOSE_INVALID",
    ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      candidates: ranked.length,
      registryLoads,
      sourceBatchLoads,
      preferenceBatchLoads,
      evaluationBatchLoads,
      evaluationBatchWrites,
      revokedGrantRejected: true,
      staleSnapshotRejected: true,
    }),
  );
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
