import { createHash } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import type {
  ActionDefinition,
  FactorDefinition,
  InstrumentDefinition,
  MeasurementDefinition,
} from '@/domain/model/definitions/definitionTypes';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  FACTOR_EVIDENCE_SELECTION_MAXIMUM,
  factorEvidenceSelectionWindow,
} from '@/domain/model/aggregation/factorAggregation';
import {
  createEvidenceEvent,
  type EvidencePurpose,
  type EvidenceEvent as DomainEvidenceEvent,
} from '@/domain/model/evidence/evidence';
import {
  buildIndividualFactorSnapshot,
  buildPairFactorEvaluationSnapshot,
  buildPairFactorSnapshot,
  isSnapshotEffectiveAt,
  snapshotVersionsMatchRegistry,
  type IndividualFactorSnapshot as DomainIndividualFactorSnapshot,
  type PairFactorEvaluationSnapshot as DomainPairFactorEvaluationSnapshot,
  type PairFactorSnapshot as DomainPairFactorSnapshot,
} from '@/domain/model/snapshots/snapshots';
import {
  skillLevelForScore,
  validateFactorValue,
  type FactorValue,
} from '@/domain/model/values/factorValue';
import {
  FactorPersistenceConflictError,
  materializeIndividualFactorSnapshot,
  materializePairFactorEvaluationSnapshot,
  materializePairFactorSnapshot,
  seedDefinitionRegistryRelease,
  upsertEvidenceEvent,
} from '@/domain/services/factorEnginePersistence.service';
import { EvidenceEvent, type EvidenceEventType } from '@/models/EvidenceEvent';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import type { PairFactorEvaluationSnapshotType } from '@/models/PairFactorEvaluationSnapshot';
import {
  PairFactorSnapshot,
  type PairFactorSnapshotType,
} from '@/models/PairFactorSnapshot';
import type { ActionDefinitionRef } from '@/models/ActivityTemplate';
import type {
  ActivityFactorEvidenceProvenance,
  ActivityResultSummary,
  Answer,
} from '@/models/PairActivity';
import {
  fromStoredFactorValue,
  StoredFactorValueValidationError,
} from '@/models/factorEngineSchemas';
import {
  ACTIVITY_FEEDBACK_POLICY_VERSION,
  activityRoleEvidenceMetrics,
  clamp,
  type ActivityRoleEvidenceMetrics,
} from '@/utils/activities';
import type { CheckInTpl } from '@/models/ActivityTemplate';
import { Pair } from '@/models/Pair';

export const ACTIVITY_INSTRUMENT_KEY = 'activityReflection.mvp' as const;

export const ACTIVITY_FACTOR_KEYS = [
  'communication.weekly.connection',
  'wellbeing.current.overload',
  'communication.conflict.repairSkill',
  'sharedLife.roles.householdCapability',
] as const;

export type ActivityFactorKey = (typeof ACTIVITY_FACTOR_KEYS)[number];

type ActivityMeasurementBinding = {
  factorKey: ActivityFactorKey;
  taskResultMeasurementKey: string;
  pairActivityMeasurementKey: string;
};

const ACTIVITY_MEASUREMENT_BINDINGS: readonly ActivityMeasurementBinding[] = [
  {
    factorKey: 'communication.weekly.connection',
    taskResultMeasurementKey: 'activity.connection.outcome',
    pairActivityMeasurementKey: 'pairActivity.connection.outcome',
  },
  {
    factorKey: 'wellbeing.current.overload',
    taskResultMeasurementKey: 'activity.overload.outcome',
    pairActivityMeasurementKey: 'pairActivity.overload.outcome',
  },
  {
    factorKey: 'communication.conflict.repairSkill',
    taskResultMeasurementKey: 'activity.repairSkill.outcome',
    pairActivityMeasurementKey: 'pairActivity.repairSkill.outcome',
  },
  {
    factorKey: 'sharedLife.roles.householdCapability',
    taskResultMeasurementKey: 'activity.householdRole.capability',
    pairActivityMeasurementKey: 'pairActivity.householdRole.capability',
  },
];

const MATERIALIZATION_RETRY_LIMIT = 5;

export class ActivityFactorRuntimeError extends Error {
  readonly reasonCode:
    | 'PAIR_MEMBERS_INVALID'
    | 'ACTOR_NOT_PAIR_MEMBER'
    | 'ACTION_DEFINITION_INVALID'
    | 'ACTION_TARGETS_INVALID'
    | 'CANONICAL_DEFINITION_MISSING'
    | 'CANONICAL_STRATEGY_MISSING'
    | 'PAIR_NOT_AVAILABLE'
    | 'STORED_EVIDENCE_INVALID'
    | 'STORED_SNAPSHOT_INVALID'
    | 'MATERIALIZATION_RETRY_EXHAUSTED';

  constructor(reasonCode: ActivityFactorRuntimeError['reasonCode']) {
    super(reasonCode);
    this.name = 'ActivityFactorRuntimeError';
    this.reasonCode = reasonCode;
  }
}

export type ActivityFactorBinding = {
  action: ActionDefinition;
  factors: readonly FactorDefinition[];
};

export type ActivityRecommendationInputs = {
  pairSnapshots: readonly DomainPairFactorSnapshot[];
  pairEvaluations: readonly import('@/domain/model/snapshots/snapshots').PairFactorEvaluationSnapshot[];
};

export type ActivityFactorReadReliabilityTestHooks = {
  beforeTransactionalPairLifecycleFence?: () => Promise<void>;
};

export type RecordActivityCheckInFactorEvidenceInput = {
  pairId: string;
  activityId: string;
  actionDefinition: ActionDefinitionRef;
  targetFactorKeys: readonly string[];
  memberIds: readonly [string, string];
  actorId: string;
  role: 'A' | 'B';
  checkIns: readonly CheckInTpl[];
  answers: readonly Answer[];
  observedAt: Date;
  recordedAt?: Date;
  session?: ClientSession;
};

export type RecordActivityCompletionFactorEvidenceInput = {
  pairId: string;
  activityId: string;
  actionDefinition: ActionDefinitionRef;
  targetFactorKeys: readonly string[];
  memberIds: readonly [string, string];
  actorId: string;
  checkIns: readonly CheckInTpl[];
  answers: readonly Answer[];
  result: ActivityResultSummary;
  observedAt: Date;
  recordedAt?: Date;
  session?: ClientSession;
};

const deterministicId = (prefix: string, parts: readonly string[]): string =>
  `${prefix}_${createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 40)}`;

const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

const ACTIVITY_RECOMMENDATION_FACTOR_KEYS = sortedUnique(
  MVP_FACTOR_REGISTRY.actions.flatMap((action) => [
    ...action.targetFactors,
    ...(action.minimumSkillFactorKey ? [action.minimumSkillFactorKey] : []),
    ...action.contraindications.map((contraindication) =>
      contraindication.factorKey
    ),
  ])
);

const ACTIVITY_RECOMMENDATION_EVALUATION_IDENTITIES =
  MVP_FACTOR_REGISTRY.factors.flatMap((factor) =>
    factor.pairStrategies
      .filter(
        (strategy) =>
          strategy.context === 'COMMITTED_RELATIONSHIP' &&
          ACTIVITY_RECOMMENDATION_FACTOR_KEYS.includes(factor.key)
      )
      .map((strategy) => ({
        factorKey: factor.key,
        context: strategy.context,
        strategy: strategy.config.type,
        strategyVersion: strategy.strategyVersion,
        directionality: strategy.directionality,
      }))
  );

