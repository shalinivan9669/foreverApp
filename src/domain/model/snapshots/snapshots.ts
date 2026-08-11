import { createHash } from 'node:crypto';
import {
  aggregateFactorEvidence,
  type FactorAggregationMetrics,
  type FactorAggregationStatus,
} from '@/domain/model/aggregation/factorAggregation';
import type {
  FactorDefinition,
  FactorRegistryRelease,
} from '@/domain/model/definitions/definitionTypes';
import type {
  AcceptedEvidenceEvent,
  EvidenceEvent,
  EvidencePurpose,
} from '@/domain/model/evidence/evidence';
import { evaluatePairStrategy } from '@/domain/model/pair/strategies';
import type {
  DirectionalExpectation,
  PairStrategyDefinition,
  PairStrategyEvaluation,
  RoleCoverageContext,
} from '@/domain/model/pair/strategyTypes';
import type { FactorValue } from '@/domain/model/values/factorValue';

export type SnapshotVersionReference = {
  key: string;
  version: number;
};

export type SnapshotVersions = {
  registryVersion: number;
  definitionVersion: number;
  algorithmVersion: number;
  snapshotVersion: number;
  displayVersion: number;
  measurementRefs: readonly SnapshotVersionReference[];
  instrumentRefs: readonly SnapshotVersionReference[];
};

export type IndividualFactorSnapshot = {
  snapshotId: string;
  subjectId: string;
  contextPairId?: string;
  projectionPurpose: EvidencePurpose;
  factorKey: string;
  revision: number;
  status: FactorAggregationStatus;
  value: FactorValue;
  metrics: FactorAggregationMetrics;
  evidenceIds: readonly string[];
  versions: SnapshotVersions;
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
};

export type PairFactorSnapshot = {
  snapshotId: string;
  pairId: string;
  factorKey: string;
  revision: number;
  status: FactorAggregationStatus;
  value: FactorValue;
  metrics: FactorAggregationMetrics;
  evidenceIds: readonly string[];
  versions: SnapshotVersions;
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
};

export type PairFactorEvaluationSnapshot = {
  snapshotId: string;
  pairId: string;
  memberAId: string;
  memberBId: string;
  factorKey: string;
  context: PairStrategyDefinition['context'];
  strategy: PairStrategyDefinition['config']['type'];
  strategyVersion: number;
  directionality: PairStrategyDefinition['directionality'];
  revision: number;
  evaluation: PairStrategyEvaluation;
  individualSnapshotIds: readonly [string, string];
  pairSnapshotId?: string;
  versions: SnapshotVersions;
  inputHash: string;
  outputHash: string;
  calculatedAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
};

export class FactorEngineVersionError extends Error {
  readonly reasonCode:
    | 'REGISTRY_VERSION_MISMATCH'
    | 'DEFINITION_VERSION_MISMATCH'
    | 'ALGORITHM_VERSION_MISMATCH'
    | 'SNAPSHOT_VERSION_MISMATCH'
    | 'DISPLAY_VERSION_MISMATCH'
    | 'SNAPSHOT_VERSION_REFS_INVALID'
    | 'SNAPSHOT_NOT_EFFECTIVE'
    | 'SNAPSHOT_CONTEXT_MISMATCH'
    | 'SNAPSHOT_FACTOR_MISMATCH'
    | 'SNAPSHOT_MEMBER_MISMATCH'
    | 'SNAPSHOT_PURPOSE_MISMATCH';

  constructor(reasonCode: FactorEngineVersionError['reasonCode']) {
    super(reasonCode);
    this.name = 'FactorEngineVersionError';
    this.reasonCode = reasonCode;
  }
}

type SnapshotBuildVersions = {
  registryVersion: number;
  algorithmVersion: number;
  snapshotVersion: number;
  displayVersion: number;
};

export const FACTOR_SNAPSHOT_TIME_WINDOW_MS = 24 * 60 * 60 * 1000;

export const canonicalSnapshotCalculatedAt = (calculatedAt: Date): Date => {
  const timestamp = calculatedAt.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new RangeError('SNAPSHOT_CALCULATION_TIME_INVALID');
  }
  return new Date(
    Math.floor(timestamp / FACTOR_SNAPSHOT_TIME_WINDOW_MS) *
      FACTOR_SNAPSHOT_TIME_WINDOW_MS
  );
};

export type BuildIndividualFactorSnapshotInput = SnapshotBuildVersions & {
  snapshotId: string;
  subjectId: string;
  contextPairId?: string;
  projectionPurpose: EvidencePurpose;
  factor: FactorDefinition;
  events: readonly EvidenceEvent[];
  revision: number;
  calculatedAt: Date;
};

