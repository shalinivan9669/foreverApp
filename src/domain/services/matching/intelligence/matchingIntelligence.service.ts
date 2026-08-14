import type { FactorRegistryRelease } from "@/domain/model/definitions/definitionTypes";
import {
  buildMatchingActualProfile,
  evaluateMatching,
  isMatchingEvaluationCurrent,
  matchingEnabledFactorDefinitions,
  rankMatchingEvaluations,
  validatePartnerPreferenceProfile,
  type MatchingActualProfile,
  type MatchingEvaluation,
  type MatchingUseGrant,
  type PartnerPreferenceProfile,
} from "@/domain/model/matching/intelligence";
import type { IndividualFactorSnapshot } from "@/domain/model/snapshots/snapshots";

export const MATCHING_PRE_RANKING_POOL_LIMIT = 200;

export type MatchingActualProfileSource = {
  ownerId: string;
  revision: number;
  snapshots: readonly IndividualFactorSnapshot[];
  grants: readonly MatchingUseGrant[];
};

export type MatchingIntelligencePorts = {
  loadPublishedRegistry: () => Promise<FactorRegistryRelease>;
  loadActualProfileSources: (input: {
    ownerIds: readonly string[];
    factorKeys: readonly string[];
    at: Date;
  }) => Promise<readonly MatchingActualProfileSource[]>;
  loadPreferenceProfiles: (input: {
    ownerIds: readonly string[];
    registryKey: string;
    registryVersion: number;
  }) => Promise<readonly PartnerPreferenceProfile[]>;
  loadEvaluationsByInputHashes?: (
    inputHashes: readonly string[],
  ) => Promise<readonly MatchingEvaluation[]>;
  persistEvaluations?: (
    evaluations: readonly MatchingEvaluation[],
  ) => Promise<readonly MatchingEvaluation[]>;
};

export type MatchingIntelligenceService = {
  buildActualProfile: (
    ownerId: string,
    at: Date,
  ) => Promise<MatchingActualProfile>;
  loadPreferences: (ownerId: string) => Promise<PartnerPreferenceProfile>;
  evaluate: (
    requesterId: string,
    candidateId: string,
    at: Date,
  ) => Promise<MatchingEvaluation>;
  rankCandidates: (
    requesterId: string,
    candidateIds: readonly string[],
    at: Date,
  ) => Promise<readonly MatchingEvaluation[]>;
};

export class MatchingIntelligenceServiceError extends Error {
  readonly reasonCode:
    | "OWNER_INVALID"
    | "CANDIDATE_POOL_INVALID"
    | "PROFILE_SOURCE_MISSING"
    | "PROFILE_SOURCE_DUPLICATE"
    | "PREFERENCE_PROFILE_DUPLICATE"
    | "PREFERENCE_PROFILE_CONFLICT"
    | "PERSISTED_EVALUATION_CONFLICT";

  constructor(reasonCode: MatchingIntelligenceServiceError["reasonCode"]) {
    super(reasonCode);
    this.name = "MatchingIntelligenceServiceError";
    this.reasonCode = reasonCode;
  }
}

const matchingFactorKeys = (
  release: FactorRegistryRelease,
): readonly string[] =>
  matchingEnabledFactorDefinitions(release)
    .map((factor) => factor.key)
    .sort();

const uniqueOwnerIds = (ownerIds: readonly string[]): readonly string[] =>
  [...new Set(ownerIds)].sort();

const sourceByOwner = (
  sources: readonly MatchingActualProfileSource[],
  ownerId: string,
): MatchingActualProfileSource => {
  const matches = sources.filter((source) => source.ownerId === ownerId);
  if (matches.length === 0) {
    throw new MatchingIntelligenceServiceError("PROFILE_SOURCE_MISSING");
  }
  if (matches.length > 1) {
    throw new MatchingIntelligenceServiceError("PROFILE_SOURCE_DUPLICATE");
  }
  return matches[0];
};