const NON_WEEKLY_ACTIVITY_FACTOR_KEYS = [
  'communication.conflict.repairSkill',
  'sharedLife.roles.householdCapability',
] as const;

const copyEvidenceVersions = (
  versions: EvidenceEventType['versions']
): DomainEvidenceEvent['versions'] => ({
  registryVersion: versions.registryVersion,
  definitionVersion: versions.definitionVersion,
  measurementVersion: versions.measurementVersion,
  instrumentVersion: versions.instrumentVersion,
  algorithmVersion: versions.algorithmVersion,
});

const copySnapshotVersions = (
  versions: IndividualFactorSnapshotType['versions']
): DomainIndividualFactorSnapshot['versions'] => ({
  registryVersion: versions.registryVersion,
  definitionVersion: versions.definitionVersion,
  algorithmVersion: versions.algorithmVersion,
  snapshotVersion: versions.snapshotVersion,
  displayVersion: versions.displayVersion,
  measurementRefs: versions.measurementRefs.map((reference) => ({
    key: reference.key,
    version: reference.version,
  })),
  instrumentRefs: versions.instrumentRefs.map((reference) => ({
    key: reference.key,
    version: reference.version,
  })),
});

const copyAggregationMetrics = (
  metrics: IndividualFactorSnapshotType['metrics']
): DomainIndividualFactorSnapshot['metrics'] => ({
  confidence: metrics.confidence,
  coverage: metrics.coverage,
  freshness: metrics.freshness,
  consistency: metrics.consistency,
  evidenceCount: metrics.evidenceCount,
});

const copyPairEvaluation = (
  evaluation: PairFactorEvaluationSnapshotType['evaluation']
): DomainPairFactorEvaluationSnapshot['evaluation'] => ({
  strategy: evaluation.strategy,
  context: evaluation.context,
  status: evaluation.status,
  ...(evaluation.internalFit !== undefined
    ? { internalFit: evaluation.internalFit }
    : {}),
  confidence: evaluation.confidence,
  reasonCodes: [...evaluation.reasonCodes],
  actionability: evaluation.actionability,
  ...(evaluation.directionalFit
    ? {
        directionalFit: {
          aAcceptsB: evaluation.directionalFit.aAcceptsB,
          bAcceptsA: evaluation.directionalFit.bAcceptsA,
        },
      }
    : {}),
  ...(evaluation.roleMetrics
    ? {
        roleMetrics: {
          coverage: evaluation.roleMetrics.coverage,
          loadImbalance: evaluation.roleMetrics.loadImbalance,
          preferenceSatisfaction:
            evaluation.roleMetrics.preferenceSatisfaction,
        },
      }
    : {}),
});

const sameStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const versionReferenceKeys = (
  references: readonly { key: string; version: number }[]
): string[] =>
  references.map((reference) => `${reference.key}:${reference.version}`);

const hasExactComponentVersionUnion = (input: {
  evaluation: PairFactorEvaluationSnapshotType;
  components: readonly (
    | IndividualFactorSnapshotType
    | PairFactorSnapshotType
  )[];
}): boolean =>
  sameStringSet(
    versionReferenceKeys(input.evaluation.versions.measurementRefs),
    input.components.flatMap((component) =>
      versionReferenceKeys(component.versions.measurementRefs)
    )
  ) &&
  sameStringSet(
    versionReferenceKeys(input.evaluation.versions.instrumentRefs),
    input.components.flatMap((component) =>
      versionReferenceKeys(component.versions.instrumentRefs)
    )
  );

const assertAcceptedEvidence = (
  events: readonly DomainEvidenceEvent[]
): void => {
  if (events.some((event) => event.status !== 'ACCEPTED')) {
    throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
  }
};

const assertPairMembers = (
  memberIds: readonly [string, string],
  actorId?: string
): void => {
  if (!memberIds[0] || !memberIds[1] || memberIds[0] === memberIds[1]) {
    throw new ActivityFactorRuntimeError('PAIR_MEMBERS_INVALID');
  }
  if (actorId && !memberIds.includes(actorId)) {
    throw new ActivityFactorRuntimeError('ACTOR_NOT_PAIR_MEMBER');
  }
};

export const resolveActivityFactorBinding = (input: {
  actionDefinition: ActionDefinitionRef;
  targetFactorKeys: readonly string[];
}): ActivityFactorBinding => {
  if (input.actionDefinition.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion) {
    throw new ActivityFactorRuntimeError('ACTION_DEFINITION_INVALID');
  }
  const action = MVP_FACTOR_REGISTRY.actions.find(
    (candidate) =>
      candidate.key === input.actionDefinition.key &&
      candidate.actionVersion === input.actionDefinition.actionVersion
  );
  if (!action) {
    throw new ActivityFactorRuntimeError('ACTION_DEFINITION_INVALID');
  }
  if (!sameStringSet(action.targetFactors, input.targetFactorKeys)) {
    throw new ActivityFactorRuntimeError('ACTION_TARGETS_INVALID');
  }
  const factors = action.targetFactors.map((factorKey) => {
    if (!ACTIVITY_FACTOR_KEYS.includes(factorKey as ActivityFactorKey)) {
      throw new ActivityFactorRuntimeError('ACTION_TARGETS_INVALID');
    }
    const factor = MVP_FACTOR_REGISTRY.factors.find(
      (candidate) => candidate.key === factorKey
    );
    if (!factor) {
      throw new ActivityFactorRuntimeError('CANONICAL_DEFINITION_MISSING');
    }
    return factor;
  });
  return { action, factors };
};

const activityInstrument = (): InstrumentDefinition => {
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === ACTIVITY_INSTRUMENT_KEY
  );
  if (!instrument) {
    throw new ActivityFactorRuntimeError('CANONICAL_DEFINITION_MISSING');
  }
  return instrument;
};

const bindingFor = (factorKey: string): ActivityMeasurementBinding => {
  const binding = ACTIVITY_MEASUREMENT_BINDINGS.find(
    (candidate) => candidate.factorKey === factorKey
  );
  if (!binding) {
    throw new ActivityFactorRuntimeError('CANONICAL_DEFINITION_MISSING');
  }
  return binding;
};

const measurementFor = (measurementKey: string): MeasurementDefinition => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === measurementKey
  );
  if (!measurement) {
    throw new ActivityFactorRuntimeError('CANONICAL_DEFINITION_MISSING');
  }
  return measurement;
};

const factorValueForScore = (
  factor: FactorDefinition,
  rawScore: number
): FactorValue => {
  const score = clamp(rawScore);
  if (factor.valueSchema.type === 'MASTERY') {
    return {
      kind: 'MASTERY',
      score01: score,
      level: skillLevelForScore(score, factor.valueSchema),
    };
  }
  if (factor.valueSchema.type === 'SCALAR') {
    return { kind: 'SCALAR', value: score };
  }
  throw new ActivityFactorRuntimeError('CANONICAL_DEFINITION_MISSING');
};

const individualScoreForFactor = (
  factorKey: ActivityFactorKey,
  metrics: ActivityRoleEvidenceMetrics
): number => {
  switch (factorKey) {
    case 'communication.weekly.connection':
      return clamp(
        ((metrics.subjectiveChange ?? metrics.successScore) +
          (metrics.usefulness ?? metrics.successScore)) /
          2
      );
    case 'wellbeing.current.overload':
      return clamp(1 - (metrics.subjectiveChange ?? metrics.successScore));
    case 'communication.conflict.repairSkill':
    case 'sharedLife.roles.householdCapability':
      return clamp(metrics.successScore);
  }
};

