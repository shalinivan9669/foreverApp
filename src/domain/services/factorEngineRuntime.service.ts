import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import type { FactorDefinition } from '@/domain/model/definitions/definitionTypes';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { factorEvidenceSelectionWindow } from '@/domain/model/aggregation/factorAggregation';
import { createEvidenceEvent, type EvidenceEvent as DomainEvidenceEvent } from '@/domain/model/evidence/evidence';
import {
  buildIndividualFactorSnapshot,
  buildPairFactorEvaluationSnapshot,
  isSnapshotEffectiveAt,
  snapshotVersionsMatchRegistry,
  type IndividualFactorSnapshot as DomainIndividualFactorSnapshot,
} from '@/domain/model/snapshots/snapshots';
import { validateFactorValue } from '@/domain/model/values/factorValue';
import {
  FactorPersistenceConflictError,
  materializeIndividualFactorSnapshot,
  materializePairFactorEvaluationSnapshot,
  seedDefinitionRegistryRelease,
  upsertEvidenceEvent,
} from '@/domain/services/factorEnginePersistence.service';
import {
  EvidenceEvent,
  type EvidenceEventType,
} from '@/models/EvidenceEvent';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import {
  PairFactorEvaluationSnapshot,
  type PairFactorEvaluationSnapshotType,
} from '@/models/PairFactorEvaluationSnapshot';
import {
  fromStoredFactorValue,
  StoredFactorValueValidationError,
} from '@/models/factorEngineSchemas';

export const WEEKLY_FACTOR_KEYS = [
  'communication.weekly.connection',
  'communication.weekly.tension',
  'wellbeing.current.overload',
  'wellbeing.current.readiness',
] as const;

export type WeeklyFactorKey = (typeof WEEKLY_FACTOR_KEYS)[number];

type WeeklyMeasurementKey =
  | 'weekly.connection.direct'
  | 'weekly.tension.direct'
  | 'weekly.overload.direct'
  | 'weekly.readiness.direct';

const WEEKLY_INSTRUMENT_KEY = 'weekly.mvp' as const;
const MATERIALIZATION_RETRY_LIMIT = 5;

export class FactorEngineRuntimeError extends Error {
  readonly reasonCode:
    | 'PAIR_MEMBERS_INVALID'
    | 'ACTOR_NOT_PAIR_MEMBER'
    | 'CANONICAL_DEFINITION_MISSING'
    | 'CANONICAL_STRATEGY_MISSING'
    | 'STORED_EVIDENCE_INVALID'
    | 'STORED_SNAPSHOT_INVALID'
    | 'MATERIALIZATION_RETRY_EXHAUSTED';

  constructor(reasonCode: FactorEngineRuntimeError['reasonCode']) {
    super(reasonCode);
    this.name = 'FactorEngineRuntimeError';
    this.reasonCode = reasonCode;
  }
}

export type RecordWeeklyFactorCheckInInput = {
  pairId: string;
  memberIds: readonly [string, string];
  actorId: string;
  checkInId: string;
  closeness: number;
  irritation: number;
  fatigue: number;
  readiness: number;
  observedAt: Date;
  recordedAt?: Date;
};

export type WeeklyEvidenceMetadata = {
  eventId: string;
  factorKey: WeeklyFactorKey;
  status: DomainEvidenceEvent['status'];
  inputHash: string;
};

export type WeeklyIndividualSnapshotMetadata = {
  snapshotId: string;
  subjectId: string;
  contextPairId: string;
  factorKey: WeeklyFactorKey;
  revision: number;
  status: DomainIndividualFactorSnapshot['status'];
  confidence: number;
  evidenceCount: number;
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
};