export type BuildPairFactorSnapshotInput = SnapshotBuildVersions & {
  snapshotId: string;
  pairId: string;
  factor: FactorDefinition;
  events: readonly EvidenceEvent[];
  revision: number;
  calculatedAt: Date;
};

export type BuildPairFactorEvaluationSnapshotInput = SnapshotBuildVersions & {
  snapshotId: string;
  pairId: string;
  factor: FactorDefinition;
  strategy: PairStrategyDefinition;
  relationshipContext: PairStrategyDefinition['context'];
  partnerA: IndividualFactorSnapshot;
  partnerB: IndividualFactorSnapshot;
  pairSnapshot?: PairFactorSnapshot;
  directional?: {
    desiredByA: DirectionalExpectation;
    desiredByB: DirectionalExpectation;
  };
  roleCoverage?: RoleCoverageContext;
  revision: number;
  calculatedAt: Date;
};

const hash = (parts: readonly string[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex');

const versionReferenceKey = (reference: SnapshotVersionReference): string =>
  `${reference.key}:${reference.version}`;

const canonicalVersionReferences = (
  references: readonly SnapshotVersionReference[]
): readonly SnapshotVersionReference[] => {
  const unique = new Map<string, SnapshotVersionReference>();
  for (const reference of references) {
    if (
      !reference.key.trim() ||
      !Number.isInteger(reference.version) ||
      reference.version < 1
    ) {
      throw new FactorEngineVersionError('SNAPSHOT_VERSION_REFS_INVALID');
    }
    unique.set(versionReferenceKey(reference), {
      key: reference.key,
      version: reference.version,
    });
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.key.localeCompare(right.key) || left.version - right.version
  );
};

const evidenceVersionReferences = (
  events: readonly EvidenceEvent[]
): Pick<SnapshotVersions, 'measurementRefs' | 'instrumentRefs'> => {
  const accepted = events.filter(
    (event): event is AcceptedEvidenceEvent => event.status === 'ACCEPTED'
  );
  return {
    measurementRefs: canonicalVersionReferences(
      accepted.map((event) => ({
        key: event.measurementKey,
        version: event.versions.measurementVersion,
      }))
    ),
    instrumentRefs: canonicalVersionReferences(
      accepted.map((event) => ({
        key: event.instrumentKey,
        version: event.versions.instrumentVersion,
      }))
    ),
  };
};

const unionVersionReferences = (
  snapshots: readonly (
    | IndividualFactorSnapshot
    | PairFactorSnapshot
  )[]
): Pick<SnapshotVersions, 'measurementRefs' | 'instrumentRefs'> => ({
  measurementRefs: canonicalVersionReferences(
    snapshots.flatMap((snapshot) => snapshot.versions.measurementRefs)
  ),
  instrumentRefs: canonicalVersionReferences(
    snapshots.flatMap((snapshot) => snapshot.versions.instrumentRefs)
  ),
});

const encodeVersionReferences = (
  references: readonly SnapshotVersionReference[]
): string => references.map(versionReferenceKey).join(',');

const encodeSnapshotVersions = (versions: SnapshotVersions): string =>
  [
    versions.registryVersion,
    versions.definitionVersion,
    versions.algorithmVersion,
    versions.snapshotVersion,
    versions.displayVersion,
    `MEASUREMENTS:${encodeVersionReferences(versions.measurementRefs)}`,
    `INSTRUMENTS:${encodeVersionReferences(versions.instrumentRefs)}`,
  ].join(':');

const assertCanonicalVersionReferences = (
  references: readonly SnapshotVersionReference[]
): void => {
  const canonical = canonicalVersionReferences(references);
  if (
    canonical.length !== references.length ||
    canonical.some(
      (reference, index) =>
        reference.key !== references[index]?.key ||
        reference.version !== references[index]?.version
    )
  ) {
    throw new FactorEngineVersionError('SNAPSHOT_VERSION_REFS_INVALID');
  }
};

const effectiveUntilForEvidence = (
  factor: FactorDefinition,
  events: readonly EvidenceEvent[],
  effectiveFrom: Date,
  status: FactorAggregationStatus,
  evidenceIds: readonly string[]
): Date | undefined => {
  if (factor.freshnessPolicy.type === 'NON_EXPIRING') return undefined;
  const nextCalculationWindow =
    effectiveFrom.getTime() + FACTOR_SNAPSHOT_TIME_WINDOW_MS;
  if (status !== 'AVAILABLE') return new Date(nextCalculationWindow);
  const contributingEvidenceIds = new Set(evidenceIds);
  const accepted = events.filter(
    (event): event is AcceptedEvidenceEvent =>
      event.status === 'ACCEPTED' &&
      contributingEvidenceIds.has(event.eventId)
  );
  if (accepted.length === 0) {
    throw new RangeError('AVAILABLE_SNAPSHOT_WITHOUT_ACCEPTED_EVIDENCE');
  }
  const newestObservedAt = Math.max(
    ...accepted.map((event) => event.observedAt.getTime())
  );
  if (!Number.isFinite(newestObservedAt)) {
    throw new RangeError('SNAPSHOT_EVIDENCE_TIME_INVALID');
  }
  const expiresAt =
    newestObservedAt +
    factor.freshnessPolicy.expiresAfterDays * FACTOR_SNAPSHOT_TIME_WINDOW_MS;
  if (!Number.isFinite(expiresAt)) {
    throw new RangeError('SNAPSHOT_EFFECTIVE_UNTIL_INVALID');
  }
  const effectiveUntil = Math.min(nextCalculationWindow, expiresAt);
  if (!(effectiveUntil > effectiveFrom.getTime())) {
    throw new RangeError('AVAILABLE_SNAPSHOT_EFFECTIVE_INTERVAL_INVALID');
  }
  return new Date(effectiveUntil);
};

const minimumEffectiveUntil = (
  snapshots: readonly (
    | IndividualFactorSnapshot
    | PairFactorSnapshot
  )[],
  effectiveFrom: Date
): Date | undefined => {
  const upperBounds = snapshots.flatMap((snapshot) =>
    snapshot.effectiveUntil ? [snapshot.effectiveUntil.getTime()] : []
  );
  if (upperBounds.length === 0) return undefined;
  return new Date(Math.max(effectiveFrom.getTime(), Math.min(...upperBounds)));
};

export const isSnapshotEffectiveAt = (
  snapshot: Pick<
    IndividualFactorSnapshot | PairFactorSnapshot | PairFactorEvaluationSnapshot,
    'effectiveFrom' | 'effectiveUntil'
  >,
  at: Date
): boolean => {
  if (
    !(snapshot.effectiveFrom instanceof Date) ||
    (snapshot.effectiveUntil !== undefined &&
      !(snapshot.effectiveUntil instanceof Date)) ||
    !(at instanceof Date)
  ) {
    return false;
  }
  const timestamp = at.getTime();
  return (
    Number.isFinite(timestamp) &&
    snapshot.effectiveFrom.getTime() <= timestamp &&
    (!snapshot.effectiveUntil || snapshot.effectiveUntil.getTime() > timestamp)
  );
};

export const snapshotVersionsMatchRegistry = (
  versions: SnapshotVersions,
  factor: FactorDefinition,
  release: FactorRegistryRelease
): boolean => {
  if (
    !Array.isArray(versions.measurementRefs) ||
    !Array.isArray(versions.instrumentRefs)
  ) {
    return false;
  }
  try {
    assertCanonicalVersionReferences(versions.measurementRefs);
    assertCanonicalVersionReferences(versions.instrumentRefs);
  } catch (error) {
    if (error instanceof FactorEngineVersionError) return false;
    throw error;
  }
  if (
    versions.registryVersion !== release.registryVersion ||
    versions.definitionVersion !== factor.definitionVersion ||
    versions.algorithmVersion !== release.algorithmVersion ||
    versions.snapshotVersion !== release.snapshotVersion ||
    versions.displayVersion !== release.displayVersion
  ) {
    return false;
  }
  const measurementsValid = versions.measurementRefs.every((reference) =>
    release.measurements.some(
      (measurement) =>
        measurement.key === reference.key &&
        measurement.factorKey === factor.key &&
        measurement.measurementVersion === reference.version
    )
  );
  if (!measurementsValid) return false;
  const referencedInstruments = versions.instrumentRefs.map((reference) =>
    release.instruments.find(
      (candidate) =>
        candidate.key === reference.key &&
        candidate.instrumentVersion === reference.version
    )
  );
  if (referencedInstruments.some((instrument) => !instrument)) return false;
  if (
    (versions.measurementRefs.length === 0) !==
    (versions.instrumentRefs.length === 0)
  ) {
    return false;
  }
  const instrumentsCoverMeasurements = versions.measurementRefs.every(
    (measurement) =>
      referencedInstruments.some((instrument) =>
        instrument?.measurementKeys.includes(measurement.key)
      )
  );
  const measurementsCoverInstruments = referencedInstruments.every(
    (instrument) =>
      instrument !== undefined &&
      versions.measurementRefs.some((measurement) =>
        instrument.measurementKeys.includes(measurement.key)
      )
  );
  return instrumentsCoverMeasurements && measurementsCoverInstruments;
};

const encodeValue = (value: FactorValue): string => {
  switch (value.kind) {
    case 'SCALAR':
      return `SCALAR:${value.value}`;
    case 'BOOLEAN':
      return `BOOLEAN:${value.value ? 1 : 0}`;
    case 'CATEGORY':
      return `CATEGORY:${value.value}`;
    case 'ORDINAL':
      return `ORDINAL:${value.rank}:${value.value}`;
    case 'CONSTRAINT':
      return `CONSTRAINT:${value.value}`;
    case 'RANGE':
      return `RANGE:${value.low}:${value.high}`;
    case 'MASTERY':
      return `MASTERY:${value.score01}:${value.level}`;
    case 'SET':
      return `SET:${[...value.values].sort().join(',')}`;
    case 'TEXT':
      return `TEXT:${value.value}`;
    case 'MISSING':
    case 'INVALID':
    case 'UNKNOWN':
    case 'INSUFFICIENT_DATA':
      return `${value.kind}:${value.reasonCode}`;
  }
};

const encodeMetrics = (metrics: FactorAggregationMetrics): string =>
  [
    metrics.confidence,
    metrics.coverage,
    metrics.freshness,
    metrics.consistency,
    metrics.evidenceCount,
  ].join(':');

const encodeDirectionalContext = (
  directional: BuildPairFactorEvaluationSnapshotInput['directional']
): string =>
  directional
    ? `DIRECTIONAL:${JSON.stringify([
        [directional.desiredByA.minimum, directional.desiredByA.maximum],
        [directional.desiredByB.minimum, directional.desiredByB.maximum],
      ])}`
    : 'DIRECTIONAL:NONE';

const encodeRoleCoverageContext = (
  roleCoverage: RoleCoverageContext | undefined
): string => {
  if (!roleCoverage) return 'ROLE_COVERAGE:NONE';
  const encodePartner = (
    contributions: RoleCoverageContext['partnerA']
  ): string =>
    JSON.stringify(
      contributions
        .map(
          (contribution) =>
            [
              contribution.roleKey,
              contribution.preference01,
              contribution.capability01,
              contribution.load01,
            ] as const
        )
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right))
        )
    );
  return `ROLE_COVERAGE:${JSON.stringify([
    encodePartner(roleCoverage.partnerA),
    encodePartner(roleCoverage.partnerB),
    roleCoverage.fairnessConfidence,
  ])}`;
};

