import { assertMatchingSolo } from "./matchingEligibility.service";
import { createHash } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { DomainError } from "@/domain/errors";
import { factorEvidenceSelectionWindow } from "@/domain/model/aggregation/factorAggregation";
import { MVP_FACTOR_REGISTRY } from "@/domain/model/definitions/mvpDefinitions";
import type { FactorDefinition } from "@/domain/model/definitions/definitionTypes";
import {
  createEvidenceEvent,
  type EvidenceEvent as DomainEvidenceEvent,
} from "@/domain/model/evidence/evidence";
import {
  buildMatchingActualProfile,
  validatePartnerPreferenceProfile,
  type MatchingActualProfile,
  type MatchingUseGrant as DomainMatchingUseGrant,
  type PartnerPreferenceInput,
  type PartnerPreferenceProfile as DomainPartnerPreferenceProfile,
} from "@/domain/model/matching/intelligence";
import {
  buildIndividualFactorSnapshot,
  type IndividualFactorSnapshot as DomainIndividualFactorSnapshot,
} from "@/domain/model/snapshots/snapshots";
import {
  isAvailableFactorValue,
  skillLevelForScore,
  type FactorValue,
} from "@/domain/model/values/factorValue";
import {
  materializeIndividualFactorSnapshot,
  seedDefinitionRegistryRelease,
  upsertEvidenceEvent,
} from "@/domain/services/factorEnginePersistence.service";
import { connectToDatabase } from "@/lib/mongodb";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { EvidenceEvent, type EvidenceEventType } from "@/models/EvidenceEvent";
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from "@/models/IndividualFactorSnapshot";
import {
  MatchingProfile,
  type MatchingActualInput,
  type MatchingCard,
  type MatchingProfileType,
} from "@/models/MatchingProfile";
import {
  MatchingUseGrant,
  type MatchingUseGrantType,
} from "@/models/MatchingUseGrant";
import {
  PartnerPreferenceProfile,
  type PartnerPreferenceProfileType,
  type StoredPartnerPreference,
} from "@/models/PartnerPreferenceProfile";
import { fromStoredFactorValue } from "@/models/factorEngineSchemas";
import { User, type UserType } from "@/models/User";

const MATERIALIZATION_RETRY_LIMIT = 5;

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const deterministicId = (prefix: string, parts: readonly string[]): string =>
  `${prefix}_${sha256(parts.join("|")).slice(0, 40)}`;

const matchingDefinitions = (): readonly FactorDefinition[] =>
  MVP_FACTOR_REGISTRY.factors
    .filter((factor) => factor.matchingPolicy?.enabled === true)
    .sort((left, right) => left.key.localeCompare(right.key));

export const matchingFactorKeys = (): readonly string[] =>
  matchingDefinitions().map((factor) => factor.key);

const requiredPreferenceFactorKeys = (): readonly string[] =>
  matchingDefinitions()
    .filter((factor) => factor.matchingPolicy?.requiredData !== "OPTIONAL")
    .map((factor) => factor.key);

const domainError = (code: string, status: number, message: string): never => {
  throw new DomainError({ code, status, message });
};

const mongoRetryable = (error: Error): boolean => {
  const candidate = error as Error & { code?: number; errorLabels?: string[] };
  return (
    candidate.code === 11000 ||
    candidate.code === 112 ||
    candidate.errorLabels?.includes("TransientTransactionError") === true ||
    candidate.errorLabels?.includes("UnknownTransactionCommitResult") === true
  );
};

const runTransaction = async <Result>(
  operation: (session: ClientSession) => Promise<Result>,
): Promise<Result> => {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(() => operation(session));
      if (result === undefined)
        throw new Error("Matching transaction returned no result");
      return result;
    } catch (caught) {
      const error =
        caught instanceof Error
          ? caught
          : new Error("Matching transaction failed");
      lastError = error;
      if (!mongoRetryable(error) || attempt === 2) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError ?? new Error("Matching transaction failed");
};

const factorValueFor = (
  factor: FactorDefinition,
  actual: MatchingActualInput,
): FactorValue | undefined => {
  switch (factor.key) {
    case "lifePlans.relationship.intent": {
      if (!actual.relationshipIntent) return undefined;
      const schema = factor.valueSchema;
      if (schema.type !== "ORDINAL") return undefined;
      const level = schema.levels.find(
        (candidate) => candidate.value === actual.relationshipIntent,
      );
      return level
        ? { kind: "ORDINAL", value: level.value, rank: level.rank }
        : undefined;
    }
    case "lifePlans.family.childrenIntent":
      return actual.childrenIntent
        ? { kind: "CONSTRAINT", value: actual.childrenIntent }
        : undefined;
    case "sharedLife.planning.structurePreference":
      return actual.structurePreference === undefined
        ? undefined
        : { kind: "SCALAR", value: actual.structurePreference };
    case "sharedLife.lifestyle.socialActivityPreference":
      return actual.socialActivityPreference === undefined
        ? undefined
        : { kind: "SCALAR", value: actual.socialActivityPreference };
    case "sharedLife.roles.cleaningPreference":
      return actual.cleaningPreference === undefined
        ? undefined
        : { kind: "SCALAR", value: actual.cleaningPreference };
    case "communication.conflict.repairSkill": {
      if (
        actual.repairSkill === undefined ||
        factor.valueSchema.type !== "MASTERY"
      ) {
        return undefined;
      }
      return {
        kind: "MASTERY",
        score01: actual.repairSkill,
        level: skillLevelForScore(actual.repairSkill, factor.valueSchema),
      };
    }
    case "sharedLife.values.relationshipPriority":
      return actual.relationshipPriority === undefined
        ? undefined
        : { kind: "SCALAR", value: actual.relationshipPriority };
    default:
      return undefined;
  }
};

