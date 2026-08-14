import { createHash } from "node:crypto";
import { verifyFactorRegistryRelease } from "@/domain/model/definitions/registry";
import {
  isSnapshotEffectiveAt,
  snapshotVersionsMatchRegistry,
  type IndividualFactorSnapshot,
} from "@/domain/model/snapshots/snapshots";
import {
  isAvailableFactorValue,
  validateFactorValue,
} from "@/domain/model/values/factorValue";
import type {
  BuildMatchingActualProfileInput,
  MatchingActualFactor,
  MatchingActualProfile,
  MatchingActualProfileIssue,
  MatchingUseGrant,
} from "@/domain/model/matching/intelligence/types";
import { matchingEnabledFactorDefinitions } from "@/domain/model/matching/intelligence/policy";

export class MatchingActualProfileBuildError extends Error {
  readonly reasonCode:
    | "OWNER_INVALID"
    | "REVISION_INVALID"
    | "PROJECTED_AT_INVALID"
    | "REGISTRY_INVALID";

  constructor(reasonCode: MatchingActualProfileBuildError["reasonCode"]) {
    super(reasonCode);
    this.name = "MatchingActualProfileBuildError";
    this.reasonCode = reasonCode;
  }
}

const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("|")).digest("hex");

const latestSnapshot = (
  snapshots: readonly IndividualFactorSnapshot[],
  factorKey: string,
): IndividualFactorSnapshot | undefined =>
  snapshots
    .filter((snapshot) => snapshot.factorKey === factorKey)
    .sort(
      (left, right) =>
        right.revision - left.revision ||
        right.calculatedAt.getTime() - left.calculatedAt.getTime() ||
        left.snapshotId.localeCompare(right.snapshotId),
    )[0];

const latestGrant = (
  grants: readonly MatchingUseGrant[],
  factorKey: string,
): MatchingUseGrant | undefined =>
  grants
    .filter((grant) => grant.factorKey === factorKey)
    .sort(
      (left, right) =>
        right.revision - left.revision ||
        right.grantedAt.getTime() - left.grantedAt.getTime() ||
        left.consentRevision.localeCompare(right.consentRevision),
    )[0];

const grantIsActive = (grant: MatchingUseGrant, at: Date): boolean =>
  grant.allowed &&
  grant.ownerId.trim().length > 0 &&
  Number.isInteger(grant.revision) &&
  grant.revision >= 0 &&
  grant.consentRevision.trim().length > 0 &&
  Number.isFinite(grant.grantedAt.getTime()) &&
  grant.grantedAt.getTime() <= at.getTime() &&
  (!grant.revokedAt || grant.revokedAt.getTime() > at.getTime());

const issue = (
  factorKey: string,
  code: MatchingActualProfileIssue["code"],
  required: boolean,
): MatchingActualProfileIssue => ({ factorKey, code, required });