export type WeeklyPairEvaluationMetadata = {
  snapshotId: string;
  pairId: string;
  factorKey: WeeklyFactorKey;
  revision: number;
  context: 'COMMITTED_RELATIONSHIP';
  strategy: PairFactorEvaluationSnapshotType['strategy'];
  status: PairFactorEvaluationSnapshotType['evaluation']['status'];
  confidence: number;
  reasonCodes: readonly string[];
  actionability: PairFactorEvaluationSnapshotType['evaluation']['actionability'];
  individualSnapshotIds: readonly [string, string];
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
};

export type WeeklyPairEvaluationReadModel = {
  pairId: string;
  registryKey: string;
  registryVersion: number;
  algorithmVersion: number;
  snapshotVersion: number;
  displayVersion: number;
  evaluations: readonly WeeklyPairEvaluationMetadata[];
};

export type ProcessWeeklyFactorCheckInResult = {
  evidence: readonly WeeklyEvidenceMetadata[];
  individualSnapshots: readonly WeeklyIndividualSnapshotMetadata[];
  pairEvaluations: readonly WeeklyPairEvaluationMetadata[];
};

const deterministicId = (prefix: string, parts: readonly string[]): string =>
  `${prefix}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)}`;

const factorFor = (factorKey: WeeklyFactorKey): FactorDefinition => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === factorKey
  );
  if (!factor) {
    throw new FactorEngineRuntimeError('CANONICAL_DEFINITION_MISSING');
  }
  return factor;
};

const measurementFor = (measurementKey: string) => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === measurementKey
  );
  if (!measurement) {
    throw new FactorEngineRuntimeError('CANONICAL_DEFINITION_MISSING');
  }
  return measurement;
};

const weeklyInstrument = () => {
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === WEEKLY_INSTRUMENT_KEY
  );
  if (!instrument) {
    throw new FactorEngineRuntimeError('CANONICAL_DEFINITION_MISSING');
  }
  return instrument;
};

const assertPairMembers = (
  memberIds: readonly [string, string],
  actorId?: string
): void => {
  if (
    memberIds.length !== 2 ||
    !memberIds[0] ||
    !memberIds[1] ||
    memberIds[0] === memberIds[1]
  ) {
    throw new FactorEngineRuntimeError('PAIR_MEMBERS_INVALID');
  }
  if (actorId && !memberIds.includes(actorId)) {
    throw new FactorEngineRuntimeError('ACTOR_NOT_PAIR_MEMBER');
  }
};

export async function ensureCanonicalFactorRegistrySeeded(
  seededAt: Date = new Date(),
  session?: ClientSession
): Promise<{ registryKey: string; registryVersion: number; hash: string }> {
  return seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, seededAt, { session });
}