const matchingMeasurementFor = (factorKey: string) => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) =>
      candidate.factorKey === factorKey &&
      candidate.key.startsWith("matching."),
  );
  if (!measurement) {
    return domainError(
      "MATCHING_DEFINITION_MISSING",
      500,
      "Matching measurement is not published",
    );
  }
  return measurement;
};

const matchingInstrument = () => {
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === "matching.profile.mvp",
  );
  if (!instrument) {
    return domainError(
      "MATCHING_DEFINITION_MISSING",
      500,
      "Matching instrument is not published",
    );
  }
  return instrument;
};

const createActualEvidence = (input: {
  ownerId: string;
  publicCardRevision: number;
  actual: MatchingActualInput;
  factor: FactorDefinition;
  now: Date;
}): DomainEvidenceEvent => {
  // A full profile replacement must also replace previously supplied optional
  // answers.  Persisting an explicit unavailable value prevents an older
  // snapshot from silently remaining eligible after the owner chooses
  // "do not specify".
  const submittedValue: FactorValue = factorValueFor(
    input.factor,
    input.actual,
  ) ?? {
    kind: "UNKNOWN",
    reasonCode: "NOT_ANSWERED",
  };
  const measurement = matchingMeasurementFor(input.factor.key);
  const instrument = matchingInstrument();
  const identity = [
    MVP_FACTOR_REGISTRY.registryKey,
    String(MVP_FACTOR_REGISTRY.registryVersion),
    input.ownerId,
    String(input.publicCardRevision),
    input.factor.key,
  ];
  const event = createEvidenceEvent(
    {
      eventId: deterministicId("fev", identity),
      idempotencyKey: deterministicId("matching-profile", identity),
      actorId: input.ownerId,
      subjectKind: "INDIVIDUAL",
      subjectId: input.ownerId,
      observationScope: "SELF",
      factorKey: input.factor.key,
      measurementKey: measurement.key,
      instrumentKey: instrument.key,
      sourceType: measurement.sourceType,
      sourceRef: `matching-profile:${input.ownerId}`,
      sourceRevision: `card-${input.publicCardRevision}`,
      submittedValue,
      reliabilityMultiplier: 1,
      observedAt: input.now,
      recordedAt: input.now,
      context: "DATING",
      purpose: "MATCHING",
      privacyClass: input.factor.privacyClass,
      captureMode: "PAIR_MODEL_ONLY",
      policyVersion: "matching-profile-v1",
      consentRevision: `matching-card:${input.publicCardRevision}`,
      retentionClass: "OWNER_CONTROLLED",
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    },
    input.factor,
    measurement,
    instrument,
  );
  if (event.status === "REJECTED") {
    return domainError(
      "MATCHING_EVIDENCE_REJECTED",
      409,
      "Matching profile data is incompatible with the published registry",
    );
  }
  return event;
};

const toDomainMatchingEvidence = (
  stored: EvidenceEventType,
): DomainEvidenceEvent => {
  if (stored.status !== "ACCEPTED" || !stored.normalizedValue) {
    return domainError(
      "MATCHING_STORED_EVIDENCE_INVALID",
      500,
      "Stored matching evidence is invalid",
    );
  }
  return {
    eventId: stored.eventId,
    idempotencyKey: stored.idempotencyKey,
    actorId: stored.actorId,
    subjectKind: stored.subjectKind,
    subjectId: stored.subjectId,
    ...(stored.pairId ? { pairId: stored.pairId } : {}),
    observationScope: stored.observationScope,
    ...(stored.observedSubjectId
      ? { observedSubjectId: stored.observedSubjectId }
      : {}),
    factorKey: stored.factorKey,
    measurementKey: stored.measurementKey,
    instrumentKey: stored.instrumentKey,
    sourceType: stored.sourceType,
    sourceRef: stored.sourceRef,
    sourceRevision: stored.sourceRevision,
    sourceHash: stored.sourceHash,
    submittedValue: fromStoredFactorValue(stored.submittedValue),
    normalizedValue: fromStoredFactorValue(stored.normalizedValue),
    reliability: stored.reliability,
    observedAt: new Date(stored.observedAt.getTime()),
    recordedAt: new Date(stored.recordedAt.getTime()),
    context: stored.context,
    purpose: stored.purpose,
    privacyClass: stored.privacyClass,
    captureMode: stored.captureMode,
    policyVersion: stored.policyVersion,
    consentRevision: stored.consentRevision,
    retentionClass: stored.retentionClass,
    versions: { ...stored.versions },
    inputHash: stored.inputHash,
    status: "ACCEPTED",
  };
};

