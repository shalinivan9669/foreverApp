import mongoose, { Types } from 'mongoose';
import { canonicalizeFactorRegistry } from '@/domain/model/definitions/registry';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  canonicalSnapshotCalculatedAt,
  snapshotVersionsMatchRegistry,
} from '@/domain/model/snapshots/snapshots';
import {
  processWeeklyFactorCheckIn,
  WEEKLY_FACTOR_KEYS,
} from '@/domain/services/factorEngineRuntime.service';
import {
  materializeOnboardingFactorEvidence,
} from '@/domain/services/onboardingFactorEngine.service';
import {
  seedDefinitionRegistryRelease,
} from '@/domain/services/factorEnginePersistence.service';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import {
  EvidenceEvent,
  type EvidenceEventType,
} from '@/models/EvidenceEvent';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import type {
  MvpOnboardingAnswer,
  MvpOnboardingConsent,
} from '@/models/MvpOnboardingSession';
import {
  PairFactorEvaluationSnapshot,
  type PairFactorEvaluationSnapshotType,
} from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { validateStoredSnapshotInterval } from '@/models/factorEngineSchemas';

export type FactorEngineMigrationMode = 'DRY_RUN' | 'NEW_ONLY';

type IndexKey = Record<string, number>;

type RawPair = {
  _id: Types.ObjectId;
  members?: string[];
};

type RawWeeklyAnswers = {
  closeness?: number;
  fatigue?: number;
  irritation?: number;
  readiness?: number;
};

type RawWeeklyCheckIn = {
  _id: Types.ObjectId;
  userId?: string;
  pairId?: string | Types.ObjectId | null;
  weekKey?: string;
  answers?: RawWeeklyAnswers;
  computed?: {
    factorEngine?: {
      status?: string;
      registryVersion?: number;
      evidenceEventIds?: string[];
      individualSnapshotIds?: string[];
      pairEvaluationSnapshotIds?: string[];
    };
  };
  createdAt?: Date;
  updatedAt?: Date;
};

type RawOnboardingSession = {
  _id: Types.ObjectId;
  userId?: string;
  status?: string;
  policyVersion?: string;
  consent?: MvpOnboardingConsent;
  answers?: MvpOnboardingAnswer[];
  factorEngine?: {
    status?: string;
    registryVersion?: number;
    evidenceEventIds?: string[];
    individualSnapshotIds?: string[];
  };
  completedAt?: Date;
};

export type WeeklyReplayReason =
  | 'PAIR_ID_INVALID'
  | 'PAIR_NOT_FOUND'
  | 'PAIR_MEMBERS_INVALID'
  | 'USER_NOT_PAIR_MEMBER'
  | 'PAIR_SCOPE_COLLISION'
  | 'USER_ID_INVALID'
  | 'WEEK_KEY_INVALID'
  | 'RAW_ANSWERS_INVALID'
  | 'OBSERVED_AT_INVALID'
  | 'NORMALIZATION_RACE'
  | 'RUNTIME_REPLAY_FAILED';

export type OnboardingReplayReason =
  | 'USER_ID_INVALID'
  | 'POLICY_VERSION_INVALID'
  | 'CONSENT_INVALID'
  | 'COMPLETED_AT_INVALID'
  | 'ANSWERS_INVALID'
  | 'RUNTIME_REPLAY_FAILED';

type ReasonCounts<T extends string> = Record<T, number>;

export type FactorEngineMigrationReport = {
  mode: FactorEngineMigrationMode;
  batchSize: number;
  asOf: string;
  registry: {
    currentVersion: number;
    present: boolean;
    matchesCanonical: boolean;
    wouldSeed: boolean;
    seeded: boolean;
  };
  indexes: {
    declared: number;
    missingBefore: number;
    duplicateUniqueGroups: number;
    obsoleteExactMatches: number;
    created: number;
    droppedObsoleteExactMatches: number;
  };
  weekly: {
    scanned: number;
    deferredAfterCutoff: number;
    alreadyMaterialized: number;
    staleMarkers: number;
    stringPairIds: number;
    wouldNormalizePairIds: number;
    normalizedPairIds: number;
    replayEligible: number;
    replayed: number;
    unreplayable: ReasonCounts<WeeklyReplayReason>;
  };
  onboarding: {
    scanned: number;
    deferredAfterCutoff: number;
    alreadyMaterialized: number;
    staleMarkers: number;
    replayEligible: number;
    replayed: number;
    unreplayable: ReasonCounts<OnboardingReplayReason>;
  };
};

type RunFactorEngineMigrationInput = {
  mode?: FactorEngineMigrationMode;
  batchSize?: number;
  now?: Date;
};

type IndexTarget = {
  collectionName: string;
  declaredIndexes: ReturnType<typeof DefinitionRegistryRelease.schema.indexes>;
  createIndexes: () => Promise<void>;
};

type ObsoleteIndexSignature = {
  key: IndexKey;
  unique: boolean;
};

const FACTOR_INDEX_TARGETS: readonly IndexTarget[] = [
  {
    collectionName: DefinitionRegistryRelease.collection.collectionName,
    declaredIndexes: DefinitionRegistryRelease.schema.indexes(),
    createIndexes: async () => {
      await DefinitionRegistryRelease.createIndexes();
    },
  },
  {
    collectionName: EvidenceEvent.collection.collectionName,
    declaredIndexes: EvidenceEvent.schema.indexes(),
    createIndexes: async () => {
      await EvidenceEvent.createIndexes();
    },
  },
  {
    collectionName: IndividualFactorSnapshot.collection.collectionName,
    declaredIndexes: IndividualFactorSnapshot.schema.indexes(),
    createIndexes: async () => {
      await IndividualFactorSnapshot.createIndexes();
    },
  },
  {
    collectionName: PairFactorSnapshot.collection.collectionName,
    declaredIndexes: PairFactorSnapshot.schema.indexes(),
    createIndexes: async () => {
      await PairFactorSnapshot.createIndexes();
    },
  },
  {
    collectionName: PairFactorEvaluationSnapshot.collection.collectionName,
    declaredIndexes: PairFactorEvaluationSnapshot.schema.indexes(),
    createIndexes: async () => {
      await PairFactorEvaluationSnapshot.createIndexes();
    },
  },
];