const pairScoreForFactor = (
  factorKey: ActivityFactorKey,
  result: ActivityResultSummary
): number => {
  switch (factorKey) {
    case 'communication.weekly.connection':
      return clamp(
        ((result.subjectiveChangeAvg ?? result.successScore) +
          (result.usefulnessAvg ?? result.successScore)) /
          2
      );
    case 'wellbeing.current.overload':
      return clamp(1 - (result.subjectiveChangeAvg ?? result.successScore));
    case 'communication.conflict.repairSkill':
    case 'sharedLife.roles.householdCapability':
      return clamp(result.successScore);
  }
};

const isCanonicalEvidenceRecord = (
  event: EvidenceEventType,
  factor: FactorDefinition
): boolean => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === event.measurementKey
  );
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === event.instrumentKey
  );
  return Boolean(
    event.status === 'ACCEPTED' &&
      event.factorKey === factor.key &&
      event.versions.registryVersion === MVP_FACTOR_REGISTRY.registryVersion &&
      event.versions.definitionVersion === factor.definitionVersion &&
      event.versions.algorithmVersion === MVP_FACTOR_REGISTRY.algorithmVersion &&
      measurement &&
      instrument &&
      measurement.factorKey === factor.key &&
      measurement.sourceType === event.sourceType &&
      measurement.measurementVersion === event.versions.measurementVersion &&
      instrument.instrumentVersion === event.versions.instrumentVersion &&
      instrument.measurementKeys.includes(measurement.key)
  );
};

type EvidenceEventsById = ReadonlyMap<
  string,
  readonly EvidenceEventType[]
>;

const hasPinnedEvidenceVersionCoverage = (input: {
  evidenceIds: readonly string[];
  versions: IndividualFactorSnapshotType['versions'];
  evidenceEventsById: EvidenceEventsById;
}): boolean =>
  sortedUnique(input.evidenceIds).every((evidenceId) => {
    const events = input.evidenceEventsById.get(evidenceId);
    const event = events?.length === 1 ? events[0] : undefined;
    return Boolean(
      event &&
        event.status === 'ACCEPTED' &&
        input.versions.measurementRefs.some(
          (reference) =>
            reference.key === event.measurementKey &&
            reference.version === event.versions.measurementVersion
        ) &&
        input.versions.instrumentRefs.some(
          (reference) =>
            reference.key === event.instrumentKey &&
            reference.version === event.versions.instrumentVersion
        )
    );
  });

const hasSafePairModelEvidence = (input: {
  evidenceIds: readonly string[];
  pairId: string;
  factor: FactorDefinition;
  subjectKind: 'INDIVIDUAL' | 'PAIR';
  subjectId: string;
  evidenceEventsById: EvidenceEventsById;
}): boolean => {
  const evidenceIds = sortedUnique(input.evidenceIds);
  if (evidenceIds.length === 0) return false;
  for (const evidenceId of evidenceIds) {
    const matchingEvents = input.evidenceEventsById.get(evidenceId);
    if (!matchingEvents || matchingEvents.length !== 1) return false;
    const event = matchingEvents[0];
    if (
      !event ||
      !isCanonicalEvidenceRecord(event, input.factor) ||
      event.subjectKind !== input.subjectKind ||
      event.subjectId !== input.subjectId ||
      event.pairId !== input.pairId ||
      event.observationScope !==
        (input.subjectKind === 'PAIR' ? 'PAIR_DYAD' : 'SELF') ||
      (event.purpose !== 'PAIR_MODEL' && event.purpose !== 'RECOMMENDATION') ||
      (event.captureMode !== 'PAIR_MODEL_ONLY' &&
        event.captureMode !== 'SHARED') ||
      event.retentionClass !== 'PAIR_CONTEXT'
    ) {
      return false;
    }
  }
  return true;
};

const isSafePairSnapshotForRecommendation = (input: {
  snapshot: PairFactorSnapshotType;
  pairId: string;
  factor: FactorDefinition;
  evidenceEventsById: EvidenceEventsById;
  effectiveAt: Date;
}): boolean =>
  input.snapshot.pairId === input.pairId &&
  input.snapshot.factorKey === input.factor.key &&
  input.snapshot.status === 'AVAILABLE' &&
  snapshotVersionsMatchRegistry(
    input.snapshot.versions,
    input.factor,
    MVP_FACTOR_REGISTRY
  ) &&
  input.snapshot.versions.measurementRefs.length > 0 &&
  input.snapshot.versions.instrumentRefs.length > 0 &&
  isSnapshotEffectiveAt(input.snapshot, input.effectiveAt) &&
  hasPinnedEvidenceVersionCoverage({
    evidenceIds: input.snapshot.evidenceIds,
    versions: input.snapshot.versions,
    evidenceEventsById: input.evidenceEventsById,
  }) &&
  hasSafePairModelEvidence({
    evidenceIds: input.snapshot.evidenceIds,
    pairId: input.pairId,
    factor: input.factor,
    subjectKind: 'PAIR',
    subjectId: input.pairId,
    evidenceEventsById: input.evidenceEventsById,
  });

const isSafeIndividualSnapshotForRecommendation = (input: {
  snapshot: IndividualFactorSnapshotType;
  pairId: string;
  factor: FactorDefinition;
  evidenceEventsById: EvidenceEventsById;
  effectiveAt: Date;
}): boolean =>
  input.snapshot.contextPairId === input.pairId &&
  (input.snapshot.projectionPurpose === 'PAIR_MODEL' ||
    input.snapshot.projectionPurpose === 'RECOMMENDATION') &&
  input.snapshot.factorKey === input.factor.key &&
  input.snapshot.status === 'AVAILABLE' &&
  snapshotVersionsMatchRegistry(
    input.snapshot.versions,
    input.factor,
    MVP_FACTOR_REGISTRY
  ) &&
  input.snapshot.versions.measurementRefs.length > 0 &&
  input.snapshot.versions.instrumentRefs.length > 0 &&
  isSnapshotEffectiveAt(input.snapshot, input.effectiveAt) &&
  hasPinnedEvidenceVersionCoverage({
    evidenceIds: input.snapshot.evidenceIds,
    versions: input.snapshot.versions,
    evidenceEventsById: input.evidenceEventsById,
  }) &&
  hasSafePairModelEvidence({
    evidenceIds: input.snapshot.evidenceIds,
    pairId: input.pairId,
    factor: input.factor,
    subjectKind: 'INDIVIDUAL',
    subjectId: input.snapshot.subjectId,
    evidenceEventsById: input.evidenceEventsById,
  });

export async function ensureActivityFactorEngineReady(
  seededAt: Date = new Date()
): Promise<void> {
  await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, seededAt);
}