const matchingEvidenceHistory = async (input: {
  ownerId: string;
  factor: FactorDefinition;
  event: DomainEvidenceEvent;
  session: ClientSession;
}): Promise<readonly DomainEvidenceEvent[]> => {
  if (
    input.event.status !== "ACCEPTED" ||
    !isAvailableFactorValue(input.event.normalizedValue)
  ) {
    // A full profile replacement uses an explicit UNKNOWN event to clear an
    // optional answer. Older values must not leak back into the new snapshot.
    return [input.event];
  }
  const selection = factorEvidenceSelectionWindow(
    input.factor,
    input.event.recordedAt,
  );
  const stored = await EvidenceEvent.find({
    subjectKind: "INDIVIDUAL",
    subjectId: input.ownerId,
    pairId: { $exists: false },
    observationScope: "SELF",
    factorKey: input.factor.key,
    purpose: "MATCHING",
    captureMode: "PAIR_MODEL_ONLY",
    status: "ACCEPTED",
    "versions.registryVersion": MVP_FACTOR_REGISTRY.registryVersion,
    "versions.definitionVersion": input.factor.definitionVersion,
    "versions.algorithmVersion": MVP_FACTOR_REGISTRY.algorithmVersion,
    observedAt: {
      $lte: selection.evidenceCutoffAt,
      ...(selection.earliestObservedAt
        ? { $gte: selection.earliestObservedAt }
        : {}),
    },
    recordedAt: { $lte: selection.evidenceCutoffAt },
  })
    .sort({ observedAt: -1, eventId: -1 })
    .limit(selection.maximumEvents)
    .session(input.session)
    .lean<EvidenceEventType[]>();

  const chronological = [...stored].reverse();
  const invalidReference = chronological.some((event) => {
    const measurement = MVP_FACTOR_REGISTRY.measurements.find(
      (candidate) => candidate.key === event.measurementKey,
    );
    const instrument = MVP_FACTOR_REGISTRY.instruments.find(
      (candidate) => candidate.key === event.instrumentKey,
    );
    return !(
      measurement &&
      instrument &&
      measurement.factorKey === input.factor.key &&
      measurement.sourceType === event.sourceType &&
      measurement.measurementVersion === event.versions.measurementVersion &&
      instrument.instrumentVersion === event.versions.instrumentVersion &&
      instrument.measurementKeys.includes(measurement.key)
    );
  });
  if (invalidReference) {
    return domainError(
      "MATCHING_STORED_EVIDENCE_INVALID",
      500,
      "Stored matching evidence references an unpublished definition",
    );
  }
  return chronological.map(toDomainMatchingEvidence);
};