const OBSOLETE_INDIVIDUAL_SNAPSHOT_INDEXES: readonly ObsoleteIndexSignature[] = [
  {
    key: { subjectId: 1, factorKey: 1, revision: 1 },
    unique: true,
  },
  {
    key: {
      subjectId: 1,
      factorKey: 1,
      inputHash: 1,
      'versions.algorithmVersion': 1,
      'versions.snapshotVersion': 1,
    },
    unique: true,
  },
  {
    key: { subjectId: 1, factorKey: 1, revision: -1 },
    unique: false,
  },
  {
    key: { subjectId: 1, contextPairId: 1, factorKey: 1, revision: 1 },
    unique: true,
  },
  {
    key: {
      subjectId: 1,
      contextPairId: 1,
      factorKey: 1,
      inputHash: 1,
      'versions.algorithmVersion': 1,
      'versions.snapshotVersion': 1,
    },
    unique: true,
  },
  {
    key: { subjectId: 1, contextPairId: 1, factorKey: 1, revision: -1 },
    unique: false,
  },
];

const WEEKLY_REPLAY_REASONS: readonly WeeklyReplayReason[] = [
  'PAIR_ID_INVALID',
  'PAIR_NOT_FOUND',
  'PAIR_MEMBERS_INVALID',
  'USER_NOT_PAIR_MEMBER',
  'PAIR_SCOPE_COLLISION',
  'USER_ID_INVALID',
  'WEEK_KEY_INVALID',
  'RAW_ANSWERS_INVALID',
  'OBSERVED_AT_INVALID',
  'NORMALIZATION_RACE',
  'RUNTIME_REPLAY_FAILED',
];

const ONBOARDING_REPLAY_REASONS: readonly OnboardingReplayReason[] = [
  'USER_ID_INVALID',
  'POLICY_VERSION_INVALID',
  'CONSENT_INVALID',
  'COMPLETED_AT_INVALID',
  'ANSWERS_INVALID',
  'RUNTIME_REPLAY_FAILED',
];

const emptyReasonCounts = <T extends string>(
  reasons: readonly T[]
): Record<T, number> =>
  Object.fromEntries(reasons.map((reason) => [reason, 0])) as Record<T, number>;

const validDate = (value: Date | undefined): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

const sameInstant = (left: Date, right: Date): boolean =>
  left.getTime() === right.getTime();

const weeklyRecordedAt = (row: RawWeeklyCheckIn): Date | null => {
  if (!validDate(row.createdAt)) return null;
  return validDate(row.updatedAt) ? row.updatedAt : row.createdAt;
};

const validUnitValue = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const normalizedObjectId = (
  value: string | Types.ObjectId | null | undefined
): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value.trim())) {
    return null;
  }
  return new Types.ObjectId(value.trim());
};

const sameIndexKey = (actual: IndexKey, expected: IndexKey): boolean => {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([field, direction], index) =>
        expectedEntries[index]?.[0] === field &&
        expectedEntries[index]?.[1] === direction
    )
  );
};

const namespaceMissing = (error: Error): boolean =>
  error instanceof mongoose.mongo.MongoServerError &&
  error.codeName === 'NamespaceNotFound';

const existingIndexes = async (
  collectionName: string
): Promise<mongoose.mongo.IndexDescriptionInfo[]> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  try {
    return await database.collection(collectionName).listIndexes().toArray();
  } catch (error) {
    if (error instanceof Error && namespaceMissing(error)) return [];
    throw error;
  }
};

const countDuplicateGroups = async (input: {
  collectionName: string;
  key: IndexKey;
  partialFilterExpression?: mongoose.mongo.Document;
  sparse?: boolean;
}): Promise<number> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  const fields = Object.keys(input.key);
  const pipeline: mongoose.mongo.Document[] = [];
  if (input.partialFilterExpression) {
    pipeline.push({ $match: input.partialFilterExpression });
  }
  if (input.sparse) {
    pipeline.push({
      $match: { $and: fields.map((field) => ({ [field]: { $exists: true } })) },
    });
  }
  pipeline.push(
    {
      $group: {
        _id: Object.fromEntries(
          fields.map((field, index) => [`field${index}`, `$${field}`])
        ),
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $count: 'groups' }
  );
  const rows = await database
    .collection(input.collectionName)
    .aggregate<{ groups: number }>(pipeline)
    .toArray();
  return Number(rows[0]?.groups ?? 0);
};