const readActivityRecommendationInputsInSession = async (input: {
  pairId: string;
  memberIds: readonly [string, string];
  effectiveAt: Date;
  session: ClientSession;
}): Promise<ActivityRecommendationInputs> => {
  const effectiveAt = input.effectiveAt;
  await materializeCurrentPairFactorSnapshots({
    pairId: input.pairId,
    memberIds: input.memberIds,
    calculatedAt: effectiveAt,
    session: input.session,
  });
  const pairSnapshotAggregate = PairFactorSnapshot.aggregate<PairFactorSnapshotType>([
    {
      $match: {
        pairId: input.pairId,
        factorKey: { $in: ACTIVITY_RECOMMENDATION_FACTOR_KEYS },
      },
    },
    { $sort: { factorKey: 1, revision: -1 } },
    { $group: { _id: '$factorKey', document: { $first: '$$ROOT' } } },
    { $replaceWith: '$document' },
    { $sort: { factorKey: 1 } },
    { $limit: ACTIVITY_RECOMMENDATION_FACTOR_KEYS.length },
  ]);
  const evaluationAggregate =
    PairFactorEvaluationSnapshot.aggregate<PairFactorEvaluationSnapshotType>([
      {
        $match: {
          pairId: input.pairId,
          $or: ACTIVITY_RECOMMENDATION_EVALUATION_IDENTITIES,
        },
      },
      { $sort: { factorKey: 1, revision: -1 } },
      { $group: { _id: '$factorKey', document: { $first: '$$ROOT' } } },
      { $replaceWith: '$document' },
      { $sort: { factorKey: 1 } },
      { $limit: ACTIVITY_RECOMMENDATION_FACTOR_KEYS.length },
    ]);
  pairSnapshotAggregate.session(input.session);
  evaluationAggregate.session(input.session);
  const storedPairSnapshots = await pairSnapshotAggregate.exec();
  const storedEvaluations = await evaluationAggregate.exec();

  const referencedIndividualSnapshotIds = sortedUnique(
    storedEvaluations.flatMap((evaluation) =>
      evaluation.individualSnapshotIds.length === 2
        ? evaluation.individualSnapshotIds
        : []
    )
  );
  const referencedIndividualSnapshots: IndividualFactorSnapshotType[] =
    referencedIndividualSnapshotIds.length === 0
      ? []
      : await IndividualFactorSnapshot.find({
          snapshotId: { $in: referencedIndividualSnapshotIds },
        })
          .session(input.session)
          .lean<IndividualFactorSnapshotType[]>();

  const referencedPairSnapshotIds = sortedUnique(
    storedEvaluations.flatMap((evaluation) =>
      evaluation.pairSnapshotId ? [evaluation.pairSnapshotId] : []
    )
  );
  const referencedPairSnapshots: PairFactorSnapshotType[] =
    referencedPairSnapshotIds.length === 0
      ? []
      : await PairFactorSnapshot.find({
          snapshotId: { $in: referencedPairSnapshotIds },
        })
          .session(input.session)
          .lean<PairFactorSnapshotType[]>();

  const referencedEvidenceIds = sortedUnique([
    ...storedPairSnapshots.flatMap((snapshot) =>
      snapshot.evidenceIds.length <= FACTOR_EVIDENCE_SELECTION_MAXIMUM
        ? snapshot.evidenceIds
        : []
    ),
    ...referencedIndividualSnapshots.flatMap(
      (snapshot) =>
        snapshot.evidenceIds.length <= FACTOR_EVIDENCE_SELECTION_MAXIMUM
          ? snapshot.evidenceIds
          : []
    ),
    ...referencedPairSnapshots.flatMap((snapshot) =>
      snapshot.evidenceIds.length <= FACTOR_EVIDENCE_SELECTION_MAXIMUM
        ? snapshot.evidenceIds
        : []
    ),
  ]);
  const referencedEvidence: EvidenceEventType[] =
    referencedEvidenceIds.length === 0
      ? []
      : await EvidenceEvent.find({ eventId: { $in: referencedEvidenceIds } })
          .session(input.session)
          .lean<EvidenceEventType[]>();

  const evidenceEventsById = new Map<string, EvidenceEventType[]>();
  for (const event of referencedEvidence) {
    const matchingEvents = evidenceEventsById.get(event.eventId);
    if (matchingEvents) {
      matchingEvents.push(event);
    } else {
      evidenceEventsById.set(event.eventId, [event]);
    }
  }

  const individualSnapshotsById = new Map<
    string,
    IndividualFactorSnapshotType[]
  >();
  for (const snapshot of referencedIndividualSnapshots) {
    const matchingSnapshots = individualSnapshotsById.get(snapshot.snapshotId);
    if (matchingSnapshots) {
      matchingSnapshots.push(snapshot);
    } else {
      individualSnapshotsById.set(snapshot.snapshotId, [snapshot]);
    }
  }

  const pairSnapshotsById = new Map<string, PairFactorSnapshotType[]>();
  for (const snapshot of referencedPairSnapshots) {
    const matchingSnapshots = pairSnapshotsById.get(snapshot.snapshotId);
    if (matchingSnapshots) {
      matchingSnapshots.push(snapshot);
    } else {
      pairSnapshotsById.set(snapshot.snapshotId, [snapshot]);
    }
  }

  const factorsByKey = new Map(
    MVP_FACTOR_REGISTRY.factors.map((factor) => [factor.key, factor] as const)
  );
  const latestPairSnapshots = new Map<string, DomainPairFactorSnapshot>();
  const seenPairSnapshotFactorKeys = new Set<string>();
  for (const stored of storedPairSnapshots) {
    if (seenPairSnapshotFactorKeys.has(stored.factorKey)) continue;
    seenPairSnapshotFactorKeys.add(stored.factorKey);
    const factor = factorsByKey.get(stored.factorKey);
    if (!factor || factor.definitionVersion !== stored.versions.definitionVersion) {
      continue;
    }
    if (
      !isSafePairSnapshotForRecommendation({
        snapshot: stored,
        pairId: input.pairId,
        factor,
        evidenceEventsById,
        effectiveAt,
      })
    ) {
      continue;
    }
    latestPairSnapshots.set(
      stored.factorKey,
      storedPairToDomain(stored, factor)
    );
  }

  const latestEvaluations = new Map<
    string,
    import('@/domain/model/snapshots/snapshots').PairFactorEvaluationSnapshot
  >();
  const seenEvaluationFactorKeys = new Set<string>();
  for (const stored of storedEvaluations) {
    if (seenEvaluationFactorKeys.has(stored.factorKey)) continue;
    seenEvaluationFactorKeys.add(stored.factorKey);
    const factor = factorsByKey.get(stored.factorKey);
    if (!factor || factor.definitionVersion !== stored.versions.definitionVersion) {
      continue;
    }
    const strategy = factor?.pairStrategies.find(
      (candidate) =>
        candidate.context === stored.context &&
        candidate.config.type === stored.strategy
    );
    if (
      !factor ||
      !strategy ||
      stored.strategyVersion !== strategy.strategyVersion ||
      stored.directionality !== strategy.directionality ||
      stored.evaluation.strategy !== stored.strategy ||
      stored.evaluation.context !== stored.context ||
      !snapshotVersionsMatchRegistry(
        stored.versions,
        factor,
        MVP_FACTOR_REGISTRY
      ) ||
      !isSnapshotEffectiveAt(stored, effectiveAt) ||
      stored.individualSnapshotIds.length !== 2
    ) {
      continue;
    }
    const partnerAMatches = individualSnapshotsById.get(
      stored.individualSnapshotIds[0]
    );
    const partnerBMatches = individualSnapshotsById.get(
      stored.individualSnapshotIds[1]
    );
    const partnerA =
      partnerAMatches?.length === 1 ? partnerAMatches[0] : undefined;
    const partnerB =
      partnerBMatches?.length === 1 ? partnerBMatches[0] : undefined;
    if (!partnerA || !partnerB || partnerA.subjectId === partnerB.subjectId) {
      continue;
    }
    if (
      !sameStringSet(
        [partnerA.subjectId, partnerB.subjectId],
        [stored.memberAId, stored.memberBId]
      ) ||
      !isSafeIndividualSnapshotForRecommendation({
        snapshot: partnerA,
        pairId: input.pairId,
        factor,
        evidenceEventsById,
        effectiveAt,
      }) ||
      !isSafeIndividualSnapshotForRecommendation({
        snapshot: partnerB,
        pairId: input.pairId,
        factor,
        evidenceEventsById,
        effectiveAt,
      })
    ) {
      continue;
    }
    let componentPairSnapshot: PairFactorSnapshotType | undefined;
    if (stored.pairSnapshotId) {
      const componentPairSnapshotMatches = pairSnapshotsById.get(
        stored.pairSnapshotId
      );
      componentPairSnapshot =
        componentPairSnapshotMatches?.length === 1
          ? componentPairSnapshotMatches[0]
          : undefined;
      if (
        !componentPairSnapshot ||
        !isSafePairSnapshotForRecommendation({
          snapshot: componentPairSnapshot,
          pairId: input.pairId,
          factor,
          evidenceEventsById,
          effectiveAt,
        })
      ) {
        continue;
      }
    }
    if (
      !hasExactComponentVersionUnion({
        evaluation: stored,
        components: componentPairSnapshot
          ? [partnerA, partnerB, componentPairSnapshot]
          : [partnerA, partnerB],
      })
    ) {
      continue;
    }
    latestEvaluations.set(stored.factorKey, {
      snapshotId: stored.snapshotId,
      pairId: stored.pairId,
      memberAId: stored.memberAId,
      memberBId: stored.memberBId,
      factorKey: stored.factorKey,
      context: stored.context,
      strategy: stored.strategy,
      strategyVersion: stored.strategyVersion,
      directionality: stored.directionality,
      revision: stored.revision,
      evaluation: copyPairEvaluation(stored.evaluation),
      individualSnapshotIds: [
        stored.individualSnapshotIds[0],
        stored.individualSnapshotIds[1],
      ],
      pairSnapshotId: stored.pairSnapshotId,
      versions: copySnapshotVersions(stored.versions),
      inputHash: stored.inputHash,
      outputHash: stored.outputHash,
      calculatedAt: new Date(stored.calculatedAt.getTime()),
      effectiveFrom: new Date(stored.effectiveFrom.getTime()),
      effectiveUntil: stored.effectiveUntil
        ? new Date(stored.effectiveUntil.getTime())
        : undefined,
    });
  }
  return {
    pairSnapshots: [...latestPairSnapshots.values()].sort((a, b) =>
      a.factorKey.localeCompare(b.factorKey)
    ),
    pairEvaluations: [...latestEvaluations.values()].sort((a, b) =>
      a.factorKey.localeCompare(b.factorKey)
    ),
  };
};