const materializeActualSnapshot = async (input: {
  ownerId: string;
  factor: FactorDefinition;
  event: DomainEvidenceEvent;
  session: ClientSession;
}): Promise<DomainIndividualFactorSnapshot> => {
  const events = await matchingEvidenceHistory(input);
  const provisional = buildIndividualFactorSnapshot({
    snapshotId: "provisional",
    subjectId: input.ownerId,
    projectionPurpose: "MATCHING",
    factor: input.factor,
    events,
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt: input.event.recordedAt,
  });
  const existing = await IndividualFactorSnapshot.findOne({
    subjectId: input.ownerId,
    contextPairId: { $exists: false },
    projectionPurpose: "MATCHING",
    factorKey: input.factor.key,
    inputHash: provisional.inputHash,
    "versions.registryVersion": MVP_FACTOR_REGISTRY.registryVersion,
  })
    .session(input.session)
    .lean<IndividualFactorSnapshotType | null>();
  if (existing) return toDomainSnapshot(existing);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const latest = await IndividualFactorSnapshot.findOne({
      subjectId: input.ownerId,
      contextPairId: { $exists: false },
      projectionPurpose: "MATCHING",
      factorKey: input.factor.key,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .session(input.session)
      .lean<{ revision: number } | null>();
    try {
      return await materializeIndividualFactorSnapshot(
        {
          snapshotId: deterministicId("ifs", [
            input.ownerId,
            "MATCHING",
            input.factor.key,
            provisional.inputHash,
          ]),
          subjectId: input.ownerId,
          projectionPurpose: "MATCHING",
          factor: input.factor,
          events,
          revision: (latest?.revision ?? -1) + 1,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt: input.event.recordedAt,
        },
        MVP_FACTOR_REGISTRY,
        { session: input.session },
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !mongoRetryable(error) ||
        attempt === MATERIALIZATION_RETRY_LIMIT - 1
      ) {
        throw error;
      }
    }
  }
  throw new Error("Matching snapshot materialization failed");
};

const toDomainSnapshot = (
  stored: IndividualFactorSnapshotType,
): DomainIndividualFactorSnapshot => ({
  snapshotId: stored.snapshotId,
  subjectId: stored.subjectId,
  ...(stored.contextPairId ? { contextPairId: stored.contextPairId } : {}),
  projectionPurpose: stored.projectionPurpose,
  factorKey: stored.factorKey,
  revision: stored.revision,
  status: stored.status,
  value: fromStoredFactorValue(stored.value),
  metrics: stored.metrics,
  evidenceIds: [...stored.evidenceIds],
  versions: stored.versions,
  inputHash: stored.inputHash,
  outputHash: stored.outputHash,
  calculatedAt: stored.calculatedAt,
  effectiveFrom: stored.effectiveFrom,
  ...(stored.effectiveUntil ? { effectiveUntil: stored.effectiveUntil } : {}),
});

const latestSnapshots = async (input: {
  ownerIds: readonly string[];
  session?: ClientSession;
}): Promise<DomainIndividualFactorSnapshot[]> => {
  const query = IndividualFactorSnapshot.find({
    subjectId: { $in: [...input.ownerIds] },
    contextPairId: { $exists: false },
    projectionPurpose: "MATCHING",
    factorKey: { $in: [...matchingFactorKeys()] },
    "versions.registryVersion": MVP_FACTOR_REGISTRY.registryVersion,
    "versions.algorithmVersion": MVP_FACTOR_REGISTRY.algorithmVersion,
    "versions.snapshotVersion": MVP_FACTOR_REGISTRY.snapshotVersion,
  }).sort({ subjectId: 1, factorKey: 1, revision: -1 });
  if (input.session) query.session(input.session);
  const rows = await query.lean<IndividualFactorSnapshotType[]>();
  const latest = new Map<string, IndividualFactorSnapshotType>();
  for (const row of rows) {
    const key = `${row.subjectId}|${row.factorKey}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()].map(toDomainSnapshot);
};

export const loadOwnMatchingActualInput = async (
  ownerId: string,
): Promise<MatchingActualInput> => {
  await connectToDatabase();
  const snapshots = await latestSnapshots({ ownerIds: [ownerId] });
  const actual: MatchingActualInput = {};
  for (const snapshot of snapshots) {
    if (snapshot.subjectId !== ownerId || snapshot.status !== "AVAILABLE")
      continue;
    const value = snapshot.value;
    switch (snapshot.factorKey) {
      case "lifePlans.relationship.intent":
        if (value.kind === "ORDINAL") {
          actual.relationshipIntent =
            value.value as MatchingActualInput["relationshipIntent"];
        }
        break;
      case "lifePlans.family.childrenIntent":
        if (value.kind === "CONSTRAINT") {
          actual.childrenIntent =
            value.value as MatchingActualInput["childrenIntent"];
        }
        break;
      case "sharedLife.planning.structurePreference":
        if (value.kind === "SCALAR") actual.structurePreference = value.value;
        break;
      case "sharedLife.lifestyle.socialActivityPreference":
        if (value.kind === "SCALAR")
          actual.socialActivityPreference = value.value;
        break;
      case "sharedLife.roles.cleaningPreference":
        if (value.kind === "SCALAR") actual.cleaningPreference = value.value;
        break;
      case "communication.conflict.repairSkill":
        if (value.kind === "MASTERY") actual.repairSkill = value.score01;
        break;
      case "sharedLife.values.relationshipPriority":
        if (value.kind === "SCALAR") actual.relationshipPriority = value.value;
        break;
    }
  }
  return actual;
};

const latestGrants = async (input: {
  ownerIds: readonly string[];
  session?: ClientSession;
}): Promise<DomainMatchingUseGrant[]> => {
  const query = MatchingUseGrant.find({
    ownerId: { $in: [...input.ownerIds] },
    factorKey: { $in: [...matchingFactorKeys()] },
  }).sort({ ownerId: 1, factorKey: 1, revision: -1 });
  if (input.session) query.session(input.session);
  const rows = await query.lean<MatchingUseGrantType[]>();
  const latest = new Map<string, MatchingUseGrantType>();
  for (const row of rows) {
    const key = `${row.ownerId}|${row.factorKey}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()].map((row) => ({
    ownerId: row.ownerId,
    factorKey: row.factorKey,
    allowed: row.allowed,
    revision: row.revision,
    consentRevision: row.consentRevision,
    grantedAt: row.grantedAt,
    ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
  }));
};

const storedTarget = (
  preference: PartnerPreferenceInput,
): StoredPartnerPreference => {
  const target = preference.desiredValue;
  if (target.kind === "SCALAR_RANGE") {
    return {
      factorKey: preference.factorKey,
      targetKind: target.kind,
      minimum: target.minimum,
      maximum: target.maximum,
      importance: preference.importance,
      flexibility: preference.flexibility,
      constraintMode: preference.constraintMode,
    };
  }
  if (target.kind === "ROLE_TARGET") {
    return {
      factorKey: preference.factorKey,
      targetKind: target.kind,
      minimum: target.desiredPreferenceMinimum,
      maximum: target.desiredPreferenceMaximum,
      importance: preference.importance,
      flexibility: preference.flexibility,
      constraintMode: preference.constraintMode,
    };
  }
  return {
    factorKey: preference.factorKey,
    targetKind: target.kind,
    allowedValues: [...target.allowedValues],
    importance: preference.importance,
    flexibility: preference.flexibility,
    constraintMode: preference.constraintMode,
  };
};

const domainTarget = (
  stored: StoredPartnerPreference,
): PartnerPreferenceInput => {
  const base = {
    factorKey: stored.factorKey,
    importance: stored.importance,
    flexibility: stored.flexibility,
    constraintMode: stored.constraintMode,
  };
  if (stored.targetKind === "SCALAR_RANGE") {
    return {
      ...base,
      desiredValue: {
        kind: stored.targetKind,
        minimum: stored.minimum ?? 0,
        maximum: stored.maximum ?? 0,
      },
    };
  }
  if (stored.targetKind === "ROLE_TARGET") {
    return {
      ...base,
      desiredValue: {
        kind: stored.targetKind,
        desiredPreferenceMinimum: stored.minimum ?? 0,
        desiredPreferenceMaximum: stored.maximum ?? 0,
      },
    };
  }
  return {
    ...base,
    desiredValue: {
      kind: stored.targetKind,
      allowedValues: [...(stored.allowedValues ?? [])],
    },
  };
};

export const loadDomainPreferenceProfiles = async (input: {
  ownerIds: readonly string[];
  session?: ClientSession;
}): Promise<DomainPartnerPreferenceProfile[]> => {
  const query = PartnerPreferenceProfile.find({
    ownerId: { $in: [...input.ownerIds] },
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  }).sort({ ownerId: 1, revision: -1 });
  if (input.session) query.session(input.session);
  const rows = await query.lean<
    Array<{
      ownerId: string;
      revision: number;
      registryKey: string;
      registryVersion: number;
      registryHash: string;
      preferences: StoredPartnerPreference[];
      inputHash: string;
      updatedAt: Date;
    }>
  >();
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows)
    if (!latest.has(row.ownerId)) latest.set(row.ownerId, row);
  return [...latest.values()].map((row) => {
    const validated = validatePartnerPreferenceProfile({
      ownerId: row.ownerId,
      revision: row.revision,
      registryKey: row.registryKey,
      registryVersion: row.registryVersion,
      preferences: row.preferences.map(domainTarget),
      updatedAt: row.updatedAt,
      release: MVP_FACTOR_REGISTRY,
    });
    if (
      row.registryHash !== validated.registryHash ||
      row.inputHash !== validated.inputHash
    ) {
      return domainError(
        "MATCHING_PREFERENCE_PROFILE_CONFLICT",
        500,
        "Stored matching preferences failed integrity validation",
      );
    }
    return validated;
  });
};