const inspectFactorIndexes = async (): Promise<{
  declared: number;
  missing: number;
  duplicateUniqueGroups: number;
  obsolete: mongoose.mongo.IndexDescriptionInfo[];
}> => {
  let declared = 0;
  let missing = 0;
  let duplicateUniqueGroups = 0;

  for (const target of FACTOR_INDEX_TARGETS) {
    const actual = await existingIndexes(target.collectionName);
    for (const [key, options] of target.declaredIndexes) {
      declared += 1;
      const expectedKey = key as IndexKey;
      const matching = actual.find((index) =>
        sameIndexKey(index.key as IndexKey, expectedKey)
      );
      if (!matching || Boolean(matching.unique) !== Boolean(options.unique)) {
        missing += 1;
      }
      if (options.unique === true) {
        duplicateUniqueGroups += await countDuplicateGroups({
          collectionName: target.collectionName,
          key: expectedKey,
          ...(options.partialFilterExpression
            ? {
                partialFilterExpression:
                  options.partialFilterExpression as mongoose.mongo.Document,
              }
            : {}),
          sparse: options.sparse === true,
        });
      }
    }
  }

  const individualIndexes = await existingIndexes(
    IndividualFactorSnapshot.collection.collectionName
  );
  const obsolete = individualIndexes.filter((index) =>
    OBSOLETE_INDIVIDUAL_SNAPSHOT_INDEXES.some(
      (signature) =>
        sameIndexKey(index.key as IndexKey, signature.key) &&
        Boolean(index.unique) === signature.unique &&
        !index.partialFilterExpression &&
        !index.sparse
    )
  );
  return { declared, missing, duplicateUniqueGroups, obsolete };
};

const reconcileFactorIndexes = async (
  obsolete: readonly mongoose.mongo.IndexDescriptionInfo[]
): Promise<{ created: number; dropped: number }> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  const collection = database.collection(
    IndividualFactorSnapshot.collection.collectionName
  );
  let dropped = 0;
  for (const index of obsolete) {
    if (!index.name || index.name === '_id_') continue;
    await collection.dropIndex(index.name);
    dropped += 1;
  }

  let created = 0;
  for (const target of FACTOR_INDEX_TARGETS) {
    const before = await existingIndexes(target.collectionName);
    await target.createIndexes();
    const after = await existingIndexes(target.collectionName);
    created += Math.max(0, after.length - before.length);
  }
  return { created, dropped };
};

const validateRegistry = async (): Promise<{
  present: boolean;
  matchesCanonical: boolean;
}> => {
  const canonicalRegistry = canonicalizeFactorRegistry(MVP_FACTOR_REGISTRY);
  const stored = await DefinitionRegistryRelease.findOne({
    registryKey: MVP_FACTOR_REGISTRY.registryKey,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  })
    .select({
      hash: 1,
      canonicalRegistry: 1,
      algorithmVersion: 1,
      snapshotVersion: 1,
      displayVersion: 1,
      status: 1,
    })
    .lean();
  if (!stored) return { present: false, matchesCanonical: false };
  return {
    present: true,
    matchesCanonical:
      stored.hash === MVP_FACTOR_REGISTRY.hash &&
      stored.canonicalRegistry === canonicalRegistry &&
      stored.algorithmVersion === MVP_FACTOR_REGISTRY.algorithmVersion &&
      stored.snapshotVersion === MVP_FACTOR_REGISTRY.snapshotVersion &&
      stored.displayVersion === MVP_FACTOR_REGISTRY.displayVersion &&
      stored.status === 'PUBLISHED',
  };
};

const ONBOARDING_FACTOR_KEYS = [
  'communication.conflict.repairSkill',
  'sharedLife.planning.structurePreference',
  'lifePlans.family.childrenIntent',
] as const;

const ONBOARDING_QUESTION_BY_FACTOR: Readonly<Record<string, string>> = {
  'communication.conflict.repairSkill': 'repair_confidence',
  'sharedLife.planning.structurePreference': 'planning_style',
  'lifePlans.family.childrenIntent': 'children_intent',
};

type EvidenceMarkerArtifact = Pick<
  EvidenceEventType,
  | 'eventId'
  | 'actorId'
  | 'subjectId'
  | 'pairId'
  | 'factorKey'
  | 'measurementKey'
  | 'instrumentKey'
  | 'sourceType'
  | 'sourceRef'
  | 'status'
  | 'observedAt'
  | 'recordedAt'
  | 'versions'
>;

type IndividualMarkerArtifact = Pick<
  IndividualFactorSnapshotType,
  | 'snapshotId'
  | 'subjectId'
  | 'contextPairId'
  | 'projectionPurpose'
  | 'factorKey'
  | 'status'
  | 'evidenceIds'
  | 'versions'
  | 'calculatedAt'
  | 'effectiveFrom'
  | 'effectiveUntil'
>;

type PairEvaluationMarkerArtifact = Pick<
  PairFactorEvaluationSnapshotType,
  | 'snapshotId'
  | 'pairId'
  | 'factorKey'
  | 'context'
  | 'strategy'
  | 'strategyVersion'
  | 'directionality'
  | 'individualSnapshotIds'
  | 'versions'
  | 'calculatedAt'
  | 'effectiveFrom'
  | 'effectiveUntil'
>;

const exactMarkerIds = (
  value: string[] | undefined,
  expectedCount: number
): readonly string[] | null => {
  if (
    !Array.isArray(value) ||
    value.length !== expectedCount ||
    value.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return value;
};

const hasExactFactorKeys = (
  actual: readonly string[],
  expected: readonly string[]
): boolean =>
  actual.length === expected.length &&
  [...actual].sort().every((key, index) => key === [...expected].sort()[index]);

const hasCanonicalArtifactVersions = (artifact: {
  factorKey: string;
  versions: {
    registryVersion: number;
    definitionVersion: number;
    algorithmVersion: number;
    snapshotVersion?: number;
  };
}): boolean => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === artifact.factorKey
  );
  return Boolean(
    factor &&
      artifact.versions.registryVersion ===
        MVP_FACTOR_REGISTRY.registryVersion &&
      artifact.versions.definitionVersion === factor.definitionVersion &&
      artifact.versions.algorithmVersion ===
        MVP_FACTOR_REGISTRY.algorithmVersion &&
      (artifact.versions.snapshotVersion === undefined ||
        artifact.versions.snapshotVersion ===
          MVP_FACTOR_REGISTRY.snapshotVersion)
  );
};