const encodeDirectionalFit = (
  directionalFit: PairStrategyEvaluation['directionalFit']
): string =>
  directionalFit
    ? `DIRECTIONAL_FIT:${JSON.stringify([
        directionalFit.aAcceptsB,
        directionalFit.bAcceptsA,
      ])}`
    : 'DIRECTIONAL_FIT:NONE';

const encodeRoleMetrics = (
  roleMetrics: PairStrategyEvaluation['roleMetrics']
): string =>
  roleMetrics
    ? `ROLE_METRICS:${JSON.stringify([
        roleMetrics.coverage,
        roleMetrics.loadImbalance,
        roleMetrics.preferenceSatisfaction,
      ])}`
    : 'ROLE_METRICS:NONE';

const assertEvidenceVersions = (
  events: readonly EvidenceEvent[],
  factor: FactorDefinition,
  versions: SnapshotBuildVersions
): void => {
  for (const event of events) {
    if (event.versions.registryVersion !== versions.registryVersion) {
      throw new FactorEngineVersionError('REGISTRY_VERSION_MISMATCH');
    }
    if (event.versions.definitionVersion !== factor.definitionVersion) {
      throw new FactorEngineVersionError('DEFINITION_VERSION_MISMATCH');
    }
    if (event.versions.algorithmVersion !== versions.algorithmVersion) {
      throw new FactorEngineVersionError('ALGORITHM_VERSION_MISMATCH');
    }
  }
};