export function buildMatchingActualProfile(
  input: BuildMatchingActualProfileInput,
): MatchingActualProfile {
  if (!input.ownerId.trim()) {
    throw new MatchingActualProfileBuildError("OWNER_INVALID");
  }
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    throw new MatchingActualProfileBuildError("REVISION_INVALID");
  }
  if (!Number.isFinite(input.projectedAt.getTime())) {
    throw new MatchingActualProfileBuildError("PROJECTED_AT_INVALID");
  }
  if (
    input.release.status !== "PUBLISHED" ||
    !verifyFactorRegistryRelease(input.release)
  ) {
    throw new MatchingActualProfileBuildError("REGISTRY_INVALID");
  }

  const factors: MatchingActualFactor[] = [];
  const issues: MatchingActualProfileIssue[] = [];

  for (const definition of matchingEnabledFactorDefinitions(input.release)) {
    const required = definition.matchingPolicy?.requiredData !== "OPTIONAL";
    const grant = latestGrant(input.grants, definition.key);
    if (!grant || grant.ownerId !== input.ownerId) {
      issues.push(issue(definition.key, "GRANT_MISSING", required));
      continue;
    }
    if (!grantIsActive(grant, input.projectedAt)) {
      issues.push(issue(definition.key, "GRANT_REVOKED", required));
      continue;
    }

    const snapshot = latestSnapshot(input.snapshots, definition.key);
    if (!snapshot) {
      issues.push(issue(definition.key, "SNAPSHOT_MISSING", required));
      continue;
    }
    if (snapshot.subjectId !== input.ownerId) {
      issues.push(issue(definition.key, "SNAPSHOT_OWNER_INVALID", required));
      continue;
    }
    if (snapshot.contextPairId !== undefined) {
      issues.push(issue(definition.key, "SNAPSHOT_PAIR_SCOPED", required));
      continue;
    }
    if (snapshot.projectionPurpose !== "MATCHING") {
      issues.push(issue(definition.key, "SNAPSHOT_PURPOSE_INVALID", required));
      continue;
    }
    if (!isSnapshotEffectiveAt(snapshot, input.projectedAt)) {
      issues.push(issue(definition.key, "SNAPSHOT_NOT_CURRENT", required));
      continue;
    }
    if (
      !snapshotVersionsMatchRegistry(
        snapshot.versions,
        definition,
        input.release,
      )
    ) {
      issues.push(issue(definition.key, "SNAPSHOT_VERSION_MISMATCH", required));
      continue;
    }
    const valueValidation = validateFactorValue(
      definition.valueSchema,
      snapshot.value,
    );
    if (
      snapshot.status !== "AVAILABLE" ||
      !valueValidation.valid ||
      !isAvailableFactorValue(snapshot.value)
    ) {
      issues.push(
        issue(definition.key, "SNAPSHOT_VALUE_UNAVAILABLE", required),
      );
      continue;
    }
    if (
      !Number.isFinite(snapshot.metrics.confidence) ||
      snapshot.metrics.confidence <
        definition.confidenceRequirements.minimumSnapshotConfidence
    ) {
      issues.push(issue(definition.key, "SNAPSHOT_CONFIDENCE_LOW", required));
      continue;
    }
    factors.push({
      factorKey: definition.key,
      definitionVersion: definition.definitionVersion,
      snapshotId: snapshot.snapshotId,
      snapshotRevision: snapshot.revision,
      snapshotInputHash: snapshot.inputHash,
      snapshotOutputHash: snapshot.outputHash,
      grantRevision: grant.revision,
      grantConsentRevision: grant.consentRevision,
      value: snapshot.value,
      confidence: snapshot.metrics.confidence,
    });
  }

  const orderedFactors = factors.sort((left, right) =>
    left.factorKey.localeCompare(right.factorKey),
  );
  const orderedIssues = issues.sort((left, right) =>
    `${left.factorKey}:${left.code}`.localeCompare(
      `${right.factorKey}:${right.code}`,
    ),
  );
  const missingRequiredFactorKeys = [
    ...new Set(
      orderedIssues
        .filter((item) => item.required)
        .map((item) => item.factorKey),
    ),
  ].sort();
  const inputHash = hash([
    "MATCHING_ACTUAL_PROFILE",
    input.ownerId,
    String(input.revision),
    input.release.registryKey,
    String(input.release.registryVersion),
    input.release.hash,
    String(input.release.algorithmVersion),
    ...orderedFactors.map(
      (factor) =>
        `${factor.factorKey}:${factor.definitionVersion}:${factor.snapshotId}:${factor.snapshotRevision}:${factor.snapshotInputHash}:${factor.snapshotOutputHash}:${factor.grantRevision}:${factor.grantConsentRevision}`,
    ),
    ...orderedIssues.map(
      (item) =>
        `${item.factorKey}:${item.code}:${item.required ? "REQUIRED" : "OPTIONAL"}`,
    ),
  ]);

  return {
    ownerId: input.ownerId,
    revision: input.revision,
    registryKey: input.release.registryKey,
    registryVersion: input.release.registryVersion,
    registryHash: input.release.hash,
    algorithmVersion: input.release.algorithmVersion,
    snapshotVersion: input.release.snapshotVersion,
    factors: orderedFactors,
    issues: orderedIssues,
    activation: {
      ready: missingRequiredFactorKeys.length === 0,
      missingRequiredFactorKeys,
    },
    inputHash,
    projectedAt: new Date(input.projectedAt.getTime()),
  };
}