const hasCanonicalEvidenceVersions = (
  artifact: EvidenceMarkerArtifact
): boolean => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === artifact.measurementKey
  );
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === artifact.instrumentKey
  );
  return Boolean(
    hasCanonicalArtifactVersions(artifact) &&
      measurement &&
      instrument &&
      measurement.factorKey === artifact.factorKey &&
      measurement.sourceType === artifact.sourceType &&
      measurement.measurementVersion ===
        artifact.versions.measurementVersion &&
      instrument.instrumentVersion === artifact.versions.instrumentVersion &&
      instrument.measurementKeys.includes(measurement.key)
  );
};

const hasCanonicalSnapshotContract = (
  artifact: IndividualMarkerArtifact | PairEvaluationMarkerArtifact
): boolean => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === artifact.factorKey
  );
  if (
    !factor ||
    !snapshotVersionsMatchRegistry(
      artifact.versions,
      factor,
      MVP_FACTOR_REGISTRY
    ) ||
    !validateStoredSnapshotInterval(artifact)
  ) {
    return false;
  }
  if ('strategy' in artifact) {
    const strategy = factor.pairStrategies.find(
      (candidate) =>
        candidate.context === artifact.context &&
        candidate.config.type === artifact.strategy
    );
    return Boolean(
      strategy &&
        artifact.strategyVersion === strategy.strategyVersion &&
        artifact.directionality === strategy.directionality
    );
  }
  return true;
};

const snapshotReferencesEvidence = (
  snapshot: IndividualMarkerArtifact,
  evidence: EvidenceMarkerArtifact
): boolean =>
  snapshot.versions.measurementRefs.some(
    (reference) =>
      reference.key === evidence.measurementKey &&
      reference.version === evidence.versions.measurementVersion
  ) &&
  snapshot.versions.instrumentRefs.some(
    (reference) =>
      reference.key === evidence.instrumentKey &&
      reference.version === evidence.versions.instrumentVersion
  );

const readEvidenceMarkerArtifacts = async (
  eventIds: readonly string[]
): Promise<readonly EvidenceMarkerArtifact[]> =>
  EvidenceEvent.find({ eventId: { $in: eventIds } })
    .select({
      eventId: 1,
      actorId: 1,
      subjectId: 1,
      pairId: 1,
      factorKey: 1,
      measurementKey: 1,
      instrumentKey: 1,
      sourceType: 1,
      sourceRef: 1,
      status: 1,
      observedAt: 1,
      recordedAt: 1,
      versions: 1,
    })
    .lean<EvidenceMarkerArtifact[]>();

const readIndividualMarkerArtifacts = async (
  snapshotIds: readonly string[]
): Promise<readonly IndividualMarkerArtifact[]> =>
  IndividualFactorSnapshot.find({ snapshotId: { $in: snapshotIds } })
    .select({
      snapshotId: 1,
      subjectId: 1,
      contextPairId: 1,
      projectionPurpose: 1,
      factorKey: 1,
      status: 1,
      evidenceIds: 1,
      versions: 1,
      calculatedAt: 1,
      effectiveFrom: 1,
      effectiveUntil: 1,
    })
    .lean<IndividualMarkerArtifact[]>();

const readPairEvaluationMarkerArtifacts = async (
  snapshotIds: readonly string[]
): Promise<readonly PairEvaluationMarkerArtifact[]> =>
  PairFactorEvaluationSnapshot.find({ snapshotId: { $in: snapshotIds } })
    .select({
      snapshotId: 1,
      pairId: 1,
      factorKey: 1,
      context: 1,
      strategy: 1,
      strategyVersion: 1,
      directionality: 1,
      individualSnapshotIds: 1,
      versions: 1,
      calculatedAt: 1,
      effectiveFrom: 1,
      effectiveUntil: 1,
    })
    .lean<PairEvaluationMarkerArtifact[]>();

