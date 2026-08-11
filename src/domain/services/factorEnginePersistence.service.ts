import {
  canonicalizeFactorRegistry,
  registryDefinitionCounts,
  verifyFactorRegistryRelease,
} from '@/domain/model/definitions/registry';
import type { FactorRegistryRelease } from '@/domain/model/definitions/definitionTypes';
import type { EvidenceEvent as DomainEvidenceEvent } from '@/domain/model/evidence/evidence';
import {
  buildIndividualFactorSnapshot,
  buildPairFactorEvaluationSnapshot,
  buildPairFactorSnapshot,
  replayIndividualFactorSnapshot,
  replayPairFactorEvaluationSnapshot,
  replayPairFactorSnapshot,
  type BuildIndividualFactorSnapshotInput,
  type BuildPairFactorEvaluationSnapshotInput,
  type BuildPairFactorSnapshotInput,
  type IndividualFactorSnapshot as DomainIndividualFactorSnapshot,
  type PairFactorEvaluationSnapshot as DomainPairFactorEvaluationSnapshot,
  type PairFactorSnapshot as DomainPairFactorSnapshot,
  type SnapshotVersions,
  type SnapshotReplayResult,
} from '@/domain/model/snapshots/snapshots';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { toStoredFactorValue } from '@/models/factorEngineSchemas';
import type { ClientSession } from 'mongoose';

export type FactorPersistenceOptions = {
  session?: ClientSession;
};

export class FactorPersistenceConflictError extends Error {
  readonly reasonCode:
    | 'REGISTRY_HASH_INVALID'
    | 'REGISTRY_RELEASE_NOT_SEEDED'
    | 'REGISTRY_RELEASE_NOT_PUBLISHED'
    | 'REGISTRY_RELEASE_CONFLICT'
    | 'EVIDENCE_IDEMPOTENCY_CONFLICT'
    | 'SNAPSHOT_REVISION_CONFLICT'
    | 'SNAPSHOT_REPLAY_MISMATCH';

  constructor(reasonCode: FactorPersistenceConflictError['reasonCode']) {
    super(reasonCode);
    this.name = 'FactorPersistenceConflictError';
    this.reasonCode = reasonCode;
  }
}

const sortedKeys = (items: readonly { key: string }[]): string[] =>
  items.map((item) => item.key).sort();

const sameVersionReferences = (
  left: SnapshotVersions['measurementRefs'],
  right: SnapshotVersions['measurementRefs']
): boolean =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every(
    (reference, index) =>
      reference.key === right[index]?.key &&
      reference.version === right[index]?.version
  );

const sameSnapshotContract = (
  stored: {
    versions: SnapshotVersions;
    calculatedAt: Date;
    effectiveFrom: Date;
    effectiveUntil?: Date;
  },
  expected:
    | DomainIndividualFactorSnapshot
    | DomainPairFactorSnapshot
    | DomainPairFactorEvaluationSnapshot
): boolean =>
  Boolean(stored.versions) &&
  stored.calculatedAt instanceof Date &&
  stored.effectiveFrom instanceof Date &&
  (stored.effectiveUntil === undefined || stored.effectiveUntil instanceof Date) &&
  stored.versions.registryVersion === expected.versions.registryVersion &&
  stored.versions.definitionVersion === expected.versions.definitionVersion &&
  stored.versions.algorithmVersion === expected.versions.algorithmVersion &&
  stored.versions.snapshotVersion === expected.versions.snapshotVersion &&
  stored.versions.displayVersion === expected.versions.displayVersion &&
  sameVersionReferences(
    stored.versions.measurementRefs,
    expected.versions.measurementRefs
  ) &&
  sameVersionReferences(
    stored.versions.instrumentRefs,
    expected.versions.instrumentRefs
  ) &&
  stored.calculatedAt.getTime() === expected.calculatedAt.getTime() &&
  stored.effectiveFrom.getTime() === expected.effectiveFrom.getTime() &&
  (stored.effectiveUntil?.getTime() ?? null) ===
    (expected.effectiveUntil?.getTime() ?? null);