const versionsFor = (
  factor: FactorDefinition,
  versions: SnapshotBuildVersions,
  references: Pick<SnapshotVersions, 'measurementRefs' | 'instrumentRefs'>
): SnapshotVersions => ({
  registryVersion: versions.registryVersion,
  definitionVersion: factor.definitionVersion,
  algorithmVersion: versions.algorithmVersion,
  snapshotVersion: versions.snapshotVersion,
  displayVersion: versions.displayVersion,
  measurementRefs: canonicalVersionReferences(references.measurementRefs),
  instrumentRefs: canonicalVersionReferences(references.instrumentRefs),
});

export function buildIndividualFactorSnapshot(
  input: BuildIndividualFactorSnapshotInput
): IndividualFactorSnapshot {
  const calculatedAt = canonicalSnapshotCalculatedAt(input.calculatedAt);
  const evidenceCutoffTimestamp = input.calculatedAt.getTime();
  const isolatedEvents = input.events.filter(
    (event) =>
      event.subjectKind === 'INDIVIDUAL' &&
      event.subjectId === input.subjectId &&
      (input.contextPairId
        ? event.pairId === input.contextPairId
        : event.pairId === undefined) &&
      event.observationScope === 'SELF' &&
      event.factorKey === input.factor.key &&
      event.status === 'ACCEPTED' &&
      event.purpose === input.projectionPurpose &&
      (input.projectionPurpose === 'OWNER_PROFILE'
        ? event.captureMode === 'PRIVATE' || event.captureMode === 'SHARED'
        : input.projectionPurpose === 'PAIR_MODEL' ||
            input.projectionPurpose === 'RECOMMENDATION'
          ? event.captureMode === 'PAIR_MODEL_ONLY' ||
            event.captureMode === 'SHARED'
          : input.projectionPurpose === 'SAFETY'
            ? event.captureMode === 'SYSTEM_ONLY'
            : event.captureMode !== 'PRIVATE' &&
              event.captureMode !== 'SYSTEM_ONLY') &&
      event.observedAt.getTime() <= evidenceCutoffTimestamp &&
      event.recordedAt.getTime() <= evidenceCutoffTimestamp
  );
  assertEvidenceVersions(isolatedEvents, input.factor, input);
  const aggregation = aggregateFactorEvidence(
    input.factor,
    isolatedEvents,
    calculatedAt,
    input.calculatedAt
  );
  const versions = versionsFor(
    input.factor,
    input,
    evidenceVersionReferences(isolatedEvents)
  );
  const effectiveFrom = new Date(calculatedAt.getTime());
  const effectiveUntil = effectiveUntilForEvidence(
    input.factor,
    isolatedEvents,
    effectiveFrom,
    aggregation.status,
    aggregation.evidenceIds
  );
  const inputHash = hash([
    'INDIVIDUAL',
    input.subjectId,
    input.contextPairId ?? 'UNSCOPED',
    input.projectionPurpose,
    input.factor.key,
    encodeSnapshotVersions(versions),
    `TIME_WINDOW:${calculatedAt.toISOString()}`,
    `EFFECTIVE_FROM:${effectiveFrom.toISOString()}`,
    `EFFECTIVE_UNTIL:${effectiveUntil?.toISOString() ?? 'NONE'}`,
    ...isolatedEvents.map((event) => event.inputHash).sort(),
  ]);
  const outputHash = hash([
    inputHash,
    encodeSnapshotVersions(versions),
    aggregation.status,
    encodeValue(aggregation.value),
    encodeMetrics(aggregation.metrics),
    ...aggregation.evidenceIds,
  ]);
  return {
    snapshotId: input.snapshotId,
    subjectId: input.subjectId,
    contextPairId: input.contextPairId,
    projectionPurpose: input.projectionPurpose,
    factorKey: input.factor.key,
    revision: input.revision,
    status: aggregation.status,
    value: aggregation.value,
    metrics: aggregation.metrics,
    evidenceIds: aggregation.evidenceIds,
    versions,
    inputHash,
    outputHash,
    calculatedAt,
    effectiveFrom,
    effectiveUntil,
  };
}