const weeklyMarkerIsComplete = async (input: {
  row: RawWeeklyCheckIn;
  pairId: Types.ObjectId;
  registryTrusted: boolean;
}): Promise<boolean> => {
  const marker = input.row.computed?.factorEngine;
  const userId = input.row.userId;
  const observedAt = validDate(input.row.createdAt) ? input.row.createdAt : null;
  const recordedAt = weeklyRecordedAt(input.row);
  if (
    !input.registryTrusted ||
    marker?.status !== 'MATERIALIZED' ||
    marker.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion ||
    !userId ||
    !observedAt ||
    !recordedAt
  ) {
    return false;
  }
  const evidenceIds = exactMarkerIds(
    marker.evidenceEventIds,
    WEEKLY_FACTOR_KEYS.length
  );
  const individualSnapshotIds = exactMarkerIds(
    marker.individualSnapshotIds,
    WEEKLY_FACTOR_KEYS.length
  );
  const pairEvaluationIds = marker.pairEvaluationSnapshotIds ?? [];
  if (
    !evidenceIds ||
    !individualSnapshotIds ||
    (pairEvaluationIds.length !== 0 &&
      !exactMarkerIds(pairEvaluationIds, WEEKLY_FACTOR_KEYS.length))
  ) {
    return false;
  }

  const [evidence, individuals, pairEvaluations] = await Promise.all([
    readEvidenceMarkerArtifacts(evidenceIds),
    readIndividualMarkerArtifacts(individualSnapshotIds),
    pairEvaluationIds.length
      ? readPairEvaluationMarkerArtifacts(pairEvaluationIds)
      : Promise.resolve([] as readonly PairEvaluationMarkerArtifact[]),
  ]);
  const pairId = input.pairId.toHexString();
  const sourceRef = `weekly-check-in:${input.row._id.toHexString()}`;
  const snapshotCalculatedAt = canonicalSnapshotCalculatedAt(recordedAt);
  if (
    evidence.length !== evidenceIds.length ||
    individuals.length !== individualSnapshotIds.length ||
    pairEvaluations.length !== pairEvaluationIds.length ||
    !hasExactFactorKeys(
      evidence.map((artifact) => artifact.factorKey),
      WEEKLY_FACTOR_KEYS
    ) ||
    !hasExactFactorKeys(
      individuals.map((artifact) => artifact.factorKey),
      WEEKLY_FACTOR_KEYS
    ) ||
    (pairEvaluations.length > 0 &&
      !hasExactFactorKeys(
        pairEvaluations.map((artifact) => artifact.factorKey),
        WEEKLY_FACTOR_KEYS
      ))
  ) {
    return false;
  }
  if (
    evidence.some(
      (artifact) =>
        artifact.actorId !== userId ||
        artifact.subjectId !== userId ||
        artifact.pairId !== pairId ||
        artifact.sourceType !== 'CHECK_IN' ||
        artifact.sourceRef !== sourceRef ||
        artifact.status !== 'ACCEPTED' ||
        !sameInstant(artifact.observedAt, observedAt) ||
        !sameInstant(artifact.recordedAt, recordedAt) ||
        artifact.observedAt.getTime() > recordedAt.getTime() ||
        !hasCanonicalEvidenceVersions(artifact)
    ) ||
    individuals.some(
      (artifact) =>
        artifact.subjectId !== userId ||
        artifact.contextPairId !== pairId ||
        artifact.projectionPurpose !== 'PAIR_MODEL' ||
        !sameInstant(artifact.calculatedAt, snapshotCalculatedAt) ||
        !hasCanonicalSnapshotContract(artifact)
    ) ||
    pairEvaluations.some(
      (artifact) =>
        artifact.pairId !== pairId ||
        artifact.context !== 'COMMITTED_RELATIONSHIP' ||
        !sameInstant(artifact.calculatedAt, snapshotCalculatedAt) ||
        !hasCanonicalSnapshotContract(artifact)
    )
  ) {
    return false;
  }

  const evidenceByFactor = new Map(
    evidence.map((artifact) => [artifact.factorKey, artifact])
  );
  const individualByFactor = new Map(
    individuals.map((artifact) => [artifact.factorKey, artifact])
  );
  if (
    individuals.some((artifact) => {
      const event = evidenceByFactor.get(artifact.factorKey);
      return (
        !event ||
        !snapshotReferencesEvidence(artifact, event) ||
        (artifact.status === 'AVAILABLE' &&
          !artifact.evidenceIds.includes(event.eventId))
      );
    }) ||
    pairEvaluations.some((artifact) => {
      const individual = individualByFactor.get(artifact.factorKey);
      return (
        !individual ||
        !artifact.individualSnapshotIds.includes(individual.snapshotId)
      );
    })
  ) {
    return false;
  }
  return true;
};

const onboardingMarkerIsComplete = async (input: {
  row: RawOnboardingSession;
  registryTrusted: boolean;
}): Promise<boolean> => {
  const marker = input.row.factorEngine;
  const userId = input.row.userId;
  const completedAt = validDate(input.row.completedAt)
    ? input.row.completedAt
    : null;
  if (
    !input.registryTrusted ||
    marker?.status !== 'MATERIALIZED' ||
    marker.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion ||
    !userId ||
    !completedAt
  ) {
    return false;
  }
  const evidenceIds = exactMarkerIds(
    marker.evidenceEventIds,
    ONBOARDING_FACTOR_KEYS.length
  );
  const snapshotIds = exactMarkerIds(
    marker.individualSnapshotIds,
    ONBOARDING_FACTOR_KEYS.length
  );
  if (!evidenceIds || !snapshotIds) return false;

  const [evidence, snapshots] = await Promise.all([
    readEvidenceMarkerArtifacts(evidenceIds),
    readIndividualMarkerArtifacts(snapshotIds),
  ]);
  const sourcePrefix = `mvp-onboarding:${input.row._id.toHexString()}:`;
  const snapshotCalculatedAt = canonicalSnapshotCalculatedAt(completedAt);
  if (
    evidence.length !== evidenceIds.length ||
    snapshots.length !== snapshotIds.length ||
    !hasExactFactorKeys(
      evidence.map((artifact) => artifact.factorKey),
      ONBOARDING_FACTOR_KEYS
    ) ||
    !hasExactFactorKeys(
      snapshots.map((artifact) => artifact.factorKey),
      ONBOARDING_FACTOR_KEYS
    ) ||
    evidence.some(
      (artifact) =>
        artifact.actorId !== userId ||
        artifact.subjectId !== userId ||
        artifact.pairId !== undefined ||
        artifact.sourceRef !==
          `${sourcePrefix}${ONBOARDING_QUESTION_BY_FACTOR[artifact.factorKey] ?? ''}` ||
        artifact.status !== 'ACCEPTED' ||
        (() => {
          const questionId = ONBOARDING_QUESTION_BY_FACTOR[artifact.factorKey];
          if (!questionId) return true;
          const answer = input.row.answers?.find(
            (candidate) => candidate.questionId === questionId
          );
          const observedAt = answer?.answeredAt ?? completedAt;
          return (
            !validDate(observedAt) ||
            !sameInstant(artifact.observedAt, observedAt) ||
            !sameInstant(artifact.recordedAt, completedAt) ||
            artifact.observedAt.getTime() > completedAt.getTime()
          );
        })() ||
        !hasCanonicalEvidenceVersions(artifact)
    ) ||
    snapshots.some(
      (artifact) =>
        artifact.subjectId !== userId ||
        artifact.contextPairId !== undefined ||
        !sameInstant(artifact.calculatedAt, snapshotCalculatedAt) ||
        !hasCanonicalSnapshotContract(artifact)
    )
  ) {
    return false;
  }

  const evidenceByFactor = new Map(
    evidence.map((artifact) => [artifact.factorKey, artifact])
  );
  return snapshots.every((artifact) => {
    const event = evidenceByFactor.get(artifact.factorKey);
    return Boolean(
      event &&
        snapshotReferencesEvidence(artifact, event) &&
        (artifact.status !== 'AVAILABLE' ||
          artifact.evidenceIds.includes(event.eventId))
    );
  });
};