export async function recordWeeklyFactorCheckIn(
  input: RecordWeeklyFactorCheckInInput
): Promise<readonly WeeklyEvidenceMetadata[]> {
  assertPairMembers(input.memberIds, input.actorId);
  const recordedAt = input.recordedAt ?? new Date();
  await ensureCanonicalFactorRegistrySeeded(recordedAt);
  const instrument = weeklyInstrument();
  const values: readonly {
    factorKey: WeeklyFactorKey;
    measurementKey: WeeklyMeasurementKey;
    value: number;
  }[] = [
    {
      factorKey: 'communication.weekly.connection',
      measurementKey: 'weekly.connection.direct',
      value: input.closeness,
    },
    {
      factorKey: 'communication.weekly.tension',
      measurementKey: 'weekly.tension.direct',
      value: input.irritation,
    },
    {
      factorKey: 'wellbeing.current.overload',
      measurementKey: 'weekly.overload.direct',
      value: input.fatigue,
    },
    {
      factorKey: 'wellbeing.current.readiness',
      measurementKey: 'weekly.readiness.direct',
      value: input.readiness,
    },
  ];

  const events = values.map((binding) => {
    const factor = factorFor(binding.factorKey);
    const measurement = measurementFor(binding.measurementKey);
    const identityParts = [
      MVP_FACTOR_REGISTRY.registryKey,
      String(MVP_FACTOR_REGISTRY.registryVersion),
      input.pairId,
      input.actorId,
      input.checkInId,
      factor.key,
      measurement.key,
    ];
    return createEvidenceEvent(
      {
        eventId: deterministicId('fev', identityParts),
        idempotencyKey: deterministicId('weekly', identityParts),
        actorId: input.actorId,
        subjectKind: 'INDIVIDUAL',
        subjectId: input.actorId,
        pairId: input.pairId,
        observationScope: 'SELF',
        factorKey: factor.key,
        measurementKey: measurement.key,
        instrumentKey: instrument.key,
        sourceType: 'CHECK_IN',
        sourceRef: `weekly-check-in:${input.checkInId}`,
        sourceRevision: 'weekly-check-in-answer-v1',
        submittedValue: { kind: 'SCALAR', value: binding.value },
        reliabilityMultiplier: 1,
        observedAt: input.observedAt,
        recordedAt,
        context: 'COMMITTED_RELATIONSHIP',
        purpose: 'PAIR_MODEL',
        privacyClass: factor.privacyClass,
        captureMode: 'PAIR_MODEL_ONLY',
        policyVersion: 'mvp-privacy-v1',
        consentRevision: 'weekly-check-in-consent-v1',
        retentionClass: 'PAIR_CONTEXT',
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      },
      factor,
      measurement,
      instrument
    );
  });

  await Promise.all(
    events.map((event) => upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY))
  );
  return events.map((event) => ({
    eventId: event.eventId,
    factorKey: event.factorKey as WeeklyFactorKey,
    status: event.status,
    inputHash: event.inputHash,
  }));
}

const toDomainEvidenceEvent = (stored: EvidenceEventType): DomainEvidenceEvent => {
  try {
    const submittedValue = fromStoredFactorValue(stored.submittedValue);
    const common = {
      eventId: stored.eventId,
      idempotencyKey: stored.idempotencyKey,
      actorId: stored.actorId,
      subjectKind: stored.subjectKind,
      subjectId: stored.subjectId,
      pairId: stored.pairId,
      observationScope: stored.observationScope,
      observedSubjectId: stored.observedSubjectId,
      factorKey: stored.factorKey,
      measurementKey: stored.measurementKey,
      instrumentKey: stored.instrumentKey,
      sourceType: stored.sourceType,
      sourceRef: stored.sourceRef,
      sourceRevision: stored.sourceRevision,
      sourceHash: stored.sourceHash,
      submittedValue,
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
      versions: {
        registryVersion: stored.versions.registryVersion,
        definitionVersion: stored.versions.definitionVersion,
        measurementVersion: stored.versions.measurementVersion,
        instrumentVersion: stored.versions.instrumentVersion,
        algorithmVersion: stored.versions.algorithmVersion,
      },
      inputHash: stored.inputHash,
    };
    if (stored.status === 'REJECTED') {
      if (!stored.rejectionCode || stored.normalizedValue != null) {
        throw new FactorEngineRuntimeError('STORED_EVIDENCE_INVALID');
      }
      return {
        ...common,
        status: 'REJECTED',
        rejectionCode: stored.rejectionCode,
      };
    }
    if (!stored.normalizedValue || stored.rejectionCode) {
      throw new FactorEngineRuntimeError('STORED_EVIDENCE_INVALID');
    }
    const normalizedValue = fromStoredFactorValue(stored.normalizedValue);
    return { ...common, status: 'ACCEPTED', normalizedValue };
  } catch (error) {
    if (error instanceof StoredFactorValueValidationError) {
      throw new FactorEngineRuntimeError('STORED_EVIDENCE_INVALID');
    }
    throw error;
  }
};