export const loadMatchingActualProfileSources = async (input: {
  ownerIds: readonly string[];
  session?: ClientSession;
}): Promise<
  Array<{
    ownerId: string;
    revision: number;
    snapshots: DomainIndividualFactorSnapshot[];
    grants: DomainMatchingUseGrant[];
  }>
> => {
  const profileQuery = MatchingProfile.find({
    userId: { $in: [...input.ownerIds] },
  }).select({ userId: 1, actualProfileRevision: 1 });
  if (input.session) profileQuery.session(input.session);
  let profiles: Array<{ userId: string; actualProfileRevision: number }>;
  let snapshots: DomainIndividualFactorSnapshot[];
  let grants: DomainMatchingUseGrant[];
  if (input.session) {
    // Keep session-bound operations serial; each query is already batched for
    // every requested owner and factor, so this does not introduce N+1 reads.
    profiles =
      await profileQuery.lean<
        Array<{ userId: string; actualProfileRevision: number }>
      >();
    snapshots = await latestSnapshots(input);
    grants = await latestGrants(input);
  } else {
    [profiles, snapshots, grants] = await Promise.all([
      profileQuery.lean<
        Array<{ userId: string; actualProfileRevision: number }>
      >(),
      latestSnapshots(input),
      latestGrants(input),
    ]);
  }
  const revisionByOwner = new Map(
    profiles.map((profile) => [profile.userId, profile.actualProfileRevision]),
  );
  return input.ownerIds.map((ownerId) => ({
    ownerId,
    revision: revisionByOwner.get(ownerId) ?? 0,
    snapshots: snapshots.filter((snapshot) => snapshot.subjectId === ownerId),
    grants: grants.filter((grant) => grant.ownerId === ownerId),
  }));
};

const readinessFor = (input: {
  ownerId: string;
  revision: number;
  snapshots: readonly DomainIndividualFactorSnapshot[];
  grants: readonly DomainMatchingUseGrant[];
  preferences: DomainPartnerPreferenceProfile;
  now: Date;
}): {
  actualProfile: MatchingActualProfile;
  ready: boolean;
  missing: string[];
} => {
  const actualProfile = buildMatchingActualProfile({
    ownerId: input.ownerId,
    revision: input.revision,
    release: MVP_FACTOR_REGISTRY,
    snapshots: input.snapshots,
    grants: input.grants,
    projectedAt: input.now,
  });
  const preferenceKeys = new Set(
    input.preferences.preferences.map((preference) => preference.factorKey),
  );
  const missing = [
    ...actualProfile.activation.missingRequiredFactorKeys,
    ...requiredPreferenceFactorKeys().filter((key) => !preferenceKeys.has(key)),
  ]
    .filter((key, index, all) => all.indexOf(key) === index)
    .sort();
  return { actualProfile, ready: missing.length === 0, missing };
};