const pairMembers = async (
  pairId: Types.ObjectId
): Promise<readonly [string, string] | WeeklyReplayReason> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  const pair = await database
    .collection<RawPair>('pairs')
    .findOne({ _id: pairId }, { projection: { members: 1 } });
  if (!pair) return 'PAIR_NOT_FOUND';
  if (
    !Array.isArray(pair.members) ||
    pair.members.length !== 2 ||
    typeof pair.members[0] !== 'string' ||
    typeof pair.members[1] !== 'string' ||
    !pair.members[0] ||
    !pair.members[1] ||
    pair.members[0] === pair.members[1]
  ) {
    return 'PAIR_MEMBERS_INVALID';
  }
  return [pair.members[0], pair.members[1]];
};

const hasPairScopeCollision = async (
  row: RawWeeklyCheckIn,
  pairId: Types.ObjectId
): Promise<boolean> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  if (typeof row.userId !== 'string' || typeof row.weekKey !== 'string') {
    return false;
  }
  const count = await database.collection<RawWeeklyCheckIn>('weekly_checkins').countDocuments({
    _id: { $ne: row._id },
    userId: row.userId,
    weekKey: row.weekKey,
    $expr: {
      $eq: [
        {
          $convert: {
            input: '$pairId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
        pairId,
      ],
    },
  });
  return count > 0;
};

const weeklyIdentityReason = (
  row: RawWeeklyCheckIn
): WeeklyReplayReason | null => {
  if (typeof row.userId !== 'string' || !row.userId.trim()) {
    return 'USER_ID_INVALID';
  }
  if (typeof row.weekKey !== 'string' || !row.weekKey.trim()) {
    return 'WEEK_KEY_INVALID';
  }
  return null;
};

const weeklySourceReason = (
  row: RawWeeklyCheckIn
): WeeklyReplayReason | null => {
  if (
    !validUnitValue(row.answers?.closeness) ||
    !validUnitValue(row.answers?.fatigue) ||
    !validUnitValue(row.answers?.irritation) ||
    !validUnitValue(row.answers?.readiness)
  ) {
    return 'RAW_ANSWERS_INVALID';
  }
  if (!validDate(row.createdAt)) return 'OBSERVED_AT_INVALID';
  return null;
};

const increment = <T extends string>(counts: Record<T, number>, reason: T): void => {
  counts[reason] += 1;
};

const replayWeekly = async (input: {
  mode: FactorEngineMigrationMode;
  batchSize: number;
  asOf: Date;
  registryTrusted: boolean;
  report: FactorEngineMigrationReport['weekly'];
}): Promise<void> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  const collection = database.collection<RawWeeklyCheckIn>('weekly_checkins');
  let afterId: Types.ObjectId | undefined;

  while (true) {
    const rows = await collection
      .find({
        ...(afterId ? { _id: { $gt: afterId } } : {}),
      })
      .project<RawWeeklyCheckIn>({
        _id: 1,
        userId: 1,
        pairId: 1,
        weekKey: 1,
        answers: 1,
        computed: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ _id: 1 })
      .limit(input.batchSize)
      .toArray();
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?._id;

    for (const row of rows) {
      input.report.scanned += 1;
      const observedAt = validDate(row.createdAt) ? row.createdAt : null;
      const recordedAt = weeklyRecordedAt(row);
      if (
        (observedAt && observedAt.getTime() > input.asOf.getTime()) ||
        (recordedAt && recordedAt.getTime() > input.asOf.getTime())
      ) {
        input.report.deferredAfterCutoff += 1;
        continue;
      }
      const pairId = normalizedObjectId(row.pairId);
      if (!pairId) {
        increment(input.report.unreplayable, 'PAIR_ID_INVALID');
        continue;
      }
      const identityReason = weeklyIdentityReason(row);
      if (identityReason) {
        increment(input.report.unreplayable, identityReason);
        continue;
      }
      const members = await pairMembers(pairId);
      if (typeof members === 'string') {
        increment(input.report.unreplayable, members);
        continue;
      }
      if (!members.includes(row.userId!)) {
        increment(input.report.unreplayable, 'USER_NOT_PAIR_MEMBER');
        continue;
      }

      if (typeof row.pairId === 'string') {
        input.report.stringPairIds += 1;
        if (await hasPairScopeCollision(row, pairId)) {
          increment(input.report.unreplayable, 'PAIR_SCOPE_COLLISION');
          continue;
        }
        input.report.wouldNormalizePairIds += 1;
        if (input.mode === 'NEW_ONLY') {
          const normalized = await collection.updateOne(
            { _id: row._id, pairId: row.pairId },
            { $set: { pairId } }
          );
          if (normalized.modifiedCount !== 1) {
            increment(input.report.unreplayable, 'NORMALIZATION_RACE');
            continue;
          }
          input.report.normalizedPairIds += 1;
        }
      }

      const sourceReason = weeklySourceReason(row);
      if (sourceReason) {
        increment(input.report.unreplayable, sourceReason);
        continue;
      }
      if (row.computed?.factorEngine?.status === 'MATERIALIZED') {
        if (
          await weeklyMarkerIsComplete({
            row,
            pairId,
            registryTrusted: input.registryTrusted,
          })
        ) {
          input.report.alreadyMaterialized += 1;
          continue;
        }
        input.report.staleMarkers += 1;
      }
      input.report.replayEligible += 1;
      if (input.mode === 'DRY_RUN') continue;

      try {
        const materialized = await processWeeklyFactorCheckIn({
          pairId: pairId.toHexString(),
          memberIds: members,
          actorId: row.userId!,
          checkInId: row._id.toHexString(),
          closeness: row.answers!.closeness!,
          irritation: row.answers!.irritation!,
          fatigue: row.answers!.fatigue!,
          readiness: row.answers!.readiness!,
          observedAt: row.createdAt!,
          recordedAt: validDate(row.updatedAt) ? row.updatedAt : row.createdAt!,
        });
        const update = await collection.updateOne(
          {
            _id: row._id,
            userId: row.userId,
            weekKey: row.weekKey,
            answers: row.answers,
            createdAt: row.createdAt,
            ...(validDate(row.updatedAt) ? { updatedAt: row.updatedAt } : {}),
          },
          {
            $set: {
              'computed.factorEngine': {
                status: 'MATERIALIZED',
                registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
                evidenceEventIds: materialized.evidence.map((item) => item.eventId),
                individualSnapshotIds: materialized.individualSnapshots.map(
                  (item) => item.snapshotId
                ),
                pairEvaluationSnapshotIds: materialized.pairEvaluations.map(
                  (item) => item.snapshotId
                ),
              },
            },
          }
        );
        if (update.matchedCount !== 1) {
          throw new Error('WEEKLY_SOURCE_DISAPPEARED');
        }
        input.report.replayed += 1;
      } catch {
        increment(input.report.unreplayable, 'RUNTIME_REPLAY_FAILED');
      }
    }
  }
};