const fencePairForActivityFactorRead = async (input: {
  pairId: string;
  session: ClientSession;
}): Promise<readonly [string, string]> => {
  const pair = await Pair.findOneAndUpdate(
    {
      _id: input.pairId,
      status: { $in: ['active', 'paused'] },
    },
    { $inc: { lifecycleRevision: 1 } },
    { new: false, session: input.session, timestamps: false }
  )
    .select({ members: 1 })
    .lean<{ members: [string, string] } | null>();
  if (
    !pair ||
    pair.members.length !== 2 ||
    !pair.members[0] ||
    !pair.members[1] ||
    pair.members[0] === pair.members[1]
  ) {
    throw new ActivityFactorRuntimeError('PAIR_NOT_AVAILABLE');
  }
  return pair.members;
};

export async function readActivityRecommendationInputs(
  input: {
    pairId: string;
    effectiveAt?: Date;
    session?: ClientSession;
  },
  hooks: ActivityFactorReadReliabilityTestHooks = {}
): Promise<ActivityRecommendationInputs> {
  const effectiveAt = input.effectiveAt ?? new Date();
  await ensureActivityFactorEngineReady(effectiveAt);
  let hookInvoked = false;
  const execute = async (session: ClientSession) => {
    if (!hookInvoked) {
      hookInvoked = true;
      await hooks.beforeTransactionalPairLifecycleFence?.();
    }
    const memberIds = await fencePairForActivityFactorRead({
      pairId: input.pairId,
      session,
    });
    return readActivityRecommendationInputsInSession({
      pairId: input.pairId,
      memberIds,
      effectiveAt,
      session,
    });
  };

  if (input.session) {
    return execute(input.session);
  }

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(() => execute(session));
    if (!result) {
      throw new ActivityFactorRuntimeError('PAIR_NOT_AVAILABLE');
    }
    return result;
  } finally {
    await session.endSession();
  }
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
      versions: copyEvidenceVersions(stored.versions),
      inputHash: stored.inputHash,
    };
    if (stored.status === 'REJECTED') {
      if (!stored.rejectionCode || stored.normalizedValue != null) {
        throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
      }
      return {
        ...common,
        status: 'REJECTED',
        rejectionCode: stored.rejectionCode,
      };
    }
    if (!stored.normalizedValue || stored.rejectionCode) {
      throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
    }
    const normalizedValue = fromStoredFactorValue(stored.normalizedValue);
    return { ...common, status: 'ACCEPTED', normalizedValue };
  } catch (error) {
    if (error instanceof StoredFactorValueValidationError) {
      throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
    }
    throw error;
  }
};