const projectDiscovery = async (input: {
  profile: Pick<
    MatchingProfileType,
    | "userId"
    | "active"
    | "requiredDataReady"
    | "publicCardRevision"
    | "actualProfileRevision"
    | "preferenceRevision"
    | "registryVersion"
    | "algorithmVersion"
  >;
  projectionHash: string;
  session: ClientSession;
}): Promise<void> => {
  const user = await User.findOne({ id: input.profile.userId })
    .select({ id: 1, personal: 1, location: 1 })
    .session(input.session)
    .lean<Pick<UserType, "id" | "personal" | "location"> | null>();
  if (!user || user.personal.age < 18) {
    return domainError(
      "MATCHING_ADULT_REQUIRED",
      409,
      "Matching is available to adults only",
    );
  }
  const coordinates = user.location?.coordinates;
  const hasUsableLocation =
    user.location?.type === "Point" &&
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1]) &&
    coordinates[0] >= -180 &&
    coordinates[0] <= 180 &&
    coordinates[1] >= -90 &&
    coordinates[1] <= 90;
  if (input.profile.active && !hasUsableLocation) {
    return domainError(
      "MATCHING_LOCATION_REQUIRED",
      409,
      "Add a valid location before activating matching",
    );
  }
  const discoveryProjectionHash = sha256(
    JSON.stringify({
      profileProjectionHash: input.projectionHash,
      age: user.personal.age,
      city: user.personal.city,
      location: hasUsableLocation ? user.location : null,
    }),
  );
  await CandidateDiscoveryProjection.findOneAndUpdate(
    { userId: input.profile.userId },
    {
      $set: {
        active: input.profile.active,
        requiredDataReady: input.profile.requiredDataReady,
        age: user.personal.age,
        city: user.personal.city,
        ...(hasUsableLocation ? { location: user.location } : {}),
        relationshipIntent: "SEEKING_RELATIONSHIP",
        publicCardRevision: input.profile.publicCardRevision,
        actualProfileRevision: input.profile.actualProfileRevision,
        preferenceRevision: input.profile.preferenceRevision,
        registryVersion: input.profile.registryVersion,
        algorithmVersion: input.profile.algorithmVersion,
        projectionHash: discoveryProjectionHash,
      },
      ...(hasUsableLocation ? {} : { $unset: { location: 1 } }),
    },
    { upsert: true, new: true, runValidators: true, session: input.session },
  );
};

export type SaveMatchingProfileInput = {
  ownerId: string;
  card: MatchingCard;
  soughtGender?: "ANY" | "male" | "female";
  actual: MatchingActualInput;
  desiredAgeRange: { min: number; max: number };
  maxDistanceKm: number;
  discoveryRequested: boolean;
  operationKey: string;
  now?: Date;
};

export const saveMatchingProfile = async (
  input: SaveMatchingProfileInput,
): Promise<{
  profile: MatchingProfileType;
  missingRequiredTopics: string[];
  replayed: boolean;
}> => {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const operationKeyHash = sha256(
    JSON.stringify([
      "matching-card-operation-v1",
      input.ownerId,
      input.operationKey,
    ]),
  );
  const operationRequestHash = sha256(
    JSON.stringify({
      card: input.card,
      actual: input.actual,
      soughtGender: input.soughtGender ?? "ANY",
      desiredAgeRange: input.desiredAgeRange,
      maxDistanceKm: input.maxDistanceKm,
      discoveryRequested: input.discoveryRequested,
    }),
  );
  return runTransaction(async (session) => {
    if (input.discoveryRequested) await assertMatchingSolo([input.ownerId], session);
    await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, now, { session });
    const previous = await MatchingProfile.findOne({ userId: input.ownerId })
      .select("+lastCardOperationKeyHash +lastCardOperationRequestHash")
      .session(session)
      .lean<MatchingProfileType | null>();
    if (previous?.lastCardOperationKeyHash === operationKeyHash) {
      if (previous.lastCardOperationRequestHash !== operationRequestHash) {
        return domainError(
          "IDEMPOTENCY_KEY_REUSE_CONFLICT",
          409,
          "Idempotency key was used with another matching card request",
        );
      }
      return { profile: previous, missingRequiredTopics: [], replayed: true };
    }
    const fenced = await User.updateOne(
      { id: input.ownerId },
      { $inc: { pairMembershipRevision: 1 } },
      { session },
    );
    if (fenced.matchedCount !== 1) {
      return domainError(
        "NOT_FOUND",
        404,
        "Matching profile owner was not found",
      );
    }
    if (input.discoveryRequested) await assertMatchingSolo([input.ownerId], session);
    const publicCardRevision = (previous?.publicCardRevision ?? 0) + 1;
    const actualProfileRevision = (previous?.actualProfileRevision ?? 0) + 1;

    const snapshots: DomainIndividualFactorSnapshot[] = [];
    for (const factor of matchingDefinitions()) {
      const event = createActualEvidence({
        ownerId: input.ownerId,
        publicCardRevision,
        actual: input.actual,
        factor,
        now,
      });
      await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY, { session });
      snapshots.push(
        await materializeActualSnapshot({
          ownerId: input.ownerId,
          factor,
          event,
          session,
        }),
      );
    }

    const sources = await loadMatchingActualProfileSources({
      ownerIds: [input.ownerId],
      session,
    });
    const preferences = await loadDomainPreferenceProfiles({
      ownerIds: [input.ownerId],
      session,
    });
    const source = sources[0];
    const latestByFactor = new Map(
      [...source.snapshots, ...snapshots].map((snapshot) => [
        snapshot.factorKey,
        snapshot,
      ]),
    );
    const preferenceProfile =
      preferences[0] ??
      validatePartnerPreferenceProfile({
        ownerId: input.ownerId,
        revision: 0,
        registryKey: MVP_FACTOR_REGISTRY.registryKey,
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        preferences: [],
        updatedAt: now,
        release: MVP_FACTOR_REGISTRY,
      });
    const readiness = readinessFor({
      ownerId: input.ownerId,
      revision: actualProfileRevision,
      snapshots: [...latestByFactor.values()],
      grants: source.grants,
      preferences: preferenceProfile,
      now,
    });
    const active = input.discoveryRequested && readiness.ready;
    const projectionHash = sha256(
      JSON.stringify({
        ownerId: input.ownerId,
        publicCardRevision,
        actualProfileRevision,
        preferenceRevision: preferenceProfile.revision,
        active,
        requiredDataReady: readiness.ready,
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      }),
    );
    const profile = await MatchingProfile.findOneAndUpdate(
      {
        userId: input.ownerId,
        ...(previous
          ? { publicCardRevision: previous.publicCardRevision }
          : { publicCardRevision: { $exists: false } }),
      },
      {
        $set: {
          card: input.card,
          discoveryRequested: input.discoveryRequested,
          active,
          requiredDataReady: readiness.ready,
          soughtGender: input.soughtGender ?? "ANY",
      desiredAgeRange: input.desiredAgeRange,
          maxDistanceKm: input.maxDistanceKm,
          publicCardRevision,
          actualProfileRevision,
          preferenceRevision: preferenceProfile.revision,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          projectionHash,
          lastCardOperationKeyHash: operationKeyHash,
          lastCardOperationRequestHash: operationRequestHash,
        },
        $setOnInsert: { userId: input.ownerId },
        $unset: { actual: 1 },
      },
      { upsert: true, new: true, runValidators: true, session },
    );
    if (!profile) {
      return domainError(
        "MATCHING_PROFILE_CONFLICT",
        409,
        "Matching profile changed concurrently",
      );
    }
    await projectDiscovery({ profile, projectionHash, session });
    await User.updateOne(
      { id: input.ownerId },
      {
        $set: {
          "profile.matchCard": {
            requirements: input.card.requirements,
            give: input.card.give,
            questions: input.card.questions,
            isActive: profile.active,
            updatedAt: now,
          },
        },
      },
      { session },
    );
    return {
      profile: profile.toObject(),
      missingRequiredTopics: readiness.missing,
      replayed: false,
    };
  });
};