const answerListValid = (
  answers: MvpOnboardingAnswer[] | undefined,
  completedAt: Date
): boolean => {
  if (!Array.isArray(answers)) return false;
  const allowedCapturePolicies = new Set(['PRIVATE', 'PAIR_MODEL_ONLY', 'SHARED']);
  const answerValid = (answer: MvpOnboardingAnswer): boolean =>
    typeof answer.questionId === 'string' &&
    Boolean(answer.questionId) &&
    typeof answer.questionRevision === 'string' &&
    Boolean(answer.questionRevision) &&
    Number.isInteger(answer.answerRevision) &&
    answer.answerRevision >= 1 &&
    allowedCapturePolicies.has(answer.capturePolicy) &&
    validDate(answer.answeredAt) &&
    answer.answeredAt.getTime() <= completedAt.getTime();
  if (!answers.every(answerValid)) return false;

  const forQuestion = (questionId: string) =>
    answers.filter((answer) => answer.questionId === questionId);
  const repair = forQuestion('repair_confidence');
  const planning = forQuestion('planning_style');
  const children = forQuestion('children_intent');
  if (repair.length !== 1 || planning.length !== 1 || children.length > 1) {
    return false;
  }
  if (
    repair[0]?.value.kind !== 'single' ||
    !['need_guidance', 'sometimes_manage', 'usually_manage'].includes(
      repair[0].value.optionId ?? ''
    )
  ) {
    return false;
  }
  if (
    planning[0]?.value.kind !== 'single' ||
    !['same_day', 'flexible_window', 'fixed_time'].includes(
      planning[0].value.optionId ?? ''
    )
  ) {
    return false;
  }
  if (
    children[0] &&
    children[0].value.kind !== 'skipped' &&
    (children[0].value.kind !== 'single' ||
      !['yes', 'no', 'unsure'].includes(children[0].value.optionId ?? ''))
  ) {
    return false;
  }
  return true;
};

const onboardingValidationReason = (
  row: RawOnboardingSession
): OnboardingReplayReason | null => {
  if (typeof row.userId !== 'string' || !row.userId.trim()) {
    return 'USER_ID_INVALID';
  }
  if (typeof row.policyVersion !== 'string' || !row.policyVersion.trim()) {
    return 'POLICY_VERSION_INVALID';
  }
  if (
    !row.consent?.adultConfirmed ||
    !row.consent.voluntaryParticipationConfirmed ||
    !row.consent.privacyAcknowledged ||
    !validDate(row.consent.confirmedAt)
  ) {
    return 'CONSENT_INVALID';
  }
  if (!validDate(row.completedAt)) return 'COMPLETED_AT_INVALID';
  if (row.consent.confirmedAt.getTime() > row.completedAt.getTime()) {
    return 'CONSENT_INVALID';
  }
  if (!answerListValid(row.answers, row.completedAt)) return 'ANSWERS_INVALID';
  return null;
};