const canonicalEvidenceFor = async (input: {
  subjectKind: 'INDIVIDUAL' | 'PAIR';
  subjectId: string;
  pairId?: string;
  factor: FactorDefinition;
  projectionPurpose?: Extract<EvidencePurpose, 'OWNER_PROFILE' | 'PAIR_MODEL'>;
  evidenceCutoffAt: Date;
  session?: ClientSession;
}): Promise<readonly DomainEvidenceEvent[]> => {
  const selection = factorEvidenceSelectionWindow(
    input.factor,
    input.evidenceCutoffAt
  );
  const stored = await EvidenceEvent.find({
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    ...(input.pairId
      ? { pairId: input.pairId }
      : { pairId: { $exists: false } }),
    observationScope: input.subjectKind === 'PAIR' ? 'PAIR_DYAD' : 'SELF',
    factorKey: input.factor.key,
    status: 'ACCEPTED',
    ...(input.subjectKind === 'PAIR'
      ? {
          purpose: { $in: ['PAIR_MODEL', 'RECOMMENDATION'] },
          captureMode: { $in: ['PAIR_MODEL_ONLY', 'SHARED'] },
        }
      : input.projectionPurpose === 'OWNER_PROFILE'
        ? {
            purpose: 'OWNER_PROFILE',
            captureMode: { $in: ['PRIVATE', 'SHARED'] },
          }
        : {
            purpose: { $in: ['PAIR_MODEL', 'RECOMMENDATION'] },
            captureMode: { $in: ['PAIR_MODEL_ONLY', 'SHARED'] },
          }),
    'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
    'versions.definitionVersion': input.factor.definitionVersion,
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
    .session(input.session ?? null)
    .lean<EvidenceEventType[]>();

  const chronological = [...stored].reverse();
  if (
    chronological.some(
      (event) => !isCanonicalEvidenceRecord(event, input.factor)
    )
  ) {
    throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
  }
  return chronological.map(toDomainEvidenceEvent);
};

const calculatedAtFor = (referenceAt: Date): Date =>
  new Date(referenceAt.getTime());

const isRetryableMaterializationError = (error: Error): boolean => {
  if (
    error instanceof FactorPersistenceConflictError &&
    error.reasonCode === 'SNAPSHOT_REVISION_CONFLICT'
  ) {
    return true;
  }
  return (error as Error & { code?: number }).code === 11000;
};

const storedIndividualToDomain = (
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
      throw new ActivityFactorRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    const value = fromStoredFactorValue(stored.value);
    const validation = validateFactorValue(factor.valueSchema, value);
    if (!validation.valid) {
      throw new ActivityFactorRuntimeError('STORED_SNAPSHOT_INVALID');
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
      metrics: copyAggregationMetrics(stored.metrics),
      evidenceIds: [...stored.evidenceIds],
      versions: copySnapshotVersions(stored.versions),
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
      throw new ActivityFactorRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    throw error;
  }
};

const materializeIndividual = async (input: {
  subjectId: string;
  pairId?: string;
  factor: FactorDefinition;
  projectionPurpose: Extract<EvidencePurpose, 'OWNER_PROFILE' | 'PAIR_MODEL'>;
  fallbackCalculatedAt: Date;
  events?: readonly DomainEvidenceEvent[];
  session?: ClientSession;
}): Promise<DomainIndividualFactorSnapshot> => {
  const calculatedAt = calculatedAtFor(input.fallbackCalculatedAt);
  const events =
    input.events ??
    (await canonicalEvidenceFor({
      subjectKind: 'INDIVIDUAL',
      subjectId: input.subjectId,
      pairId: input.pairId,
      factor: input.factor,
      projectionPurpose: input.projectionPurpose,
      evidenceCutoffAt: calculatedAt,
      session: input.session,
    }));
  const provisional = buildIndividualFactorSnapshot({
    snapshotId: 'provisional',
    subjectId: input.subjectId,
    contextPairId: input.pairId,
    projectionPurpose: input.projectionPurpose,
    factor: input.factor,
    events,
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt,
  });
  const snapshotId = deterministicId('ifs', [
    input.subjectId,
    input.pairId ?? 'UNSCOPED',
    input.projectionPurpose,
    input.factor.key,
    provisional.inputHash,
  ]);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const existing = await IndividualFactorSnapshot.findOne({
      subjectId: input.subjectId,
      ...(input.pairId
        ? { contextPairId: input.pairId }
        : { contextPairId: { $exists: false } }),
      projectionPurpose: input.projectionPurpose,
      factorKey: input.factor.key,
      inputHash: provisional.inputHash,
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      'versions.snapshotVersion': MVP_FACTOR_REGISTRY.snapshotVersion,
      'versions.displayVersion': MVP_FACTOR_REGISTRY.displayVersion,
    }).session(input.session ?? null);
    if (existing) return storedIndividualToDomain(existing, input.factor);

    const latest = await IndividualFactorSnapshot.findOne({
      subjectId: input.subjectId,
      ...(input.pairId
        ? { contextPairId: input.pairId }
        : { contextPairId: { $exists: false } }),
      projectionPurpose: input.projectionPurpose,
      factorKey: input.factor.key,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .session(input.session ?? null);
    try {
      return await materializeIndividualFactorSnapshot(
        {
          snapshotId,
          subjectId: input.subjectId,
          contextPairId: input.pairId,
          projectionPurpose: input.projectionPurpose,
          factor: input.factor,
          events,
          revision: (latest?.revision ?? -1) + 1,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt,
        },
        MVP_FACTOR_REGISTRY,
        { session: input.session }
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !isRetryableMaterializationError(error) ||
        input.session
      ) {
        throw error;
      }
    }
  }
  throw new ActivityFactorRuntimeError('MATERIALIZATION_RETRY_EXHAUSTED');
};

const storedPairToDomain = (
  stored: PairFactorSnapshotType,
  factor: FactorDefinition
): DomainPairFactorSnapshot => {
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
      throw new ActivityFactorRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    const value = fromStoredFactorValue(stored.value);
    const validation = validateFactorValue(factor.valueSchema, value);
    if (!validation.valid) {
      throw new ActivityFactorRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    return {
      snapshotId: stored.snapshotId,
      pairId: stored.pairId,
      factorKey: stored.factorKey,
      revision: stored.revision,
      status: stored.status,
      value: validation.value,
      metrics: copyAggregationMetrics(stored.metrics),
      evidenceIds: [...stored.evidenceIds],
      versions: copySnapshotVersions(stored.versions),
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
      throw new ActivityFactorRuntimeError('STORED_SNAPSHOT_INVALID');
    }
    throw error;
  }
};

const materializePair = async (input: {
  pairId: string;
  factor: FactorDefinition;
  fallbackCalculatedAt: Date;
  events?: readonly DomainEvidenceEvent[];
  session?: ClientSession;
}): Promise<DomainPairFactorSnapshot> => {
  const calculatedAt = calculatedAtFor(input.fallbackCalculatedAt);
  const events =
    input.events ??
    (await canonicalEvidenceFor({
      subjectKind: 'PAIR',
      subjectId: input.pairId,
      pairId: input.pairId,
      factor: input.factor,
      evidenceCutoffAt: calculatedAt,
      session: input.session,
    }));
  const provisional = buildPairFactorSnapshot({
    snapshotId: 'provisional',
    pairId: input.pairId,
    factor: input.factor,
    events,
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt,
  });
  const snapshotId = deterministicId('pfs', [
    input.pairId,
    input.factor.key,
    provisional.inputHash,
  ]);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const existing = await PairFactorSnapshot.findOne({
      pairId: input.pairId,
      factorKey: input.factor.key,
      inputHash: provisional.inputHash,
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      'versions.snapshotVersion': MVP_FACTOR_REGISTRY.snapshotVersion,
      'versions.displayVersion': MVP_FACTOR_REGISTRY.displayVersion,
    }).session(input.session ?? null);
    if (existing) return storedPairToDomain(existing, input.factor);

    const latest = await PairFactorSnapshot.findOne({
      pairId: input.pairId,
      factorKey: input.factor.key,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .session(input.session ?? null);
    try {
      return await materializePairFactorSnapshot(
        {
          snapshotId,
          pairId: input.pairId,
          factor: input.factor,
          events,
          revision: (latest?.revision ?? -1) + 1,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt,
        },
        MVP_FACTOR_REGISTRY,
        { session: input.session }
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !isRetryableMaterializationError(error) ||
        input.session
      ) {
        throw error;
      }
    }
  }
  throw new ActivityFactorRuntimeError('MATERIALIZATION_RETRY_EXHAUSTED');
};

const materializeEvaluation = async (input: {
  pairId: string;
  factor: FactorDefinition;
  partnerA: DomainIndividualFactorSnapshot;
  partnerB: DomainIndividualFactorSnapshot;
  pairSnapshot?: DomainPairFactorSnapshot;
  calculatedAt: Date;
  session?: ClientSession;
}): Promise<string> => {
  const strategy = input.factor.pairStrategies.find(
    (candidate) => candidate.context === 'COMMITTED_RELATIONSHIP'
  );
  if (!strategy) {
    throw new ActivityFactorRuntimeError('CANONICAL_STRATEGY_MISSING');
  }
  const provisional = buildPairFactorEvaluationSnapshot({
    snapshotId: 'provisional',
    pairId: input.pairId,
    factor: input.factor,
    strategy,
    relationshipContext: 'COMMITTED_RELATIONSHIP',
    partnerA: input.partnerA,
    partnerB: input.partnerB,
    pairSnapshot: input.pairSnapshot,
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt: input.calculatedAt,
  });
  const snapshotId = deterministicId('pfes', [
    input.pairId,
    input.factor.key,
    provisional.inputHash,
  ]);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const existing = await PairFactorEvaluationSnapshot.findOne({
      pairId: input.pairId,
      factorKey: input.factor.key,
      context: 'COMMITTED_RELATIONSHIP',
      strategy: strategy.config.type,
      strategyVersion: strategy.strategyVersion,
      directionality: strategy.directionality,
      inputHash: provisional.inputHash,
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      'versions.snapshotVersion': MVP_FACTOR_REGISTRY.snapshotVersion,
      'versions.displayVersion': MVP_FACTOR_REGISTRY.displayVersion,
    }).session(input.session ?? null);
    if (existing) return existing.snapshotId;

    const latest = await PairFactorEvaluationSnapshot.findOne({
      pairId: input.pairId,
      factorKey: input.factor.key,
      context: 'COMMITTED_RELATIONSHIP',
      strategy: strategy.config.type,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .session(input.session ?? null);
    try {
      const snapshot = await materializePairFactorEvaluationSnapshot(
        {
          snapshotId,
          pairId: input.pairId,
          factor: input.factor,
          strategy,
          relationshipContext: 'COMMITTED_RELATIONSHIP',
          partnerA: input.partnerA,
          partnerB: input.partnerB,
          pairSnapshot: input.pairSnapshot,
          revision: (latest?.revision ?? -1) + 1,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt: input.calculatedAt,
        },
        MVP_FACTOR_REGISTRY,
        { session: input.session }
      );
      return snapshot.snapshotId;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !isRetryableMaterializationError(error) ||
        input.session
      ) {
        throw error;
      }
    }
  }
  throw new ActivityFactorRuntimeError('MATERIALIZATION_RETRY_EXHAUSTED');
};

export async function materializeCurrentOwnerFactorSnapshots(input: {
  subjectId: string;
  pairId?: string;
  factorKeys?: readonly string[];
  calculatedAt?: Date;
  session?: ClientSession;
}): Promise<readonly DomainIndividualFactorSnapshot[]> {
  await ensureActivityFactorEngineReady(input.calculatedAt);
  const calculatedAt = input.calculatedAt ?? new Date();
  const requestedFactorKeys = input.factorKeys
    ? new Set(input.factorKeys)
    : undefined;
  const factors = MVP_FACTOR_REGISTRY.factors.filter(
    (factor) =>
      factor.freshnessPolicy.type === 'DECAY' &&
      (!requestedFactorKeys || requestedFactorKeys.has(factor.key))
  );
  const snapshots: DomainIndividualFactorSnapshot[] = [];
  for (const factor of factors) {
    const events = await canonicalEvidenceFor({
      subjectKind: 'INDIVIDUAL',
      subjectId: input.subjectId,
      pairId: input.pairId,
      factor,
      projectionPurpose: 'OWNER_PROFILE',
      evidenceCutoffAt: calculatedAt,
      session: input.session,
    });
    if (events.length === 0) continue;
    snapshots.push(
      await materializeIndividual({
        subjectId: input.subjectId,
        pairId: input.pairId,
        factor,
        projectionPurpose: 'OWNER_PROFILE',
        fallbackCalculatedAt: calculatedAt,
        events,
        session: input.session,
      })
    );
  }
  return snapshots;
}

async function materializeCurrentPairFactorSnapshots(input: {
  pairId: string;
  memberIds: readonly [string, string];
  calculatedAt: Date;
  session: ClientSession;
}): Promise<void> {
  const calculatedAt = input.calculatedAt;
  assertPairMembers(input.memberIds);

  for (const factorKey of NON_WEEKLY_ACTIVITY_FACTOR_KEYS) {
    const factor = MVP_FACTOR_REGISTRY.factors.find(
      (candidate) => candidate.key === factorKey
    );
    if (!factor) {
      throw new ActivityFactorRuntimeError('CANONICAL_DEFINITION_MISSING');
    }
    const partnerAEvents = await canonicalEvidenceFor({
      subjectKind: 'INDIVIDUAL',
      subjectId: input.memberIds[0],
      pairId: input.pairId,
      factor,
      projectionPurpose: 'PAIR_MODEL',
      evidenceCutoffAt: calculatedAt,
      session: input.session,
    });
    const partnerBEvents = await canonicalEvidenceFor({
      subjectKind: 'INDIVIDUAL',
      subjectId: input.memberIds[1],
      pairId: input.pairId,
      factor,
      projectionPurpose: 'PAIR_MODEL',
      evidenceCutoffAt: calculatedAt,
      session: input.session,
    });
    const pairEvents = await canonicalEvidenceFor({
      subjectKind: 'PAIR',
      subjectId: input.pairId,
      pairId: input.pairId,
      factor,
      evidenceCutoffAt: calculatedAt,
      session: input.session,
    });
    if (
      partnerAEvents.length === 0 &&
      partnerBEvents.length === 0 &&
      pairEvents.length === 0
    ) {
      continue;
    }

    const partnerA =
      partnerAEvents.length > 0
        ? await materializeIndividual({
            subjectId: input.memberIds[0],
            pairId: input.pairId,
            factor,
            projectionPurpose: 'PAIR_MODEL',
            fallbackCalculatedAt: calculatedAt,
            events: partnerAEvents,
            session: input.session,
          })
        : undefined;
    const partnerB =
      partnerBEvents.length > 0
        ? await materializeIndividual({
            subjectId: input.memberIds[1],
            pairId: input.pairId,
            factor,
            projectionPurpose: 'PAIR_MODEL',
            fallbackCalculatedAt: calculatedAt,
            events: partnerBEvents,
            session: input.session,
          })
        : undefined;
    const pairSnapshot =
      pairEvents.length > 0
        ? await materializePair({
            pairId: input.pairId,
            factor,
            fallbackCalculatedAt: calculatedAt,
            events: pairEvents,
            session: input.session,
          })
        : undefined;
    if (
      partnerA &&
      partnerB &&
      factor.pairStrategies.some(
        (strategy) => strategy.context === 'COMMITTED_RELATIONSHIP'
      )
    ) {
      await materializeEvaluation({
        pairId: input.pairId,
        factor,
        partnerA,
        partnerB,
        pairSnapshot,
        calculatedAt,
        session: input.session,
      });
    }
  }
}

const feedbackFingerprint = (answers: readonly Answer[], role: 'A' | 'B'): string =>
  createHash('sha256')
    .update(
      answers
        .filter((answer) => answer.by === role)
        .map((answer) => `${answer.checkInId}:${answer.ui}`)
        .sort()
        .join('|')
    )
    .digest('hex');

export async function recordActivityCheckInFactorEvidence(
  input: RecordActivityCheckInFactorEvidenceInput
): Promise<ActivityFactorEvidenceProvenance> {
  assertPairMembers(input.memberIds, input.actorId);
  const { factors } = resolveActivityFactorBinding(input);
  const metrics = activityRoleEvidenceMetrics({
    checkIns: [...input.checkIns],
    answers: [...input.answers],
    role: input.role,
  });
  if (!metrics) {
    throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
  }
  const instrument = activityInstrument();
  const recordedAt = input.recordedAt ?? input.observedAt;
  const fingerprint = feedbackFingerprint(input.answers, input.role);
  const latestAnswer = [...input.answers]
    .filter((answer) => answer.by === input.role)
    .sort((left, right) => right.feedbackRevision - left.feedbackRevision)[0];
  if (!latestAnswer) {
    throw new ActivityFactorRuntimeError('STORED_EVIDENCE_INVALID');
  }
  const projectionPurpose =
    latestAnswer.captureMode === 'PAIR_MODEL_ONLY'
      ? ('PAIR_MODEL' as const)
      : ('OWNER_PROFILE' as const);
  const events = factors.map((factor) => {
    const binding = bindingFor(factor.key);
    const measurement = measurementFor(binding.taskResultMeasurementKey);
    const identity = [
      MVP_FACTOR_REGISTRY.registryKey,
      String(MVP_FACTOR_REGISTRY.registryVersion),
      input.pairId,
      input.activityId,
      input.actorId,
      input.role,
      factor.key,
      fingerprint,
      String(latestAnswer.feedbackRevision),
      latestAnswer.captureMode,
    ];
    return createEvidenceEvent(
      {
        eventId: deterministicId('fev', identity),
        idempotencyKey: deterministicId('activity-feedback', identity),
        actorId: input.actorId,
        subjectKind: 'INDIVIDUAL',
        subjectId: input.actorId,
        pairId: input.pairId,
        observationScope: 'SELF',
        factorKey: factor.key,
        measurementKey: measurement.key,
        instrumentKey: instrument.key,
        sourceType: 'TASK_RESULT',
        sourceRef: `pair-activity:${input.activityId}:feedback:${input.role}`,
        sourceRevision: `feedback:${input.role}:r${latestAnswer.feedbackRevision}`,
        submittedValue: factorValueForScore(
          factor,
          individualScoreForFactor(factor.key as ActivityFactorKey, metrics)
        ),
        reliabilityMultiplier: metrics.participation === 0 ? 0.5 : 1,
        observedAt: input.observedAt,
        recordedAt,
        context: 'COMMITTED_RELATIONSHIP',
        purpose: projectionPurpose,
        privacyClass: factor.privacyClass,
        captureMode: latestAnswer.captureMode,
        policyVersion: latestAnswer.policyVersion || ACTIVITY_FEEDBACK_POLICY_VERSION,
        consentRevision: latestAnswer.consentRevision,
        retentionClass:
          latestAnswer.captureMode === 'PAIR_MODEL_ONLY'
            ? 'PAIR_CONTEXT'
            : 'OWNER_CONTROLLED',
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      },
      factor,
      measurement,
      instrument
    );
  });
  assertAcceptedEvidence(events);
  for (const event of events) {
    await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY, {
      session: input.session,
    });
  }

  const snapshots = [] as DomainIndividualFactorSnapshot[];
  for (const factor of factors) {
    snapshots.push(
      await materializeIndividual({
        subjectId: input.actorId,
        pairId: input.pairId,
        factor,
        projectionPurpose,
        fallbackCalculatedAt: recordedAt,
        session: input.session,
      })
    );
  }
  return {
    taskResultEventIds: events.map((event) => event.eventId),
    pairActivityEventIds: [],
    individualSnapshotIds: snapshots.map((snapshot) => snapshot.snapshotId),
    pairSnapshotIds: [],
    pairEvaluationSnapshotIds: [],
    recordedAt,
  };
}

export async function recordActivityCompletionFactorEvidence(
  input: RecordActivityCompletionFactorEvidenceInput
): Promise<ActivityFactorEvidenceProvenance> {
  assertPairMembers(input.memberIds, input.actorId);
  const { factors } = resolveActivityFactorBinding(input);
  const instrument = activityInstrument();
  const recordedAt = input.recordedAt ?? input.observedAt;
  const completionFingerprint = createHash('sha256')
    .update(
      [
        input.result.resultVersion,
        input.result.status,
        input.result.successScore,
        input.result.submittedBy.join(','),
        input.result.subjectiveChangeAvg ?? '',
        input.result.usefulnessAvg ?? '',
      ].join('|')
    )
    .digest('hex');
  const latestAnswerByRole = (['A', 'B'] as const).map((role) =>
    [...input.answers]
      .filter((answer) => answer.by === role)
      .sort((left, right) => right.feedbackRevision - left.feedbackRevision)[0]
  );
  const pairModelFeedbackAllowed = latestAnswerByRole.every(
    (answer) => answer?.captureMode === 'PAIR_MODEL_ONLY'
  );
  const pairConsentRevision = pairModelFeedbackAllowed
    ? latestAnswerByRole
        .map(
          (answer, index) =>
            `${index === 0 ? 'A' : 'B'}:${answer?.consentRevision ?? 'missing'}:r${answer?.feedbackRevision ?? 0}`
        )
        .join('|')
    : 'activity-completion-shared-v1';

  const events = factors.map((factor) => {
    const binding = bindingFor(factor.key);
    const measurement = measurementFor(binding.pairActivityMeasurementKey);
    const identity = [
      MVP_FACTOR_REGISTRY.registryKey,
      String(MVP_FACTOR_REGISTRY.registryVersion),
      input.pairId,
      input.activityId,
      factor.key,
      completionFingerprint,
    ];
    return createEvidenceEvent(
      {
        eventId: deterministicId('fev', identity),
        idempotencyKey: deterministicId('activity-completion', identity),
        actorId: input.actorId,
        subjectKind: 'PAIR',
        subjectId: input.pairId,
        pairId: input.pairId,
        observationScope: 'PAIR_DYAD',
        factorKey: factor.key,
        measurementKey: measurement.key,
        instrumentKey: instrument.key,
        sourceType: 'PAIR_ACTIVITY',
        sourceRef: `pair-activity:${input.activityId}:completion`,
        sourceRevision: `${input.result.resultVersion}:${input.result.status}:${completionFingerprint}`,
        submittedValue: pairModelFeedbackAllowed
          ? factorValueForScore(
              factor,
              pairScoreForFactor(factor.key as ActivityFactorKey, input.result)
            )
          : { kind: 'UNKNOWN', reasonCode: 'UNRESOLVED' },
        reliabilityMultiplier: input.result.bothSubmitted ? 1 : 0.55,
        observedAt: input.observedAt,
        recordedAt,
        context: 'COMMITTED_RELATIONSHIP',
        purpose: 'PAIR_MODEL',
        privacyClass: factor.privacyClass,
        captureMode: pairModelFeedbackAllowed ? 'PAIR_MODEL_ONLY' : 'SHARED',
        policyVersion: 'activity-completion-policy-v1',
        consentRevision: pairConsentRevision,
        retentionClass: 'PAIR_CONTEXT',
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      },
      factor,
      measurement,
      instrument
    );
  });
  assertAcceptedEvidence(events);
  for (const event of events) {
    await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY, {
      session: input.session,
    });
  }

  const individualSnapshots: DomainIndividualFactorSnapshot[] = [];
  const pairSnapshots: DomainPairFactorSnapshot[] = [];
  const evaluationSnapshotIds: string[] = [];
  for (const factor of factors) {
    const partnerA = await materializeIndividual({
      subjectId: input.memberIds[0],
      pairId: input.pairId,
      factor,
      projectionPurpose: 'PAIR_MODEL',
      fallbackCalculatedAt: recordedAt,
      session: input.session,
    });
    const partnerB = await materializeIndividual({
      subjectId: input.memberIds[1],
      pairId: input.pairId,
      factor,
      projectionPurpose: 'PAIR_MODEL',
      fallbackCalculatedAt: recordedAt,
      session: input.session,
    });
    const pairSnapshot = await materializePair({
      pairId: input.pairId,
      factor,
      fallbackCalculatedAt: recordedAt,
      session: input.session,
    });
    individualSnapshots.push(partnerA, partnerB);
    pairSnapshots.push(pairSnapshot);
    evaluationSnapshotIds.push(
      await materializeEvaluation({
        pairId: input.pairId,
        factor,
        partnerA,
        partnerB,
        pairSnapshot,
        calculatedAt: recordedAt,
        session: input.session,
      })
    );
  }

  return {
    taskResultEventIds: [],
    pairActivityEventIds: events.map((event) => event.eventId),
    individualSnapshotIds: sortedUnique(
      individualSnapshots.map((snapshot) => snapshot.snapshotId)
    ),
    pairSnapshotIds: pairSnapshots.map((snapshot) => snapshot.snapshotId),
    pairEvaluationSnapshotIds: evaluationSnapshotIds,
    recordedAt,
  };
}