const preferenceByOwner = (
  profiles: readonly PartnerPreferenceProfile[],
  ownerId: string,
  release: FactorRegistryRelease,
  at: Date,
): PartnerPreferenceProfile => {
  const matches = profiles.filter((profile) => profile.ownerId === ownerId);
  if (matches.length > 1) {
    throw new MatchingIntelligenceServiceError("PREFERENCE_PROFILE_DUPLICATE");
  }
  const stored = matches[0];
  const validated = validatePartnerPreferenceProfile({
    ownerId,
    revision: stored?.revision ?? 0,
    registryKey: stored?.registryKey ?? release.registryKey,
    registryVersion: stored?.registryVersion ?? release.registryVersion,
    preferences: stored?.preferences ?? [],
    updatedAt: stored?.updatedAt ?? at,
    release,
  });
  if (
    stored &&
    (stored.registryHash !== validated.registryHash ||
      stored.inputHash !== validated.inputHash)
  ) {
    throw new MatchingIntelligenceServiceError("PREFERENCE_PROFILE_CONFLICT");
  }
  return validated;
};

const assertOwnerId = (ownerId: string): void => {
  if (!ownerId.trim()) {
    throw new MatchingIntelligenceServiceError("OWNER_INVALID");
  }
};

const loadInputs = async (
  ports: MatchingIntelligencePorts,
  ownerIds: readonly string[],
  at: Date,
): Promise<{
  release: FactorRegistryRelease;
  actualProfiles: readonly MatchingActualProfile[];
  preferenceProfiles: readonly PartnerPreferenceProfile[];
}> => {
  const release = await ports.loadPublishedRegistry();
  const orderedOwnerIds = uniqueOwnerIds(ownerIds);
  // Ports may be bound to the same MongoDB snapshot session. Dispatch their
  // already-batched reads serially because a ClientSession cannot be used by
  // concurrent operations.
  const sources = await ports.loadActualProfileSources({
    ownerIds: orderedOwnerIds,
    factorKeys: matchingFactorKeys(release),
    at,
  });
  const storedPreferences = await ports.loadPreferenceProfiles({
    ownerIds: orderedOwnerIds,
    registryKey: release.registryKey,
    registryVersion: release.registryVersion,
  });
  const actualProfiles = orderedOwnerIds.map((ownerId) => {
    const source = sourceByOwner(sources, ownerId);
    return buildMatchingActualProfile({
      ownerId,
      revision: source.revision,
      release,
      snapshots: source.snapshots,
      grants: source.grants,
      projectedAt: at,
    });
  });
  const preferenceProfiles = orderedOwnerIds.map((ownerId) =>
    preferenceByOwner(storedPreferences, ownerId, release, at),
  );
  return { release, actualProfiles, preferenceProfiles };
};

const actualByOwner = (
  profiles: readonly MatchingActualProfile[],
  ownerId: string,
): MatchingActualProfile => {
  const profile = profiles.find((candidate) => candidate.ownerId === ownerId);
  if (!profile) {
    throw new MatchingIntelligenceServiceError("PROFILE_SOURCE_MISSING");
  }
  return profile;
};

const materializeCanonical = async (
  ports: MatchingIntelligencePorts,
  evaluations: readonly MatchingEvaluation[],
): Promise<readonly MatchingEvaluation[]> => {
  const inputHashes = evaluations.map((evaluation) => evaluation.inputHash);
  const existing = ports.loadEvaluationsByInputHashes
    ? await ports.loadEvaluationsByInputHashes(inputHashes)
    : [];
  const existingByHash = new Map(
    existing.map((evaluation) => [evaluation.inputHash, evaluation]),
  );
  if (existingByHash.size !== existing.length) {
    throw new MatchingIntelligenceServiceError("PERSISTED_EVALUATION_CONFLICT");
  }
  const canonical = evaluations.map((evaluation) => {
    const found = existingByHash.get(evaluation.inputHash);
    if (
      found &&
      (found.evaluationId !== evaluation.evaluationId ||
        !isMatchingEvaluationCurrent(found, evaluation.versions))
    ) {
      throw new MatchingIntelligenceServiceError(
        "PERSISTED_EVALUATION_CONFLICT",
      );
    }
    return found ?? evaluation;
  });
  const missing = canonical.filter(
    (evaluation) => !existingByHash.has(evaluation.inputHash),
  );
  if (missing.length === 0 || !ports.persistEvaluations) return canonical;

  const persisted = await ports.persistEvaluations(missing);
  const persistedByHash = new Map(
    persisted.map((evaluation) => [evaluation.inputHash, evaluation]),
  );
  return canonical.map((evaluation) => {
    const stored = persistedByHash.get(evaluation.inputHash);
    if (!stored) {
      throw new MatchingIntelligenceServiceError(
        "PERSISTED_EVALUATION_CONFLICT",
      );
    }
    if (
      stored.evaluationId !== evaluation.evaluationId ||
      !isMatchingEvaluationCurrent(stored, evaluation.versions)
    ) {
      throw new MatchingIntelligenceServiceError(
        "PERSISTED_EVALUATION_CONFLICT",
      );
    }
    return stored;
  });
};