const replayOnboarding = async (input: {
  mode: FactorEngineMigrationMode;
  batchSize: number;
  asOf: Date;
  registryTrusted: boolean;
  report: FactorEngineMigrationReport['onboarding'];
}): Promise<void> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  const collection = database.collection<RawOnboardingSession>(
    'mvp_onboarding_sessions'
  );
  let afterId: Types.ObjectId | undefined;

  while (true) {
    const rows = await collection
      .find({
        ...(afterId ? { _id: { $gt: afterId } } : {}),
        status: 'completed',
      })
      .project<RawOnboardingSession>({
        _id: 1,
        userId: 1,
        status: 1,
        policyVersion: 1,
        consent: 1,
        answers: 1,
        factorEngine: 1,
        completedAt: 1,
      })
      .sort({ _id: 1 })
      .limit(input.batchSize)
      .toArray();
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?._id;

    for (const row of rows) {
      input.report.scanned += 1;
      if (
        validDate(row.completedAt) &&
        row.completedAt.getTime() > input.asOf.getTime()
      ) {
        input.report.deferredAfterCutoff += 1;
        continue;
      }
      const reason = onboardingValidationReason(row);
      if (reason) {
        increment(input.report.unreplayable, reason);
        continue;
      }
      if (row.factorEngine?.status === 'MATERIALIZED') {
        if (
          await onboardingMarkerIsComplete({
            row,
            registryTrusted: input.registryTrusted,
          })
        ) {
          input.report.alreadyMaterialized += 1;
          continue;
        }
        input.report.staleMarkers += 1;
      }
      input.report.replayEligible += 1;
      if (input.mode === 'DRY_RUN') continue;

      try {
        const materialized = await materializeOnboardingFactorEvidence({
          sessionId: row._id.toHexString(),
          subjectId: row.userId!,
          session: {
            answers: row.answers!,
            policyVersion: row.policyVersion!,
            consent: row.consent!,
            completedAt: row.completedAt!,
          },
        });
        const update = await collection.updateOne(
          {
            _id: row._id,
            status: 'completed',
            userId: row.userId,
            policyVersion: row.policyVersion,
            consent: row.consent,
            answers: row.answers,
            completedAt: row.completedAt,
          },
          {
            $set: {
              factorEngine: {
                status: 'MATERIALIZED',
                registryVersion: materialized.registryVersion,
                evidenceEventIds: materialized.evidenceEventIds,
                individualSnapshotIds: materialized.individualSnapshotIds,
              },
            },
          }
        );
        if (update.matchedCount !== 1) {
          throw new Error('ONBOARDING_SOURCE_DISAPPEARED');
        }
        input.report.replayed += 1;
      } catch {
        increment(input.report.unreplayable, 'RUNTIME_REPLAY_FAILED');
      }
    }
  }
};

const assertBatchSize = (batchSize: number): number => {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error('batchSize must be an integer between 1 and 500');
  }
  return batchSize;
};

export async function runFactorEngineMigration(
  input: RunFactorEngineMigrationInput = {}
): Promise<FactorEngineMigrationReport> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('DATABASE_NOT_CONNECTED');
  }
  const mode = input.mode ?? 'DRY_RUN';
  const batchSize = assertBatchSize(input.batchSize ?? 100);
  const asOf = new Date((input.now ?? new Date()).getTime());
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error('now must be a valid date');
  }
  const registryBefore = await validateRegistry();
  if (registryBefore.present && !registryBefore.matchesCanonical) {
    throw new Error('Canonical Factor registry identity conflicts with stored release');
  }
  const indexBefore = await inspectFactorIndexes();
  if (indexBefore.duplicateUniqueGroups > 0) {
    throw new Error('Factor indexes have duplicate unique groups; apply is blocked');
  }

  const report: FactorEngineMigrationReport = {
    mode,
    batchSize,
    asOf: asOf.toISOString(),
    registry: {
      currentVersion: MVP_FACTOR_REGISTRY.registryVersion,
      present: registryBefore.present,
      matchesCanonical: registryBefore.matchesCanonical,
      wouldSeed: !registryBefore.present,
      seeded: false,
    },
    indexes: {
      declared: indexBefore.declared,
      missingBefore: indexBefore.missing,
      duplicateUniqueGroups: indexBefore.duplicateUniqueGroups,
      obsoleteExactMatches: indexBefore.obsolete.length,
      created: 0,
      droppedObsoleteExactMatches: 0,
    },
    weekly: {
      scanned: 0,
      deferredAfterCutoff: 0,
      alreadyMaterialized: 0,
      staleMarkers: 0,
      stringPairIds: 0,
      wouldNormalizePairIds: 0,
      normalizedPairIds: 0,
      replayEligible: 0,
      replayed: 0,
      unreplayable: emptyReasonCounts(WEEKLY_REPLAY_REASONS),
    },
    onboarding: {
      scanned: 0,
      deferredAfterCutoff: 0,
      alreadyMaterialized: 0,
      staleMarkers: 0,
      replayEligible: 0,
      replayed: 0,
      unreplayable: emptyReasonCounts(ONBOARDING_REPLAY_REASONS),
    },
  };

  if (mode === 'NEW_ONLY') {
    await seedDefinitionRegistryRelease(
      MVP_FACTOR_REGISTRY,
      asOf
    );
    report.registry.seeded = !registryBefore.present;
    const changedIndexes = await reconcileFactorIndexes(indexBefore.obsolete);
    report.indexes.created = changedIndexes.created;
    report.indexes.droppedObsoleteExactMatches = changedIndexes.dropped;
  }

  const registryAfter =
    mode === 'NEW_ONLY' ? await validateRegistry() : registryBefore;
  const registryTrusted =
    registryAfter.matchesCanonical ||
    (mode === 'DRY_RUN' && !registryAfter.present && report.registry.wouldSeed);
  await replayWeekly({
    mode,
    batchSize,
    asOf,
    registryTrusted,
    report: report.weekly,
  });
  await replayOnboarding({
    mode,
    batchSize,
    asOf,
    registryTrusted,
    report: report.onboarding,
  });
  return report;
}