export function buildPairFactorSnapshot(
  input: BuildPairFactorSnapshotInput
): PairFactorSnapshot {
  const calculatedAt = canonicalSnapshotCalculatedAt(input.calculatedAt);
  const evidenceCutoffTimestamp = input.calculatedAt.getTime();
  const isolatedEvents = input.events.filter(
    (event) =>
      event.subjectKind === 'PAIR' &&
      event.subjectId === input.pairId &&
      event.pairId === input.pairId &&
      event.observationScope === 'PAIR_DYAD' &&
      event.factorKey === input.factor.key &&
      event.status === 'ACCEPTED' &&
      (event.purpose === 'PAIR_MODEL' ||
        event.purpose === 'RECOMMENDATION') &&
      (event.captureMode === 'PAIR_MODEL_ONLY' ||
        event.captureMode === 'SHARED') &&
      event.observedAt.getTime() <= evidenceCutoffTimestamp &&
      event.recordedAt.getTime() <= evidenceCutoffTimestamp
  );
  assertEvidenceVersions(isolatedEvents, input.factor, input);
  const aggregation = aggregateFactorEvidence(
    input.factor,
    isolatedEvents,
    calculatedAt,
    input.calculatedAt
  );
  const versions = versionsFor(
    input.factor,
    input,
    evidenceVersionReferences(isolatedEvents)
  );
  const effectiveFrom = new Date(calculatedAt.getTime());
  const effectiveUntil = effectiveUntilForEvidence(
    input.factor,
    isolatedEvents,
    effectiveFrom,
    aggregation.status,
    aggregation.evidenceIds
  );
  const inputHash = hash([
    'PAIR',
    input.pairId,
    input.factor.key,
    encodeSnapshotVersions(versions),
    `TIME_WINDOW:${calculatedAt.toISOString()}`,
    `EFFECTIVE_FROM:${effectiveFrom.toISOString()}`,
    `EFFECTIVE_UNTIL:${effectiveUntil?.toISOString() ?? 'NONE'}`,
    ...isolatedEvents.map((event) => event.inputHash).sort(),
  ]);
  const outputHash = hash([
    inputHash,
    encodeSnapshotVersions(versions),
    aggregation.status,
    encodeValue(aggregation.value),
    encodeMetrics(aggregation.metrics),
    ...aggregation.evidenceIds,
  ]);
  return {
    snapshotId: input.snapshotId,
    pairId: input.pairId,
    factorKey: input.factor.key,
    revision: input.revision,
    status: aggregation.status,
    value: aggregation.value,
    metrics: aggregation.metrics,
    evidenceIds: aggregation.evidenceIds,
    versions,
    inputHash,
    outputHash,
    calculatedAt,
    effectiveFrom,
    effectiveUntil,
  };
}