export function createMatchingIntelligenceService(
  ports: MatchingIntelligencePorts,
): MatchingIntelligenceService {
  return {
    async buildActualProfile(ownerId, at) {
      assertOwnerId(ownerId);
      const loaded = await loadInputs(ports, [ownerId], at);
      return actualByOwner(loaded.actualProfiles, ownerId);
    },

    async loadPreferences(ownerId) {
      assertOwnerId(ownerId);
      const now = new Date();
      const release = await ports.loadPublishedRegistry();
      const profiles = await ports.loadPreferenceProfiles({
        ownerIds: [ownerId],
        registryKey: release.registryKey,
        registryVersion: release.registryVersion,
      });
      return preferenceByOwner(profiles, ownerId, release, now);
    },

    async evaluate(requesterId, candidateId, at) {
      assertOwnerId(requesterId);
      assertOwnerId(candidateId);
      const loaded = await loadInputs(ports, [requesterId, candidateId], at);
      const evaluation = evaluateMatching({
        release: loaded.release,
        requesterActualProfile: actualByOwner(
          loaded.actualProfiles,
          requesterId,
        ),
        candidateActualProfile: actualByOwner(
          loaded.actualProfiles,
          candidateId,
        ),
        requesterPreferences: preferenceByOwner(
          loaded.preferenceProfiles,
          requesterId,
          loaded.release,
          at,
        ),
        candidatePreferences: preferenceByOwner(
          loaded.preferenceProfiles,
          candidateId,
          loaded.release,
          at,
        ),
        calculatedAt: at,
      });
      return (await materializeCanonical(ports, [evaluation]))[0];
    },

    async rankCandidates(requesterId, candidateIds, at) {
      assertOwnerId(requesterId);
      const boundedCandidateIds = uniqueOwnerIds(candidateIds).filter(
        (candidateId) => candidateId !== requesterId,
      );
      if (
        boundedCandidateIds.length === 0 ||
        boundedCandidateIds.length > MATCHING_PRE_RANKING_POOL_LIMIT ||
        boundedCandidateIds.some((candidateId) => !candidateId.trim())
      ) {
        throw new MatchingIntelligenceServiceError("CANDIDATE_POOL_INVALID");
      }
      const loaded = await loadInputs(
        ports,
        [requesterId, ...boundedCandidateIds],
        at,
      );
      const requesterActualProfile = actualByOwner(
        loaded.actualProfiles,
        requesterId,
      );
      const requesterPreferences = preferenceByOwner(
        loaded.preferenceProfiles,
        requesterId,
        loaded.release,
        at,
      );
      const evaluations = boundedCandidateIds.map((candidateId) =>
        evaluateMatching({
          release: loaded.release,
          requesterActualProfile,
          candidateActualProfile: actualByOwner(
            loaded.actualProfiles,
            candidateId,
          ),
          requesterPreferences,
          candidatePreferences: preferenceByOwner(
            loaded.preferenceProfiles,
            candidateId,
            loaded.release,
            at,
          ),
          calculatedAt: at,
        }),
      );
      return rankMatchingEvaluations(
        await materializeCanonical(ports, evaluations),
      );
    },
  };
}