const evidenceForSubjectFactor = async (
  subjectId: string,
  contextPairId: string,
  factorKey: WeeklyFactorKey,
  evidenceCutoffAt: Date,
  session?: ClientSession
): Promise<readonly DomainEvidenceEvent[]> => {
  const factor = factorFor(factorKey);
  const selection = factorEvidenceSelectionWindow(factor, evidenceCutoffAt);
  const stored = await EvidenceEvent.find({
    subjectKind: 'INDIVIDUAL',
    subjectId,
    pairId: contextPairId,
    observationScope: 'SELF',
    context: 'COMMITTED_RELATIONSHIP',
    purpose: { $in: ['PAIR_MODEL', 'RECOMMENDATION'] },
    captureMode: { $in: ['PAIR_MODEL_ONLY', 'SHARED'] },
    factorKey,
    status: 'ACCEPTED',
    'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
    'versions.definitionVersion': factor.definitionVersion,
    'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
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
    .session(session ?? null);
  const chronological = [...stored].reverse();
  if (
    chronological.some((event) => {
      const measurement = MVP_FACTOR_REGISTRY.measurements.find(
        (candidate) => candidate.key === event.measurementKey
      );
      const instrument = MVP_FACTOR_REGISTRY.instruments.find(
        (candidate) => candidate.key === event.instrumentKey
      );
      return !Boolean(
        measurement &&
          instrument &&
          measurement.factorKey === factor.key &&
          measurement.sourceType === event.sourceType &&
          measurement.measurementVersion === event.versions.measurementVersion &&
          instrument.instrumentVersion === event.versions.instrumentVersion &&
          instrument.measurementKeys.includes(measurement.key)
      );
    })
  ) {
    throw new FactorEngineRuntimeError('STORED_EVIDENCE_INVALID');
  }
  return chronological.map((event) => toDomainEvidenceEvent(event));
};

const isRetryableMaterializationError = (error: Error): boolean => {
  if (
    error instanceof FactorPersistenceConflictError &&
    error.reasonCode === 'SNAPSHOT_REVISION_CONFLICT'
  ) {
    return true;
  }
  const mongoError = error as Error & { code?: number };
  return mongoError.code === 11000;
};

const individualMetadata = (
  snapshot: DomainIndividualFactorSnapshot
): WeeklyIndividualSnapshotMetadata => ({
  snapshotId: snapshot.snapshotId,
  subjectId: snapshot.subjectId,
  contextPairId:
    snapshot.contextPairId ??
    (() => {
      throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
    })(),
  factorKey: snapshot.factorKey as WeeklyFactorKey,
  revision: snapshot.revision,
  status: snapshot.status,
  confidence: snapshot.metrics.confidence,
  evidenceCount: snapshot.metrics.evidenceCount,
  inputHash: snapshot.inputHash,
  outputHash: snapshot.outputHash,
  calculatedAt: new Date(snapshot.calculatedAt.getTime()),
});

const metadataFromStoredIndividual = (
  snapshot: IndividualFactorSnapshotType,
  factor: FactorDefinition,
  effectiveAt: Date
): WeeklyIndividualSnapshotMetadata => {
  if (
    snapshot.factorKey !== factor.key ||
    !snapshotVersionsMatchRegistry(
      snapshot.versions,
      factor,
      MVP_FACTOR_REGISTRY
    ) ||
    !isSnapshotEffectiveAt(snapshot, snapshot.calculatedAt) ||
    !isSnapshotEffectiveAt(snapshot, effectiveAt)
  ) {
    throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
  }
  return {
    snapshotId: snapshot.snapshotId,
    subjectId: snapshot.subjectId,
    contextPairId:
      snapshot.contextPairId ??
      (() => {
        throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
      })(),
    factorKey: snapshot.factorKey as WeeklyFactorKey,
    revision: snapshot.revision,
    status: snapshot.status,
    confidence: snapshot.metrics.confidence,
    evidenceCount: snapshot.metrics.evidenceCount,
    inputHash: snapshot.inputHash,
    outputHash: snapshot.outputHash,
    calculatedAt: new Date(snapshot.calculatedAt.getTime()),
  };
};

const materializeOneIndividualFactor = async (
  subjectId: string,
  contextPairId: string,
  factorKey: WeeklyFactorKey,
  events: readonly DomainEvidenceEvent[],
  calculatedAt: Date,
  session?: ClientSession
): Promise<WeeklyIndividualSnapshotMetadata> => {
  const factor = factorFor(factorKey);
  const provisional = buildIndividualFactorSnapshot({
    snapshotId: 'provisional',
    subjectId,
    contextPairId,
    projectionPurpose: 'PAIR_MODEL',
    factor,
    events,
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt,
  });
  const snapshotId = deterministicId('ifs', [
    subjectId,
    contextPairId,
    factorKey,
    provisional.inputHash,
  ]);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const existing = await IndividualFactorSnapshot.findOne({
      subjectId,
      contextPairId,
      projectionPurpose: 'PAIR_MODEL',
      factorKey,
      inputHash: provisional.inputHash,
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      'versions.snapshotVersion': MVP_FACTOR_REGISTRY.snapshotVersion,
      'versions.displayVersion': MVP_FACTOR_REGISTRY.displayVersion,
    }).session(session ?? null);
    if (existing) {
      return metadataFromStoredIndividual(existing, factor, calculatedAt);
    }

    const latest = await IndividualFactorSnapshot.findOne({
      subjectId,
      contextPairId,
      projectionPurpose: 'PAIR_MODEL',
      factorKey,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .session(session ?? null);
    const revision = (latest?.revision ?? -1) + 1;
    try {
      const snapshot = await materializeIndividualFactorSnapshot(
        {
          snapshotId,
          subjectId,
          contextPairId,
          projectionPurpose: 'PAIR_MODEL',
          factor,
          events,
          revision,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt,
        },
        MVP_FACTOR_REGISTRY,
        { session }
      );
      return individualMetadata(snapshot);
    } catch (error) {
      if (!(error instanceof Error) || !isRetryableMaterializationError(error)) {
        throw error;
      }
    }
  }
  throw new FactorEngineRuntimeError('MATERIALIZATION_RETRY_EXHAUSTED');
};

export async function materializeLatestWeeklyIndividualFactorSnapshots(input: {
  subjectId: string;
  pairId: string;
  calculatedAt?: Date;
  session?: ClientSession;
}): Promise<readonly WeeklyIndividualSnapshotMetadata[]> {
  await ensureCanonicalFactorRegistrySeeded(new Date(), input.session);
  const calculatedAt = input.calculatedAt ?? new Date();
  const result: WeeklyIndividualSnapshotMetadata[] = [];
  for (const factorKey of WEEKLY_FACTOR_KEYS) {
    const events = await evidenceForSubjectFactor(
      input.subjectId,
      input.pairId,
      factorKey,
      calculatedAt,
      input.session
    );
    if (events.length === 0) continue;
    result.push(
      await materializeOneIndividualFactor(
        input.subjectId,
        input.pairId,
        factorKey,
        events,
        calculatedAt,
        input.session
      )
    );
  }
  return result.sort((a, b) => a.factorKey.localeCompare(b.factorKey));
}

const toDomainIndividualSnapshot = (
  stored: IndividualFactorSnapshotType,
  factor: FactorDefinition
): DomainIndividualFactorSnapshot => {
  try {
    if (
      stored.factorKey !== factor.key ||
      !snapshotVersionsMatchRegistry(
        stored.versions,
        factor,
        MVP_FACTOR_REGISTRY
      ) ||
      !isSnapshotEffectiveAt(stored, stored.calculatedAt)
    ) {
      throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    const value = fromStoredFactorValue(stored.value);
    const validation = validateFactorValue(factor.valueSchema, value);
    if (!validation.valid) {
      throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    return {
      snapshotId: stored.snapshotId,
      subjectId: stored.subjectId,
      contextPairId: stored.contextPairId,
      projectionPurpose: stored.projectionPurpose,
      factorKey: stored.factorKey,
      revision: stored.revision,
      status: stored.status,
      value: validation.value,
      metrics: {
        confidence: stored.metrics.confidence,
        coverage: stored.metrics.coverage,
        freshness: stored.metrics.freshness,
        consistency: stored.metrics.consistency,
        evidenceCount: stored.metrics.evidenceCount,
      },
      evidenceIds: [...stored.evidenceIds],
      versions: {
        registryVersion: stored.versions.registryVersion,
        definitionVersion: stored.versions.definitionVersion,
        algorithmVersion: stored.versions.algorithmVersion,
        snapshotVersion: stored.versions.snapshotVersion,
        displayVersion: stored.versions.displayVersion,
        measurementRefs: stored.versions.measurementRefs.map((reference) => ({
          key: reference.key,
          version: reference.version,
        })),
        instrumentRefs: stored.versions.instrumentRefs.map((reference) => ({
          key: reference.key,
          version: reference.version,
        })),
      },
      inputHash: stored.inputHash,
      outputHash: stored.outputHash,
      calculatedAt: new Date(stored.calculatedAt.getTime()),
      effectiveFrom: new Date(stored.effectiveFrom.getTime()),
      effectiveUntil: stored.effectiveUntil
        ? new Date(stored.effectiveUntil.getTime())
        : undefined,
    };
  } catch (error) {
    if (error instanceof StoredFactorValueValidationError) {
      throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    throw error;
  }
};

const latestIndividualSnapshot = async (
  subjectId: string,
  contextPairId: string,
  factor: FactorDefinition,
  effectiveAt: Date,
  session?: ClientSession
): Promise<DomainIndividualFactorSnapshot | undefined> => {
  const stored = await IndividualFactorSnapshot.findOne({
    subjectId,
    contextPairId,
    projectionPurpose: 'PAIR_MODEL',
    factorKey: factor.key,
  })
    .sort({ revision: -1 })
    .session(session ?? null);
  if (!stored || !isSnapshotEffectiveAt(stored, effectiveAt)) return undefined;
  return toDomainIndividualSnapshot(stored, factor);
};

const pairEvaluationMetadata = (
  snapshot: PairFactorEvaluationSnapshotType,
  factor: FactorDefinition,
  effectiveAt: Date
): WeeklyPairEvaluationMetadata => {
  const individualSnapshotIds = snapshot.individualSnapshotIds;
  const strategy = factor.pairStrategies.find(
    (candidate) =>
      candidate.context === snapshot.context &&
      candidate.config.type === snapshot.strategy
  );
  if (
    individualSnapshotIds.length !== 2 ||
    snapshot.factorKey !== factor.key ||
    !strategy ||
    snapshot.strategyVersion !== strategy.strategyVersion ||
    snapshot.directionality !== strategy.directionality ||
    snapshot.evaluation.strategy !== snapshot.strategy ||
    snapshot.evaluation.context !== snapshot.context ||
    !snapshotVersionsMatchRegistry(
      snapshot.versions,
      factor,
      MVP_FACTOR_REGISTRY
    ) ||
    !isSnapshotEffectiveAt(snapshot, snapshot.calculatedAt) ||
    !isSnapshotEffectiveAt(snapshot, effectiveAt)
  ) {
    throw new FactorEngineRuntimeError('STORED_SNAPSHOT_INVALID');
  }
  return {
    snapshotId: snapshot.snapshotId,
    pairId: snapshot.pairId,
    factorKey: snapshot.factorKey as WeeklyFactorKey,
    revision: snapshot.revision,
    context: 'COMMITTED_RELATIONSHIP',
    strategy: snapshot.strategy,
    status: snapshot.evaluation.status,
    confidence: snapshot.evaluation.confidence,
    reasonCodes: [...snapshot.evaluation.reasonCodes],
    actionability: snapshot.evaluation.actionability,
    individualSnapshotIds: [
      individualSnapshotIds[0],
      individualSnapshotIds[1],
    ],
    inputHash: snapshot.inputHash,
    outputHash: snapshot.outputHash,
    calculatedAt: new Date(snapshot.calculatedAt.getTime()),
  };
};

const materializeOnePairEvaluation = async (
  pairId: string,
  factorKey: WeeklyFactorKey,
  partnerA: DomainIndividualFactorSnapshot,
  partnerB: DomainIndividualFactorSnapshot,
  calculatedAt: Date,
  session?: ClientSession
): Promise<WeeklyPairEvaluationMetadata> => {
  const factor = factorFor(factorKey);
  const strategy = factor.pairStrategies.find(
    (candidate) => candidate.context === 'COMMITTED_RELATIONSHIP'
  );
  if (!strategy) {
    throw new FactorEngineRuntimeError('CANONICAL_STRATEGY_MISSING');
  }
  const provisional = buildPairFactorEvaluationSnapshot({
    snapshotId: 'provisional',
    pairId,
    factor,
    strategy,
    relationshipContext: 'COMMITTED_RELATIONSHIP',
    partnerA,
    partnerB,
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt,
  });
  const snapshotId = deterministicId('pfes', [
    pairId,
    factorKey,
    provisional.inputHash,
  ]);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const existing = await PairFactorEvaluationSnapshot.findOne({
      pairId,
      factorKey,
      context: 'COMMITTED_RELATIONSHIP',
      strategy: strategy.config.type,
      strategyVersion: strategy.strategyVersion,
      directionality: strategy.directionality,
      inputHash: provisional.inputHash,
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      'versions.snapshotVersion': MVP_FACTOR_REGISTRY.snapshotVersion,
      'versions.displayVersion': MVP_FACTOR_REGISTRY.displayVersion,
    }).session(session ?? null);
    if (existing) return pairEvaluationMetadata(existing, factor, calculatedAt);

    const latest = await PairFactorEvaluationSnapshot.findOne({
      pairId,
      factorKey,
      context: 'COMMITTED_RELATIONSHIP',
      strategy: strategy.config.type,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .session(session ?? null);
    const revision = (latest?.revision ?? -1) + 1;
    try {
      const snapshot = await materializePairFactorEvaluationSnapshot(
        {
          snapshotId,
          pairId,
          factor,
          strategy,
          relationshipContext: 'COMMITTED_RELATIONSHIP',
          partnerA,
          partnerB,
          revision,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt,
        },
        MVP_FACTOR_REGISTRY,
        { session }
      );
      return {
        snapshotId: snapshot.snapshotId,
        pairId: snapshot.pairId,
        factorKey: snapshot.factorKey as WeeklyFactorKey,
        revision: snapshot.revision,
        context: 'COMMITTED_RELATIONSHIP',
        strategy: snapshot.strategy,
        status: snapshot.evaluation.status,
        confidence: snapshot.evaluation.confidence,
        reasonCodes: [...snapshot.evaluation.reasonCodes],
        actionability: snapshot.evaluation.actionability,
        individualSnapshotIds: snapshot.individualSnapshotIds,
        inputHash: snapshot.inputHash,
        outputHash: snapshot.outputHash,
        calculatedAt: new Date(snapshot.calculatedAt.getTime()),
      };
    } catch (error) {
      if (!(error instanceof Error) || !isRetryableMaterializationError(error)) {
        throw error;
      }
    }
  }
  throw new FactorEngineRuntimeError('MATERIALIZATION_RETRY_EXHAUSTED');
};

export async function materializeWeeklyPairFactorEvaluationSnapshots(input: {
  pairId: string;
  memberIds: readonly [string, string];
  calculatedAt?: Date;
  session?: ClientSession;
}): Promise<readonly WeeklyPairEvaluationMetadata[]> {
  assertPairMembers(input.memberIds);
  await ensureCanonicalFactorRegistrySeeded(new Date(), input.session);
  const calculatedAt = input.calculatedAt ?? new Date();
  for (const subjectId of input.memberIds) {
    await materializeLatestWeeklyIndividualFactorSnapshots({
      subjectId,
      pairId: input.pairId,
      calculatedAt,
      session: input.session,
    });
  }

  const evaluations: WeeklyPairEvaluationMetadata[] = [];
  for (const factorKey of WEEKLY_FACTOR_KEYS) {
    const factor = factorFor(factorKey);
    const partnerA = await latestIndividualSnapshot(
      input.memberIds[0],
      input.pairId,
      factor,
      calculatedAt,
      input.session
    );
    const partnerB = await latestIndividualSnapshot(
      input.memberIds[1],
      input.pairId,
      factor,
      calculatedAt,
      input.session
    );
    if (!partnerA || !partnerB) continue;
    evaluations.push(
      await materializeOnePairEvaluation(
        input.pairId,
        factorKey,
        partnerA,
        partnerB,
        calculatedAt,
        input.session
      )
    );
  }
  return evaluations.sort((a, b) => a.factorKey.localeCompare(b.factorKey));
}

export async function readLatestInternalWeeklyPairEvaluations(input: {
  pairId: string;
  effectiveAt?: Date;
  session?: ClientSession;
}): Promise<WeeklyPairEvaluationReadModel> {
  await ensureCanonicalFactorRegistrySeeded(new Date(), input.session);
  const effectiveAt = input.effectiveAt ?? new Date();
  const evaluations: WeeklyPairEvaluationMetadata[] = [];
  for (const factorKey of WEEKLY_FACTOR_KEYS) {
    const factor = factorFor(factorKey);
    const strategy = factor.pairStrategies.find(
      (candidate) => candidate.context === 'COMMITTED_RELATIONSHIP'
    );
    if (!strategy) {
      throw new FactorEngineRuntimeError('CANONICAL_STRATEGY_MISSING');
    }
    const snapshot = await PairFactorEvaluationSnapshot.findOne({
      pairId: input.pairId,
      factorKey,
      context: 'COMMITTED_RELATIONSHIP',
      strategy: strategy.config.type,
      strategyVersion: strategy.strategyVersion,
      directionality: strategy.directionality,
    })
      .sort({ revision: -1 })
      .session(input.session ?? null);
    if (!snapshot) continue;
    try {
      evaluations.push(pairEvaluationMetadata(snapshot, factor, effectiveAt));
    } catch (error) {
      if (
        !(
          error instanceof FactorEngineRuntimeError &&
          error.reasonCode === 'STORED_SNAPSHOT_INVALID'
        )
      ) {
        throw error;
      }
    }
  }
  return {
    pairId: input.pairId,
    registryKey: MVP_FACTOR_REGISTRY.registryKey,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    evaluations: evaluations.sort((a, b) =>
      a.factorKey.localeCompare(b.factorKey)
    ),
  };
}

export async function processWeeklyFactorCheckIn(
  input: RecordWeeklyFactorCheckInInput
): Promise<ProcessWeeklyFactorCheckInResult> {
  const calculatedAt = input.recordedAt ?? new Date();
  const evidence = await recordWeeklyFactorCheckIn({
    ...input,
    recordedAt: calculatedAt,
  });
  const individualSnapshots =
    await materializeLatestWeeklyIndividualFactorSnapshots({
      subjectId: input.actorId,
      pairId: input.pairId,
      calculatedAt,
    });
  const pairEvaluations =
    await materializeWeeklyPairFactorEvaluationSnapshots({
      pairId: input.pairId,
      memberIds: input.memberIds,
      calculatedAt,
    });
  return { evidence, individualSnapshots, pairEvaluations };
}