const assertSnapshotVersions = (
  snapshot: IndividualFactorSnapshot | PairFactorSnapshot,
  factor: FactorDefinition,
  versions: SnapshotBuildVersions
): void => {
  if (snapshot.factorKey !== factor.key) {
    throw new FactorEngineVersionError('SNAPSHOT_FACTOR_MISMATCH');
  }
  if (snapshot.versions.registryVersion !== versions.registryVersion) {
    throw new FactorEngineVersionError('REGISTRY_VERSION_MISMATCH');
  }
  if (snapshot.versions.definitionVersion !== factor.definitionVersion) {
    throw new FactorEngineVersionError('DEFINITION_VERSION_MISMATCH');
  }
  if (snapshot.versions.algorithmVersion !== versions.algorithmVersion) {
    throw new FactorEngineVersionError('ALGORITHM_VERSION_MISMATCH');
  }
  if (snapshot.versions.snapshotVersion !== versions.snapshotVersion) {
    throw new FactorEngineVersionError('SNAPSHOT_VERSION_MISMATCH');
  }
  if (snapshot.versions.displayVersion !== versions.displayVersion) {
    throw new FactorEngineVersionError('DISPLAY_VERSION_MISMATCH');
  }
  assertCanonicalVersionReferences(snapshot.versions.measurementRefs);
  assertCanonicalVersionReferences(snapshot.versions.instrumentRefs);
};

const swapRoleContext = (context: RoleCoverageContext): RoleCoverageContext => ({
  partnerA: context.partnerB,
  partnerB: context.partnerA,
  fairnessConfidence: context.fairnessConfidence,
});