export type UpdatePreferenceInput = PartnerPreferenceInput & {
  useAllowed: boolean;
};

export const updateMatchingPreferenceProfile = async (input: {
  ownerId: string;
  expectedRevision: number;
  preferences: readonly UpdatePreferenceInput[];
  operationKey: string;
  now?: Date;
}): Promise<{
  preferences: DomainPartnerPreferenceProfile;
  grants: DomainMatchingUseGrant[];
  missingRequiredTopics: string[];
  replayed: boolean;
}> => {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const operationKeyHash = sha256(
    JSON.stringify([
      "matching-preferences-operation-v1",
      input.ownerId,
      input.operationKey,
    ]),
  );
  const operationRequestHash = sha256(
    JSON.stringify({
      expectedRevision: input.expectedRevision,
      preferences: input.preferences,
    }),
  );
  return runTransaction(async (session) => {
    await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, now, { session });
    const replay = await PartnerPreferenceProfile.findOne({
      ownerId: input.ownerId,
      operationKeyHash,
    })
      .select("+operationKeyHash +operationRequestHash")
      .session(session)
      .lean<PartnerPreferenceProfileType | null>();
    if (replay) {
      if (replay.operationRequestHash !== operationRequestHash) {
        return domainError(
          "IDEMPOTENCY_KEY_REUSE_CONFLICT",
          409,
          "Idempotency key was used with another matching preference request",
        );
      }
      const currentPreferences = await loadDomainPreferenceProfiles({
        ownerIds: [input.ownerId],
        session,
      });
      const sources = await loadMatchingActualProfileSources({
        ownerIds: [input.ownerId],
        session,
      });
      const currentProfile = await MatchingProfile.findOne({
        userId: input.ownerId,
      })
        .session(session)
        .lean<MatchingProfileType | null>();
      const currentPreference = currentPreferences[0];
      const source = sources[0];
      if (!currentPreference || !source || !currentProfile) {
        return domainError(
          "MATCHING_PROFILE_CONFLICT",
          409,
          "Matching preference replay cannot be reconstructed",
        );
      }
      const readiness = readinessFor({
        ownerId: input.ownerId,
        revision: currentProfile.actualProfileRevision,
        snapshots: source.snapshots,
        grants: source.grants,
        preferences: currentPreference,
        now,
      });
      return {
        preferences: currentPreference,
        grants: source.grants,
        missingRequiredTopics: readiness.missing,
        replayed: true,
      };
    }
    const fenced = await User.updateOne(
      { id: input.ownerId },
      { $inc: { pairMembershipRevision: 1 } },
      { session },
    );
    if (fenced.matchedCount !== 1) {
      return domainError(
        "NOT_FOUND",
        404,
        "Matching profile owner was not found",
      );
    }
    const profile = await MatchingProfile.findOne({ userId: input.ownerId })
      .session(session)
      .lean<MatchingProfileType | null>();
    if (!profile) {
      return domainError(
        "MATCHING_PROFILE_REQUIRED",
        409,
        "Create a matching card first",
      );
    }
    if (profile.preferenceRevision !== input.expectedRevision) {
      return domainError(
        "MATCHING_PREFERENCES_STALE",
        409,
        "Matching preferences changed; reload and try again",
      );
    }
    const revision = input.expectedRevision + 1;
    // The purpose grant is the storage boundary too: an explicitly denied
    // preference must not remain in the profile that the evaluator consumes.
    // Omission/false below still creates a revocation row for prior grants.
    const allowedPreferences = input.preferences.filter(
      (preference) => preference.useAllowed,
    );
    const preferences = validatePartnerPreferenceProfile({
      ownerId: input.ownerId,
      revision,
      registryKey: MVP_FACTOR_REGISTRY.registryKey,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      preferences: allowedPreferences.map((preference) => ({
        factorKey: preference.factorKey,
        desiredValue: preference.desiredValue,
        importance: preference.importance,
        flexibility: preference.flexibility,
        constraintMode: preference.constraintMode,
      })),
      updatedAt: now,
      release: MVP_FACTOR_REGISTRY,
    });
    await PartnerPreferenceProfile.create(
      [
        {
          ownerId: input.ownerId,
          revision,
          registryKey: MVP_FACTOR_REGISTRY.registryKey,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          registryHash: MVP_FACTOR_REGISTRY.hash,
          preferences: preferences.preferences.map(storedTarget),
          inputHash: preferences.inputHash,
          operationKeyHash,
          operationRequestHash,
        },
      ],
      { session },
    );

    const submittedByFactor = new Map(
      input.preferences.map((preference) => [preference.factorKey, preference]),
    );
    for (const factorKey of matchingFactorKeys()) {
      const preference = submittedByFactor.get(factorKey);
      const current = await MatchingUseGrant.findOne({
        ownerId: input.ownerId,
        factorKey,
      })
        .sort({ revision: -1 })
        .select({ revision: 1, allowed: 1 })
        .session(session)
        .lean<Pick<MatchingUseGrantType, "revision" | "allowed"> | null>();
      const allowed = preference?.useAllowed === true;
      if (!preference && !current?.allowed) continue;
      await MatchingUseGrant.create(
        [
          {
            ownerId: input.ownerId,
            factorKey,
            revision: (current?.revision ?? 0) + 1,
            allowed,
            consentRevision: `matching-preferences:${revision}`,
            grantedAt: now,
            ...(allowed ? {} : { revokedAt: now }),
          },
        ],
        { session },
      );
    }

    const actualProfileRevision = profile.actualProfileRevision + 1;
    const sources = await loadMatchingActualProfileSources({
      ownerIds: [input.ownerId],
      session,
    });
    const readiness = readinessFor({
      ownerId: input.ownerId,
      revision: actualProfileRevision,
      snapshots: sources[0].snapshots,
      grants: sources[0].grants,
      preferences,
      now,
    });
    const active = profile.discoveryRequested && readiness.ready;
    const projectionHash = sha256(
      JSON.stringify({
        ownerId: input.ownerId,
        publicCardRevision: profile.publicCardRevision,
        actualProfileRevision,
        preferenceRevision: revision,
        active,
        requiredDataReady: readiness.ready,
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      }),
    );
    const updated = await MatchingProfile.findOneAndUpdate(
      { userId: input.ownerId, preferenceRevision: input.expectedRevision },
      {
        $set: {
          preferenceRevision: revision,
          actualProfileRevision,
          active,
          requiredDataReady: readiness.ready,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          projectionHash,
        },
      },
      { new: true, runValidators: true, session },
    );
    if (!updated) {
      return domainError(
        "MATCHING_PREFERENCES_STALE",
        409,
        "Matching preferences changed; reload and try again",
      );
    }
    await projectDiscovery({ profile: updated, projectionHash, session });
    await User.updateOne(
      { id: input.ownerId },
      {
        $set: {
          "profile.matchCard.isActive": active,
          "profile.matchCard.updatedAt": now,
        },
      },
      { session },
    );
    return {
      preferences,
      grants: sources[0].grants,
      missingRequiredTopics: readiness.missing,
      replayed: false,
    };
  });
};

export const getMatchingReadiness = async (
  ownerId: string,
): Promise<{
  ready: boolean;
  missing: string[];
}> => {
  await connectToDatabase();
  const profile = await MatchingProfile.findOne({
    userId: ownerId,
  }).lean<MatchingProfileType | null>();
  if (!profile)
    return { ready: false, missing: requiredPreferenceFactorKeys().slice() };
  const [sources, preferences] = await Promise.all([
    loadMatchingActualProfileSources({ ownerIds: [ownerId] }),
    loadDomainPreferenceProfiles({ ownerIds: [ownerId] }),
  ]);
  const preferenceProfile =
    preferences[0] ??
    validatePartnerPreferenceProfile({
      ownerId,
      revision: 0,
      registryKey: MVP_FACTOR_REGISTRY.registryKey,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      preferences: [],
      updatedAt: new Date(),
      release: MVP_FACTOR_REGISTRY,
    });
  const readiness = readinessFor({
    ownerId,
    revision: profile.actualProfileRevision,
    snapshots: sources[0].snapshots,
    grants: sources[0].grants,
    preferences: preferenceProfile,
    now: new Date(),
  });
  return { ready: readiness.ready, missing: readiness.missing };
};