export async function seedDefinitionRegistryRelease(
  release: FactorRegistryRelease,
  seededAt: Date = new Date(),
  options: FactorPersistenceOptions = {}
): Promise<{ registryKey: string; registryVersion: number; hash: string }> {
  if (!verifyFactorRegistryRelease(release)) {
    throw new FactorPersistenceConflictError('REGISTRY_HASH_INVALID');
  }
  const canonicalRegistry = canonicalizeFactorRegistry(release);
  const stored = await DefinitionRegistryRelease.findOneAndUpdate(
    {
      registryKey: release.registryKey,
      registryVersion: release.registryVersion,
    },
    {
      $setOnInsert: {
        registryKey: release.registryKey,
        registryVersion: release.registryVersion,
        algorithmVersion: release.algorithmVersion,
        snapshotVersion: release.snapshotVersion,
        displayVersion: release.displayVersion,
        status: release.status,
        hash: release.hash,
        canonicalRegistry,
        manifest: {
          domainKeys: sortedKeys(release.domains),
          dimensionKeys: sortedKeys(release.dimensions),
          factorKeys: sortedKeys(release.factors),
          measurementKeys: sortedKeys(release.measurements),
          instrumentKeys: sortedKeys(release.instruments),
          actionKeys: sortedKeys(release.actions),
        },
        counts: registryDefinitionCounts(release),
        publishedAt: seededAt,
        seededAt,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      session: options.session,
    }
  );
  if (
    !stored ||
    stored.hash !== release.hash ||
    stored.canonicalRegistry !== canonicalRegistry ||
    stored.algorithmVersion !== release.algorithmVersion ||
    stored.snapshotVersion !== release.snapshotVersion ||
    stored.displayVersion !== release.displayVersion
  ) {
    throw new FactorPersistenceConflictError('REGISTRY_RELEASE_CONFLICT');
  }
  return {
    registryKey: stored.registryKey,
    registryVersion: stored.registryVersion,
    hash: stored.hash,
  };
}

async function assertRegistryAvailable(
  release: FactorRegistryRelease,
  options: FactorPersistenceOptions = {}
): Promise<void> {
  if (!verifyFactorRegistryRelease(release)) {
    throw new FactorPersistenceConflictError('REGISTRY_HASH_INVALID');
  }
  const stored = await DefinitionRegistryRelease.findOne({
    registryKey: release.registryKey,
    registryVersion: release.registryVersion,
    hash: release.hash,
  }).session(options.session ?? null);
  if (!stored) {
    throw new FactorPersistenceConflictError('REGISTRY_RELEASE_NOT_SEEDED');
  }
  if (stored.status !== 'PUBLISHED') {
    throw new FactorPersistenceConflictError('REGISTRY_RELEASE_NOT_PUBLISHED');
  }
  if (
    stored.algorithmVersion !== release.algorithmVersion ||
    stored.snapshotVersion !== release.snapshotVersion ||
    stored.displayVersion !== release.displayVersion
  ) {
    throw new FactorPersistenceConflictError('REGISTRY_RELEASE_CONFLICT');
  }
}

export async function upsertEvidenceEvent(
  event: DomainEvidenceEvent,
  release: FactorRegistryRelease,
  options: FactorPersistenceOptions = {}
): Promise<{ eventId: string; status: DomainEvidenceEvent['status']; inputHash: string }> {
  await assertRegistryAvailable(release, options);
  if (
    event.versions.registryVersion !== release.registryVersion ||
    event.versions.algorithmVersion !== release.algorithmVersion
  ) {
    throw new FactorPersistenceConflictError('REGISTRY_RELEASE_CONFLICT');
  }
  const evidenceInsert = {
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    actorId: event.actorId,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
    pairId: event.pairId,
    observationScope: event.observationScope,
    observedSubjectId: event.observedSubjectId,
    factorKey: event.factorKey,
    measurementKey: event.measurementKey,
    instrumentKey: event.instrumentKey,
    sourceType: event.sourceType,
    sourceRef: event.sourceRef,
    sourceRevision: event.sourceRevision,
    sourceHash: event.sourceHash,
    submittedValue: toStoredFactorValue(event.submittedValue),
    reliability: event.reliability,
    observedAt: event.observedAt,
    recordedAt: event.recordedAt,
    context: event.context,
    purpose: event.purpose,
    privacyClass: event.privacyClass,
    captureMode: event.captureMode,
    policyVersion: event.policyVersion,
    consentRevision: event.consentRevision,
    retentionClass: event.retentionClass,
    versions: event.versions,
    inputHash: event.inputHash,
    status: event.status,
    ...(event.status === 'ACCEPTED'
      ? { normalizedValue: toStoredFactorValue(event.normalizedValue) }
      : { rejectionCode: event.rejectionCode }),
  };

  // Cross-field schema validation requires a document context. Mongoose query
  // validators run with `this` bound to the query, so validate the immutable
  // insert candidate before the atomic upsert.
  await new EvidenceEvent(evidenceInsert).validate();
  const stored = await EvidenceEvent.findOneAndUpdate(
    {
      subjectKind: event.subjectKind,
      subjectId: event.subjectId,
      idempotencyKey: event.idempotencyKey,
    },
    {
      $setOnInsert: evidenceInsert,
    },
    { upsert: true, new: true, runValidators: true, session: options.session }
  );
  const storedStatusFieldsValid =
    stored?.status === 'REJECTED'
      ? Boolean(stored.rejectionCode) && stored.normalizedValue == null
      : stored?.normalizedValue != null && !stored?.rejectionCode;
  if (
    !stored ||
    stored.eventId !== event.eventId ||
    stored.inputHash !== event.inputHash ||
    stored.status !== event.status ||
    !storedStatusFieldsValid
  ) {
    throw new FactorPersistenceConflictError('EVIDENCE_IDEMPOTENCY_CONFLICT');
  }
  return { eventId: stored.eventId, status: stored.status, inputHash: stored.inputHash };
}

export async function materializeIndividualFactorSnapshot(
  input: BuildIndividualFactorSnapshotInput,
  release: FactorRegistryRelease,
  options: FactorPersistenceOptions = {}
): Promise<DomainIndividualFactorSnapshot> {
  await assertRegistryAvailable(release, options);
  assertBuildVersions(input, release);
  const snapshot = buildIndividualFactorSnapshot(input);
  const contextFilter = snapshot.contextPairId
    ? { contextPairId: snapshot.contextPairId }
    : { contextPairId: { $exists: false } };
  const stored = await IndividualFactorSnapshot.findOneAndUpdate(
    {
      subjectId: snapshot.subjectId,
      ...contextFilter,
      projectionPurpose: snapshot.projectionPurpose,
      factorKey: snapshot.factorKey,
      revision: snapshot.revision,
    },
    {
      $setOnInsert: {
        ...snapshot,
        value: toStoredFactorValue(snapshot.value),
        evidenceIds: [...snapshot.evidenceIds],
      },
    },
    { upsert: true, new: true, runValidators: true, session: options.session }
  );
  if (
    !stored ||
    stored.snapshotId !== snapshot.snapshotId ||
    stored.inputHash !== snapshot.inputHash ||
    stored.outputHash !== snapshot.outputHash ||
    !sameSnapshotContract(stored, snapshot)
  ) {
    throw new FactorPersistenceConflictError('SNAPSHOT_REVISION_CONFLICT');
  }
  return snapshot;
}

export async function materializePairFactorSnapshot(
  input: BuildPairFactorSnapshotInput,
  release: FactorRegistryRelease,
  options: FactorPersistenceOptions = {}
): Promise<DomainPairFactorSnapshot> {
  await assertRegistryAvailable(release, options);
  assertBuildVersions(input, release);
  const snapshot = buildPairFactorSnapshot(input);
  const stored = await PairFactorSnapshot.findOneAndUpdate(
    {
      pairId: snapshot.pairId,
      factorKey: snapshot.factorKey,
      revision: snapshot.revision,
    },
    {
      $setOnInsert: {
        ...snapshot,
        value: toStoredFactorValue(snapshot.value),
        evidenceIds: [...snapshot.evidenceIds],
      },
    },
    { upsert: true, new: true, runValidators: true, session: options.session }
  );
  if (
    !stored ||
    stored.snapshotId !== snapshot.snapshotId ||
    stored.inputHash !== snapshot.inputHash ||
    stored.outputHash !== snapshot.outputHash ||
    !sameSnapshotContract(stored, snapshot)
  ) {
    throw new FactorPersistenceConflictError('SNAPSHOT_REVISION_CONFLICT');
  }
  return snapshot;
}

export async function materializePairFactorEvaluationSnapshot(
  input: BuildPairFactorEvaluationSnapshotInput,
  release: FactorRegistryRelease,
  options: FactorPersistenceOptions = {}
): Promise<DomainPairFactorEvaluationSnapshot> {
  await assertRegistryAvailable(release, options);
  assertBuildVersions(input, release);
  const snapshot = buildPairFactorEvaluationSnapshot(input);
  const stored = await PairFactorEvaluationSnapshot.findOneAndUpdate(
    {
      pairId: snapshot.pairId,
      factorKey: snapshot.factorKey,
      context: snapshot.context,
      strategy: snapshot.strategy,
      revision: snapshot.revision,
    },
    {
      $setOnInsert: {
        ...snapshot,
        individualSnapshotIds: [...snapshot.individualSnapshotIds],
        evaluation: {
          ...snapshot.evaluation,
          reasonCodes: [...snapshot.evaluation.reasonCodes],
        },
      },
    },
    { upsert: true, new: true, runValidators: true, session: options.session }
  );
  if (
    !stored ||
    stored.snapshotId !== snapshot.snapshotId ||
    stored.inputHash !== snapshot.inputHash ||
    stored.outputHash !== snapshot.outputHash ||
    stored.strategyVersion !== snapshot.strategyVersion ||
    stored.directionality !== snapshot.directionality ||
    !sameSnapshotContract(stored, snapshot)
  ) {
    throw new FactorPersistenceConflictError('SNAPSHOT_REVISION_CONFLICT');
  }
  return snapshot;
}

const assertBuildVersions = (
  input: {
    registryVersion: number;
    algorithmVersion: number;
    snapshotVersion: number;
    displayVersion: number;
  },
  release: FactorRegistryRelease
): void => {
  if (
    input.registryVersion !== release.registryVersion ||
    input.algorithmVersion !== release.algorithmVersion ||
    input.snapshotVersion !== release.snapshotVersion ||
    input.displayVersion !== release.displayVersion
  ) {
    throw new FactorPersistenceConflictError('REGISTRY_RELEASE_CONFLICT');
  }
};

const assertReplay = (result: SnapshotReplayResult): void => {
  if (result.status !== 'MATCH') {
    throw new FactorPersistenceConflictError('SNAPSHOT_REPLAY_MISMATCH');
  }
};

export function assertIndividualSnapshotReplay(
  expected: DomainIndividualFactorSnapshot,
  input: Omit<BuildIndividualFactorSnapshotInput, 'snapshotId' | 'revision' | 'calculatedAt'>
): void {
  assertReplay(replayIndividualFactorSnapshot(expected, input));
}

export function assertPairSnapshotReplay(
  expected: DomainPairFactorSnapshot,
  input: Omit<BuildPairFactorSnapshotInput, 'snapshotId' | 'revision' | 'calculatedAt'>
): void {
  assertReplay(replayPairFactorSnapshot(expected, input));
}

export function assertPairEvaluationSnapshotReplay(
  expected: DomainPairFactorEvaluationSnapshot,
  input: Omit<BuildPairFactorEvaluationSnapshotInput, 'snapshotId' | 'revision' | 'calculatedAt'>
): void {
  assertReplay(replayPairFactorEvaluationSnapshot(expected, input));
}