export function buildPairFactorEvaluationSnapshot(
  input: BuildPairFactorEvaluationSnapshotInput
): PairFactorEvaluationSnapshot {
  const calculatedAt = canonicalSnapshotCalculatedAt(input.calculatedAt);
  if (input.relationshipContext !== input.strategy.context) {
    throw new FactorEngineVersionError('SNAPSHOT_CONTEXT_MISMATCH');
  }
  assertSnapshotVersions(input.partnerA, input.factor, input);
  assertSnapshotVersions(input.partnerB, input.factor, input);
  if (
    (input.partnerA.projectionPurpose !== 'PAIR_MODEL' &&
      input.partnerA.projectionPurpose !== 'RECOMMENDATION') ||
    (input.partnerB.projectionPurpose !== 'PAIR_MODEL' &&
      input.partnerB.projectionPurpose !== 'RECOMMENDATION')
  ) {
    throw new FactorEngineVersionError('SNAPSHOT_PURPOSE_MISMATCH');
  }
  if (input.partnerA.subjectId === input.partnerB.subjectId) {
    throw new FactorEngineVersionError('SNAPSHOT_MEMBER_MISMATCH');
  }
  const hasScopedPartnerSnapshot = Boolean(
    input.partnerA.contextPairId || input.partnerB.contextPairId
  );
  if (
    hasScopedPartnerSnapshot &&
    (input.partnerA.contextPairId !== input.pairId ||
      input.partnerB.contextPairId !== input.pairId)
  ) {
    throw new FactorEngineVersionError('SNAPSHOT_MEMBER_MISMATCH');
  }
  if (input.pairSnapshot) {
    assertSnapshotVersions(input.pairSnapshot, input.factor, input);
    if (input.pairSnapshot.pairId !== input.pairId) {
      throw new FactorEngineVersionError('SNAPSHOT_MEMBER_MISMATCH');
    }
  }

  const effectiveComponents = input.pairSnapshot
    ? [input.partnerA, input.partnerB, input.pairSnapshot]
    : [input.partnerA, input.partnerB];
  if (
    effectiveComponents.some(
      (snapshot) => !isSnapshotEffectiveAt(snapshot, calculatedAt)
    )
  ) {
    throw new FactorEngineVersionError('SNAPSHOT_NOT_EFFECTIVE');
  }

  const alreadyCanonical =
    input.partnerA.subjectId.localeCompare(input.partnerB.subjectId) <= 0;
  const partnerA = alreadyCanonical ? input.partnerA : input.partnerB;
  const partnerB = alreadyCanonical ? input.partnerB : input.partnerA;
  const directional = input.directional
    ? alreadyCanonical
      ? input.directional
      : {
          desiredByA: input.directional.desiredByB,
          desiredByB: input.directional.desiredByA,
        }
    : undefined;
  const roleCoverage = input.roleCoverage
    ? alreadyCanonical
      ? input.roleCoverage
      : swapRoleContext(input.roleCoverage)
    : undefined;

  const evaluation = evaluatePairStrategy(
    input.strategy,
    { value: partnerA.value, confidence: partnerA.metrics.confidence },
    { value: partnerB.value, confidence: partnerB.metrics.confidence },
    {
      relationshipContext: input.relationshipContext,
      directional,
      roleCoverage,
    }
  );
  const individualSnapshotIds: readonly [string, string] = [
    partnerA.snapshotId,
    partnerB.snapshotId,
  ];
  const componentSnapshots = input.pairSnapshot
    ? [partnerA, partnerB, input.pairSnapshot]
    : [partnerA, partnerB];
  const versions = versionsFor(
    input.factor,
    input,
    unionVersionReferences(componentSnapshots)
  );
  const effectiveFrom = new Date(calculatedAt.getTime());
  const effectiveUntil = minimumEffectiveUntil(
    componentSnapshots,
    effectiveFrom
  );
  const inputHash = hash([
    'PAIR_EVALUATION',
    input.pairId,
    input.factor.key,
    `RELATIONSHIP_CONTEXT:${input.relationshipContext}`,
    `STRATEGY_CONTEXT:${input.strategy.context}`,
    input.strategy.config.type,
    String(input.strategy.strategyVersion),
    input.strategy.directionality,
    partnerA.outputHash,
    partnerB.outputHash,
    input.pairSnapshot?.outputHash ?? '',
    encodeDirectionalContext(directional),
    encodeRoleCoverageContext(roleCoverage),
    encodeSnapshotVersions(versions),
    `TIME_WINDOW:${calculatedAt.toISOString()}`,
    `EFFECTIVE_FROM:${effectiveFrom.toISOString()}`,
    `EFFECTIVE_UNTIL:${effectiveUntil?.toISOString() ?? 'NONE'}`,
  ]);
  const outputHash = hash([
    inputHash,
    encodeSnapshotVersions(versions),
    String(input.strategy.strategyVersion),
    input.strategy.directionality,
    evaluation.status,
    String(evaluation.internalFit ?? ''),
    String(evaluation.confidence),
    evaluation.actionability,
    encodeDirectionalFit(evaluation.directionalFit),
    encodeRoleMetrics(evaluation.roleMetrics),
    ...evaluation.reasonCodes,
  ]);
  return {
    snapshotId: input.snapshotId,
    pairId: input.pairId,
    memberAId: partnerA.subjectId,
    memberBId: partnerB.subjectId,
    factorKey: input.factor.key,
    context: input.relationshipContext,
    strategy: input.strategy.config.type,
    strategyVersion: input.strategy.strategyVersion,
    directionality: input.strategy.directionality,
    revision: input.revision,
    evaluation,
    individualSnapshotIds,
    pairSnapshotId: input.pairSnapshot?.snapshotId,
    versions,
    inputHash,
    outputHash,
    calculatedAt,
    effectiveFrom,
    effectiveUntil,
  };
}

export type SnapshotReplayResult =
  | { status: 'MATCH'; outputHash: string }
  | { status: 'MISMATCH'; expectedHash: string; replayedHash: string }
  | { status: 'INCOMPATIBLE_VERSION'; reasonCode: FactorEngineVersionError['reasonCode'] };

type ReplayableSnapshot =
  | IndividualFactorSnapshot
  | PairFactorSnapshot
  | PairFactorEvaluationSnapshot;

const replayContractHash = (snapshot: ReplayableSnapshot): string =>
  hash([
    snapshot.inputHash,
    snapshot.outputHash,
    encodeSnapshotVersions(snapshot.versions),
    snapshot.calculatedAt.toISOString(),
    snapshot.effectiveFrom.toISOString(),
    snapshot.effectiveUntil?.toISOString() ?? 'NONE',
  ]);

const compareReplay = (
  expected: ReplayableSnapshot,
  replayed: ReplayableSnapshot
): SnapshotReplayResult => {
  const expectedHash = replayContractHash(expected);
  const replayedHash = replayContractHash(replayed);
  return expectedHash === replayedHash
    ? { status: 'MATCH', outputHash: replayed.outputHash }
    : { status: 'MISMATCH', expectedHash, replayedHash };
};

const replayEvidenceCutoffAt = (
  expectedCalculatedAt: Date,
  events: readonly EvidenceEvent[]
): Date =>
  new Date(
    events.reduce(
      (latest, event) =>
        Math.max(
          latest,
          event.observedAt.getTime(),
          event.recordedAt.getTime()
        ),
      expectedCalculatedAt.getTime()
    )
  );

export function replayIndividualFactorSnapshot(
  expected: IndividualFactorSnapshot,
  input: Omit<BuildIndividualFactorSnapshotInput, 'snapshotId' | 'revision' | 'calculatedAt'>
): SnapshotReplayResult {
  try {
    const replayed = buildIndividualFactorSnapshot({
      ...input,
      snapshotId: expected.snapshotId,
      revision: expected.revision,
      calculatedAt: replayEvidenceCutoffAt(expected.calculatedAt, input.events),
    });
    return compareReplay(expected, replayed);
  } catch (error) {
    if (error instanceof FactorEngineVersionError) {
      return { status: 'INCOMPATIBLE_VERSION', reasonCode: error.reasonCode };
    }
    throw error;
  }
}

export function replayPairFactorSnapshot(
  expected: PairFactorSnapshot,
  input: Omit<BuildPairFactorSnapshotInput, 'snapshotId' | 'revision' | 'calculatedAt'>
): SnapshotReplayResult {
  try {
    const replayed = buildPairFactorSnapshot({
      ...input,
      snapshotId: expected.snapshotId,
      revision: expected.revision,
      calculatedAt: replayEvidenceCutoffAt(expected.calculatedAt, input.events),
    });
    return compareReplay(expected, replayed);
  } catch (error) {
    if (error instanceof FactorEngineVersionError) {
      return { status: 'INCOMPATIBLE_VERSION', reasonCode: error.reasonCode };
    }
    throw error;
  }
}

export function replayPairFactorEvaluationSnapshot(
  expected: PairFactorEvaluationSnapshot,
  input: Omit<BuildPairFactorEvaluationSnapshotInput, 'snapshotId' | 'revision' | 'calculatedAt'>
): SnapshotReplayResult {
  try {
    const replayed = buildPairFactorEvaluationSnapshot({
      ...input,
      snapshotId: expected.snapshotId,
      revision: expected.revision,
      calculatedAt: expected.calculatedAt,
    });
    return compareReplay(expected, replayed);
  } catch (error) {
    if (error instanceof FactorEngineVersionError) {
      return { status: 'INCOMPATIBLE_VERSION', reasonCode: error.reasonCode };
    }
    throw error;
  }
}
