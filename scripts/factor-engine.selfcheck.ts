import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  MVP_FACTOR_REGISTRY,
  MVP_FACTOR_REGISTRY_INPUT,
  FACTOR_EVIDENCE_SELECTION_MAXIMUM,
  FACTOR_EVIDENCE_SELECTION_MINIMUM,
  aggregateFactorEvidence,
  buildIndividualFactorSnapshot,
  buildPairFactorSnapshot,
  buildPairFactorEvaluationSnapshot,
  createEvidenceEvent,
  discloseFactor,
  evaluatePairStrategy,
  factorEvidenceSelectionWindow,
  factorValueCanonicalKey,
  hashFactorRegistry,
  isSnapshotEffectiveAt,
  recommendActions,
  replayIndividualFactorSnapshot,
  replayPairFactorEvaluationSnapshot,
  replayPairFactorSnapshot,
  validateFactorRegistry,
  validateFactorValue,
  validatePairStrategyDefinition,
  type FactorDefinition,
  type IndividualFactorSnapshot,
  type PairStrategyDefinition,
  type PairStrategyEvaluation,
  type PairStrategyType,
  type RoleCoverageContext,
} from '@/domain/model';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot as IndividualFactorSnapshotModel } from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot as PairFactorEvaluationSnapshotModel } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot as PairFactorSnapshotModel } from '@/models/PairFactorSnapshot';
import {
  fromStoredFactorValue,
  StoredFactorValueValidationError,
  toStoredFactorValue,
  validateStoredSnapshotInterval,
} from '@/models/factorEngineSchemas';

const NOW = new Date('2026-08-11T12:00:00.000Z');

const expectedPairEvaluationOutputHash = (
  snapshot: ReturnType<typeof buildPairFactorEvaluationSnapshot>
): string => {
  const directionalFit = snapshot.evaluation.directionalFit
    ? `DIRECTIONAL_FIT:${JSON.stringify([
        snapshot.evaluation.directionalFit.aAcceptsB,
        snapshot.evaluation.directionalFit.bAcceptsA,
      ])}`
    : 'DIRECTIONAL_FIT:NONE';
  const roleMetrics = snapshot.evaluation.roleMetrics
    ? `ROLE_METRICS:${JSON.stringify([
        snapshot.evaluation.roleMetrics.coverage,
        snapshot.evaluation.roleMetrics.loadImbalance,
        snapshot.evaluation.roleMetrics.preferenceSatisfaction,
      ])}`
    : 'ROLE_METRICS:NONE';
  const encodedVersions = [
    snapshot.versions.registryVersion,
    snapshot.versions.definitionVersion,
    snapshot.versions.algorithmVersion,
    snapshot.versions.snapshotVersion,
    snapshot.versions.displayVersion,
    `MEASUREMENTS:${snapshot.versions.measurementRefs
      .map((reference) => `${reference.key}:${reference.version}`)
      .join(',')}`,
    `INSTRUMENTS:${snapshot.versions.instrumentRefs
      .map((reference) => `${reference.key}:${reference.version}`)
      .join(',')}`,
  ].join(':');
  return createHash('sha256')
    .update(
      [
        snapshot.inputHash,
        encodedVersions,
        String(snapshot.strategyVersion),
        snapshot.directionality,
        snapshot.evaluation.status,
        String(snapshot.evaluation.internalFit ?? ''),
        String(snapshot.evaluation.confidence),
        snapshot.evaluation.actionability,
        directionalFit,
        roleMetrics,
        ...snapshot.evaluation.reasonCodes,
      ].join('|')
    )
    .digest('hex');
};

const registryValidation = validateFactorRegistry(MVP_FACTOR_REGISTRY);
assert.deepEqual(registryValidation, { valid: true });
assert.equal(
  validateFactorRegistry({
    ...MVP_FACTOR_REGISTRY_INPUT,
    domains: [
      ...MVP_FACTOR_REGISTRY_INPUT.domains,
      MVP_FACTOR_REGISTRY_INPUT.domains[0],
    ],
  }).valid,
  false
);
assert.equal(MVP_FACTOR_REGISTRY.hash, hashFactorRegistry(MVP_FACTOR_REGISTRY));
assert.equal(
  MVP_FACTOR_REGISTRY.hash,
  hashFactorRegistry({
    ...MVP_FACTOR_REGISTRY_INPUT,
    domains: [...MVP_FACTOR_REGISTRY_INPUT.domains].reverse(),
    dimensions: [...MVP_FACTOR_REGISTRY_INPUT.dimensions].reverse(),
    factors: [...MVP_FACTOR_REGISTRY_INPUT.factors].reverse(),
    measurements: [...MVP_FACTOR_REGISTRY_INPUT.measurements].reverse(),
    instruments: [...MVP_FACTOR_REGISTRY_INPUT.instruments].reverse(),
    actions: [...MVP_FACTOR_REGISTRY_INPUT.actions].reverse(),
  })
);
assert.deepEqual(
  MVP_FACTOR_REGISTRY.instruments.map((item) => item.key).sort(),
  [
    'activityReflection.mvp',
    'matching.profile.mvp',
    'onboarding.mvp',
    'weekly.mvp',
  ]
);
const ordinalSchema = {
  type: 'ORDINAL',
  levels: [
    { value: 'LOW', rank: 0, label: 'low' },
    { value: 'MEDIUM', rank: 1, label: 'medium' },
    { value: 'HIGH', rank: 2, label: 'high' },
  ],
} as const;
assert.deepEqual(
  validateFactorValue(ordinalSchema, {
    kind: 'ORDINAL',
    value: 'MEDIUM',
    rank: 1,
  }),
  {
    valid: true,
    value: { kind: 'ORDINAL', value: 'MEDIUM', rank: 1 },
  }
);
assert.equal(
  validateFactorValue(ordinalSchema, {
    kind: 'ORDINAL',
    value: 'MEDIUM',
    rank: 2,
  }).valid,
  false
);
assert.equal(
  factorValueCanonicalKey({ kind: 'ORDINAL', value: 'MEDIUM', rank: 1 }),
  'ordinal:1:MEDIUM'
);
assert.deepEqual(
  validateFactorValue(
    { type: 'CONSTRAINT', allowedValues: ['YES', 'NO'] },
    { kind: 'CONSTRAINT', value: 'YES' }
  ),
  { valid: true, value: { kind: 'CONSTRAINT', value: 'YES' } }
);
assert.equal(
  factorValueCanonicalKey({ kind: 'CONSTRAINT', value: 'YES' }),
  'constraint:YES'
);
assert.ok(
  MVP_FACTOR_REGISTRY.measurements.some(
    (item) => item.key === 'weekly.readiness.direct'
  )
);
for (const factorKey of [
  'communication.weekly.connection',
  'communication.weekly.tension',
  'wellbeing.current.overload',
  'wellbeing.current.readiness',
]) {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (item) => item.key === factorKey
  );
  assert.ok(factor);
  assert.ok(
    factor.pairStrategies.some(
      (item) => item.context === 'COMMITTED_RELATIONSHIP'
    )
  );
}

const storedRoundTrip = { kind: 'RANGE', low: 0.2, high: 0.8 } as const;
assert.deepEqual(
  fromStoredFactorValue(toStoredFactorValue(storedRoundTrip)),
  storedRoundTrip
);
assert.throws(
  () => fromStoredFactorValue({ kind: 'SCALAR' }),
  StoredFactorValueValidationError
);

const invalidScalar = validateFactorValue(
  { type: 'SCALAR', min: 0, max: 1 },
  { kind: 'SCALAR', value: 3 }
);
assert.equal(invalidScalar.valid, false);
assert.deepEqual(
  validateFactorValue(
    { type: 'SCALAR', min: 0, max: 1 },
    { kind: 'UNKNOWN', reasonCode: 'NOT_ANSWERED' }
  ),
  {
    valid: true,
    value: { kind: 'UNKNOWN', reasonCode: 'NOT_ANSWERED' },
  }
);
assert.deepEqual(
  validateFactorValue(
    { type: 'SCALAR', min: 0, max: 1 },
    { kind: 'MISSING', reasonCode: 'NOT_PROVIDED' }
  ),
  {
    valid: true,
    value: { kind: 'MISSING', reasonCode: 'NOT_PROVIDED' },
  }
);

const strategy = (
  config: PairStrategyDefinition['config'],
  context: PairStrategyDefinition['context'] = 'COMMITTED_RELATIONSHIP'
): PairStrategyDefinition => ({
  context,
  config,
  strategyVersion: 1,
  directionality:
    config.type === 'DIRECTIONAL_EXPECTATION' ? 'DIRECTIONAL' : 'SYMMETRIC',
  minimumConfidence: 0.2,
  actionability: 'NEGOTIATION',
});

const roleCoverage: RoleCoverageContext = {
  partnerA: [
    { roleKey: 'cooking', preference01: 0.9, capability01: 0.9, load01: 0.45 },
    { roleKey: 'cleaning', preference01: 0.2, capability01: 0.3, load01: 0.1 },
  ],
  partnerB: [
    { roleKey: 'cooking', preference01: 0.1, capability01: 0.2, load01: 0.1 },
    { roleKey: 'cleaning', preference01: 0.8, capability01: 0.85, load01: 0.45 },
  ],
  fairnessConfidence: 0.9,
};

const definitions: readonly PairStrategyDefinition[] = [
  strategy({ type: 'SIMILARITY', maximumDistance: 1 }),
  strategy({ type: 'BOUNDED_GAP', comfortableGap: 0.2, maximumGap: 0.8 }),
  strategy({ type: 'TARGET_RANGE', targetMin: 0.1, targetMax: 0.9 }),
  strategy({ type: 'COMPLEMENT', idealGap: 0.6, tolerance: 0.5 }),
  strategy({
    type: 'BOUNDED_COMPLEMENT',
    minimumUsefulGap: 0.2,
    idealGap: 0.6,
    maximumGap: 0.95,
  }),
  strategy({ type: 'MINIMUM_BOTH', minimum: 0.2 }),
  strategy({
    type: 'ROLE_COVERAGE',
    minimumCoverage: 0.6,
    maximumLoadImbalance: 0.25,
  }),
  strategy({ type: 'DIRECTIONAL_EXPECTATION', maximumDistanceFromRange: 0.5 }),
  strategy({
    type: 'CUSTOM_MATRIX',
    entries: [
      { a: 'category:X', b: 'category:Y', fit: 0.8, status: 'COMPLEMENTARY' },
      { a: 'category:Y', b: 'category:X', fit: 0.8, status: 'COMPLEMENTARY' },
    ],
  }),
  strategy({
    type: 'HARD_CONSTRAINT',
    allowedPairs: [
      { a: 'constraint:X', b: 'constraint:X' },
      { a: 'constraint:Y', b: 'constraint:Y' },
    ],
  }),
];

const evaluationFor = (
  definition: PairStrategyDefinition,
  swapped: boolean
): PairStrategyEvaluation => {
  const a = definition.config.type === 'CUSTOM_MATRIX'
    ? ({ kind: 'CATEGORY', value: 'X' } as const)
    : definition.config.type === 'HARD_CONSTRAINT'
      ? ({ kind: 'CONSTRAINT', value: 'X' } as const)
      : ({ kind: 'SCALAR', value: 0.2 } as const);
  const b = definition.config.type === 'CUSTOM_MATRIX'
    ? ({ kind: 'CATEGORY', value: 'Y' } as const)
    : definition.config.type === 'HARD_CONSTRAINT'
      ? ({ kind: 'CONSTRAINT', value: 'Y' } as const)
      : ({ kind: 'SCALAR', value: 0.8 } as const);
  const directional = {
    desiredByA: { minimum: 0.7, maximum: 0.9 },
    desiredByB: { minimum: 0.1, maximum: 0.3 },
  };
  return evaluatePairStrategy(
    definition,
    { value: swapped ? b : a, confidence: 0.9 },
    { value: swapped ? a : b, confidence: 0.8 },
    {
      relationshipContext: definition.context,
      directional: swapped
        ? {
            desiredByA: directional.desiredByB,
            desiredByB: directional.desiredByA,
          }
        : directional,
      roleCoverage: swapped
        ? {
            partnerA: roleCoverage.partnerB,
            partnerB: roleCoverage.partnerA,
            fairnessConfidence: roleCoverage.fairnessConfidence,
          }
        : roleCoverage,
    }
  );
};

const exercisedStrategies = new Set<PairStrategyType>();
for (const definition of definitions) {
  assert.deepEqual(validatePairStrategyDefinition(definition), { valid: true });
  const ab = evaluationFor(definition, false);
  const ba = evaluationFor(definition, true);
  assert.notEqual(ab.status, 'INSUFFICIENT_DATA', definition.config.type);
  assert.equal(ab.status, ba.status, `${definition.config.type} status symmetry`);
  assert.equal(ab.internalFit, ba.internalFit, `${definition.config.type} fit symmetry`);
  assert.equal(ab.confidence, ba.confidence, `${definition.config.type} confidence symmetry`);
  assert.deepEqual(ab.reasonCodes, ba.reasonCodes, `${definition.config.type} reason symmetry`);
  if (ab.directionalFit && ba.directionalFit) {
    assert.equal(ab.directionalFit.aAcceptsB, ba.directionalFit.bAcceptsA);
    assert.equal(ab.directionalFit.bAcceptsA, ba.directionalFit.aAcceptsB);
  }
  exercisedStrategies.add(definition.config.type);
}
assert.equal(exercisedStrategies.size, 10);
const ordinalPairEvaluation = evaluatePairStrategy(
  strategy({ type: 'TARGET_RANGE', targetMin: 0, targetMax: 2 }),
  { value: { kind: 'ORDINAL', value: 'LOW', rank: 0 }, confidence: 0.9 },
  { value: { kind: 'ORDINAL', value: 'HIGH', rank: 2 }, confidence: 0.9 },
  { relationshipContext: 'COMMITTED_RELATIONSHIP' }
);
assert.equal(ordinalPairEvaluation.status, 'ALIGNED');
const roleCoverageDefinition = definitions.find(
  (definition) => definition.config.type === 'ROLE_COVERAGE'
);
assert.ok(roleCoverageDefinition);
const missingRoleContext = evaluatePairStrategy(
  roleCoverageDefinition,
  { value: { kind: 'SCALAR', value: 0.2 }, confidence: 0.9 },
  { value: { kind: 'SCALAR', value: 0.8 }, confidence: 0.8 },
  { relationshipContext: roleCoverageDefinition.context }
);
assert.equal(missingRoleContext.status, 'INSUFFICIENT_DATA');
assert.deepEqual(missingRoleContext.reasonCodes, ['ROLE_CONTEXT_MISSING']);
assert.equal(missingRoleContext.actionability, 'NONE');
assert.equal(missingRoleContext.roleMetrics, undefined);
assert.deepEqual(
  evaluatePairStrategy(
    roleCoverageDefinition,
    { value: { kind: 'SCALAR', value: 0.2 }, confidence: 0.9 },
    { value: { kind: 'SCALAR', value: 0.8 }, confidence: 0.8 },
    {
      relationshipContext: roleCoverageDefinition.context,
      roleCoverage: {
        partnerA: [],
        partnerB: [],
        fairnessConfidence: 1,
      },
    }
  ).reasonCodes,
  ['ROLE_CONTEXT_MISSING']
);

const repairFactor = MVP_FACTOR_REGISTRY.factors.find(
  (item) => item.key === 'communication.conflict.repairSkill'
);
const repairMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
  (item) => item.key === 'onboarding.repairSkill.selfReport'
);
const onboardingInstrument = MVP_FACTOR_REGISTRY.instruments.find(
  (item) => item.key === 'onboarding.mvp'
);
assert.ok(repairFactor && repairMeasurement && onboardingInstrument);

const ownerEvidencePolicy = {
  sourceRevision: 'selfcheck-source-v1',
  context: 'SELF',
  purpose: 'OWNER_PROFILE',
  captureMode: 'PRIVATE',
  policyVersion: 'selfcheck-privacy-v1',
  consentRevision: 'selfcheck-consent-v1',
  retentionClass: 'OWNER_CONTROLLED',
} as const;
const pairModelProfileEvidencePolicy = {
  sourceRevision: 'selfcheck-source-v1',
  context: 'SELF',
  purpose: 'PAIR_MODEL',
  captureMode: 'SHARED',
  policyVersion: 'selfcheck-privacy-v1',
  consentRevision: 'selfcheck-consent-v1',
  retentionClass: 'OWNER_CONTROLLED',
} as const;
const pairContextEvidencePolicy = {
  sourceRevision: 'selfcheck-source-v1',
  context: 'COMMITTED_RELATIONSHIP',
  purpose: 'PAIR_MODEL',
  captureMode: 'PAIR_MODEL_ONLY',
  policyVersion: 'selfcheck-privacy-v1',
  consentRevision: 'selfcheck-consent-v1',
  retentionClass: 'PAIR_CONTEXT',
} as const;

const selfEvidence = [0.5, 0.7].map((score01, index) =>
  createEvidenceEvent(
    {
      eventId: `evidence-self-${index}`,
      idempotencyKey: `self-${index}`,
      actorId: 'user-a',
      subjectKind: 'INDIVIDUAL',
      subjectId: 'user-a',
      observationScope: 'SELF',
      factorKey: repairFactor.key,
      measurementKey: repairMeasurement.key,
      instrumentKey: onboardingInstrument.key,
      sourceType: repairMeasurement.sourceType,
      sourceRef: `answer-${index}`,
      ...ownerEvidencePolicy,
      privacyClass: repairFactor.privacyClass,
      submittedValue: { kind: 'MASTERY', score01, level: 'INTERMEDIATE' },
      reliabilityMultiplier: 1,
      observedAt: new Date(NOW.getTime() - index * 86_400_000),
      recordedAt: NOW,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    },
    repairFactor,
    repairMeasurement,
    onboardingInstrument
  )
);
assert.ok(selfEvidence.every((event) => event.status === 'ACCEPTED'));

const personalSnapshot = buildIndividualFactorSnapshot({
  snapshotId: 'snapshot-user-a-repair-1',
  subjectId: 'user-a',
  projectionPurpose: 'OWNER_PROFILE',
  factor: repairFactor,
  events: selfEvidence,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(personalSnapshot.status, 'AVAILABLE');
assert.equal(personalSnapshot.evidenceIds.length, 2);
assert.ok(personalSnapshot.metrics.confidence > 0);
assert.equal(personalSnapshot.versions.displayVersion, MVP_FACTOR_REGISTRY.displayVersion);
assert.deepEqual(personalSnapshot.versions.measurementRefs, [
  {
    key: repairMeasurement.key,
    version: repairMeasurement.measurementVersion,
  },
]);
assert.deepEqual(personalSnapshot.versions.instrumentRefs, [
  {
    key: onboardingInstrument.key,
    version: onboardingInstrument.instrumentVersion,
  },
]);
assert.equal(personalSnapshot.effectiveFrom.toISOString(), '2026-08-11T00:00:00.000Z');
assert.equal(
  personalSnapshot.effectiveUntil?.toISOString(),
  '2026-08-12T00:00:00.000Z'
);
const evidenceSelection = factorEvidenceSelectionWindow(repairFactor, NOW);
assert.equal(evidenceSelection.maximumEvents, 32);
assert.ok(
  evidenceSelection.maximumEvents >= FACTOR_EVIDENCE_SELECTION_MINIMUM &&
    evidenceSelection.maximumEvents <= FACTOR_EVIDENCE_SELECTION_MAXIMUM
);
assert.equal(
  evidenceSelection.earliestObservedAt?.toISOString(),
  '2025-08-11T12:00:00.000Z'
);
const cutoffEvidence = (
  eventId: string,
  observedAt: Date,
  recordedAt: Date
) =>
  createEvidenceEvent(
    {
      eventId,
      idempotencyKey: eventId,
      actorId: 'user-a',
      subjectKind: 'INDIVIDUAL',
      subjectId: 'user-a',
      observationScope: 'SELF',
      factorKey: repairFactor.key,
      measurementKey: repairMeasurement.key,
      instrumentKey: onboardingInstrument.key,
      sourceType: repairMeasurement.sourceType,
      sourceRef: eventId,
      ...ownerEvidencePolicy,
      privacyClass: repairFactor.privacyClass,
      submittedValue: {
        kind: 'MASTERY',
        score01: 0.95,
        level: 'ADVANCED',
      },
      reliabilityMultiplier: 1,
      observedAt,
      recordedAt,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    },
    repairFactor,
    repairMeasurement,
    onboardingInstrument
  );
const futureObservedEvidence = cutoffEvidence(
  'future-observed-evidence',
  new Date(NOW.getTime() + 60_000),
  new Date(NOW.getTime() + 60_000)
);
const lateRecordedEvidence = cutoffEvidence(
  'late-recorded-evidence',
  new Date(NOW.getTime() - 60_000),
  new Date(NOW.getTime() + 60_000)
);
assert.equal(futureObservedEvidence.status, 'ACCEPTED');
assert.equal(lateRecordedEvidence.status, 'ACCEPTED');
const cutoffSnapshot = buildIndividualFactorSnapshot({
  snapshotId: 'snapshot-user-a-repair-cutoff',
  subjectId: 'user-a',
  projectionPurpose: 'OWNER_PROFILE',
  factor: repairFactor,
  events: [...selfEvidence, futureObservedEvidence, lateRecordedEvidence],
  revision: 2,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(cutoffSnapshot.inputHash, personalSnapshot.inputHash);
assert.equal(cutoffSnapshot.outputHash, personalSnapshot.outputHash);
assert.deepEqual(cutoffSnapshot.evidenceIds, personalSnapshot.evidenceIds);
const matchingRejectedEvidence = createEvidenceEvent(
  {
    eventId: 'evidence-self-rejected',
    idempotencyKey: 'self-rejected',
    actorId: 'user-a',
    subjectKind: 'INDIVIDUAL',
    subjectId: 'user-a',
    observationScope: 'SELF',
    factorKey: repairFactor.key,
    measurementKey: repairMeasurement.key,
    instrumentKey: onboardingInstrument.key,
    sourceType: repairMeasurement.sourceType,
    sourceRef: 'answer-rejected',
    ...ownerEvidencePolicy,
    privacyClass: repairFactor.privacyClass,
    submittedValue: { kind: 'MASTERY', score01: 3, level: 'ADVANCED' },
    reliabilityMultiplier: 1,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  repairFactor,
  repairMeasurement,
  onboardingInstrument
);
assert.equal(matchingRejectedEvidence.status, 'REJECTED');
const personalSnapshotWithRejected = buildIndividualFactorSnapshot({
  snapshotId: 'snapshot-user-a-repair-with-rejected',
  subjectId: 'user-a',
  projectionPurpose: 'OWNER_PROFILE',
  factor: repairFactor,
  events: [...selfEvidence, matchingRejectedEvidence],
  revision: 2,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(personalSnapshotWithRejected.inputHash, personalSnapshot.inputHash);
assert.equal(personalSnapshotWithRejected.outputHash, personalSnapshot.outputHash);
assert.deepEqual(personalSnapshotWithRejected.evidenceIds, personalSnapshot.evidenceIds);
assert.deepEqual(personalSnapshotWithRejected.versions, personalSnapshot.versions);
const rejectedOnlySnapshot = buildIndividualFactorSnapshot({
  snapshotId: 'snapshot-user-a-repair-rejected-only',
  subjectId: 'user-a',
  projectionPurpose: 'OWNER_PROFILE',
  factor: repairFactor,
  events: [matchingRejectedEvidence],
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(rejectedOnlySnapshot.status, 'MISSING');
assert.equal(rejectedOnlySnapshot.evidenceIds.length, 0);
assert.deepEqual(rejectedOnlySnapshot.versions.measurementRefs, []);
assert.deepEqual(rejectedOnlySnapshot.versions.instrumentRefs, []);
const displayPinnedSnapshot = buildIndividualFactorSnapshot({
  snapshotId: 'snapshot-user-a-repair-display-version',
  subjectId: 'user-a',
  projectionPurpose: 'OWNER_PROFILE',
  factor: repairFactor,
  events: selfEvidence,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion + 1,
  calculatedAt: NOW,
});
assert.notEqual(displayPinnedSnapshot.inputHash, personalSnapshot.inputHash);
assert.notEqual(displayPinnedSnapshot.outputHash, personalSnapshot.outputHash);
assert.equal(
  replayIndividualFactorSnapshot(personalSnapshot, {
    subjectId: 'user-a',
    projectionPurpose: 'OWNER_PROFILE',
    factor: repairFactor,
    events: selfEvidence,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion + 1,
  }).status,
  'MISMATCH'
);
assert.equal(
  replayIndividualFactorSnapshot(
    {
      ...personalSnapshot,
      effectiveFrom: new Date('2026-08-10T00:00:00.000Z'),
    },
    {
      subjectId: 'user-a',
      projectionPurpose: 'OWNER_PROFILE',
      factor: repairFactor,
      events: selfEvidence,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
      displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    }
  ).status,
  'MISMATCH'
);
assert.deepEqual(
  replayIndividualFactorSnapshot(personalSnapshot, {
    subjectId: 'user-a',
    projectionPurpose: 'OWNER_PROFILE',
    factor: repairFactor,
    events: selfEvidence,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  }),
  { status: 'MATCH', outputHash: personalSnapshot.outputHash }
);
assert.equal(
  replayIndividualFactorSnapshot(personalSnapshot, {
    subjectId: 'user-a',
    projectionPurpose: 'OWNER_PROFILE',
    factor: repairFactor,
    events: selfEvidence.slice(0, 1),
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  }).status,
  'MISMATCH'
);

const explicitStatusSnapshot = (
  value: { kind: 'UNKNOWN'; reasonCode: 'NOT_ANSWERED' } | {
    kind: 'SCALAR';
    value: number;
  },
  suffix: string
) => {
  const event = createEvidenceEvent(
    {
      eventId: `status-${suffix}`,
      idempotencyKey: `status-${suffix}`,
      actorId: 'user-status',
      subjectKind: 'INDIVIDUAL',
      subjectId: 'user-status',
      observationScope: 'SELF',
      factorKey: repairFactor.key,
      measurementKey: repairMeasurement.key,
      instrumentKey: onboardingInstrument.key,
      sourceType: repairMeasurement.sourceType,
      sourceRef: `status-${suffix}`,
      ...ownerEvidencePolicy,
      privacyClass: repairFactor.privacyClass,
      submittedValue:
        value.kind === 'UNKNOWN'
          ? value
          : { kind: 'MASTERY', score01: value.value, level: 'BASIC' },
      reliabilityMultiplier: 1,
      observedAt: NOW,
      recordedAt: NOW,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    },
    repairFactor,
    repairMeasurement,
    onboardingInstrument
  );
  return buildIndividualFactorSnapshot({
    snapshotId: `status-${suffix}`,
    subjectId: 'user-status',
    projectionPurpose: 'OWNER_PROFILE',
    factor: repairFactor,
    events: [event],
    revision: 1,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt: NOW,
  });
};
assert.equal(
  explicitStatusSnapshot(
    { kind: 'UNKNOWN', reasonCode: 'NOT_ANSWERED' },
    'unknown'
  ).status,
  'UNKNOWN'
);
assert.equal(
  explicitStatusSnapshot({ kind: 'SCALAR', value: 0.2 }, 'insufficient').status,
  'INSUFFICIENT_DATA'
);
const rejectedEvidence = createEvidenceEvent(
  {
    eventId: 'status-invalid',
    idempotencyKey: 'status-invalid',
    actorId: 'user-status',
    subjectKind: 'INDIVIDUAL',
    subjectId: 'user-status',
    observationScope: 'SELF',
    factorKey: repairFactor.key,
    measurementKey: repairMeasurement.key,
    instrumentKey: onboardingInstrument.key,
    sourceType: repairMeasurement.sourceType,
    sourceRef: 'status-invalid',
    ...ownerEvidencePolicy,
    privacyClass: repairFactor.privacyClass,
    submittedValue: { kind: 'MASTERY', score01: 3, level: 'ADVANCED' },
    reliabilityMultiplier: 1,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  repairFactor,
  repairMeasurement,
  onboardingInstrument
);
assert.equal(rejectedEvidence.status, 'REJECTED');
assert.equal(
  buildIndividualFactorSnapshot({
    snapshotId: 'status-invalid',
    subjectId: 'user-status',
    projectionPurpose: 'OWNER_PROFILE',
    factor: repairFactor,
    events: [rejectedEvidence],
    revision: 1,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt: NOW,
  }).status,
  'MISSING'
);

const observerEvidence = createEvidenceEvent(
  {
    eventId: 'observer-about-b',
    idempotencyKey: 'observer-about-b',
    actorId: 'user-a',
    subjectKind: 'INDIVIDUAL',
    subjectId: 'user-a',
    observationScope: 'OBSERVER_REPORT',
    observedSubjectId: 'user-b',
    factorKey: repairFactor.key,
    measurementKey: repairMeasurement.key,
    instrumentKey: onboardingInstrument.key,
    sourceType: repairMeasurement.sourceType,
    sourceRef: 'observer-answer',
    ...ownerEvidencePolicy,
    privacyClass: repairFactor.privacyClass,
    submittedValue: { kind: 'MASTERY', score01: 0.1, level: 'BASIC' },
    reliabilityMultiplier: 1,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  repairFactor,
  repairMeasurement,
  onboardingInstrument
);
assert.equal(observerEvidence.status, 'ACCEPTED');
const isolatedPartnerSnapshot = buildIndividualFactorSnapshot({
  snapshotId: 'snapshot-user-b-repair-1',
  subjectId: 'user-b',
  projectionPurpose: 'OWNER_PROFILE',
  factor: repairFactor,
  events: [observerEvidence],
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(isolatedPartnerSnapshot.status, 'MISSING');
assert.equal(isolatedPartnerSnapshot.evidenceIds.length, 0);

const structureFactor = MVP_FACTOR_REGISTRY.factors.find(
  (item) => item.key === 'sharedLife.planning.structurePreference'
);
const structureMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
  (item) => item.key === 'onboarding.structurePreference.direct'
);
assert.ok(structureFactor && structureMeasurement);
const individual = (
  subjectId: string,
  value: number
): IndividualFactorSnapshot => {
  const event = createEvidenceEvent(
    {
      eventId: `event-${subjectId}`,
      idempotencyKey: `event-${subjectId}`,
      actorId: subjectId,
      subjectKind: 'INDIVIDUAL',
      subjectId,
      observationScope: 'SELF',
      factorKey: structureFactor.key,
      measurementKey: structureMeasurement.key,
      instrumentKey: onboardingInstrument.key,
      sourceType: structureMeasurement.sourceType,
      sourceRef: `profile-${subjectId}`,
      ...pairModelProfileEvidencePolicy,
      privacyClass: structureFactor.privacyClass,
      submittedValue: { kind: 'SCALAR', value },
      reliabilityMultiplier: 1,
      observedAt: NOW,
      recordedAt: NOW,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    },
    structureFactor,
    structureMeasurement,
    onboardingInstrument
  );
  return buildIndividualFactorSnapshot({
    snapshotId: `snapshot-${subjectId}`,
    subjectId,
    projectionPurpose: 'PAIR_MODEL',
    factor: structureFactor,
    events: [event],
    revision: 1,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt: NOW,
  });
};
const snapshotA = individual('user-a', -0.2);
const snapshotB = individual('user-b', 0.3);
const boundedGap = structureFactor.pairStrategies[0];
const pairAB = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-1',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: boundedGap,
  relationshipContext: boundedGap.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
const pairBA = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-1',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: boundedGap,
  relationshipContext: boundedGap.context,
  partnerA: snapshotB,
  partnerB: snapshotA,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(pairAB.memberAId, 'user-a');
assert.equal(pairAB.outputHash, pairBA.outputHash);
assert.deepEqual(pairAB.evaluation, pairBA.evaluation);
assert.equal(pairAB.outputHash, expectedPairEvaluationOutputHash(pairAB));
assert.equal(pairAB.context, boundedGap.context);
assert.equal(pairAB.strategyVersion, boundedGap.strategyVersion);
assert.equal(pairAB.directionality, boundedGap.directionality);
assert.deepEqual(pairAB.versions.measurementRefs, snapshotA.versions.measurementRefs);
assert.deepEqual(pairAB.versions.instrumentRefs, snapshotA.versions.instrumentRefs);
assert.equal(pairAB.effectiveFrom.toISOString(), '2026-08-11T00:00:00.000Z');
assert.equal(pairAB.effectiveUntil, undefined);
assert.throws(
  () =>
    buildPairFactorEvaluationSnapshot({
      snapshotId: 'pair-evaluation-context-mismatch',
      pairId: 'pair-ab',
      factor: structureFactor,
      strategy: boundedGap,
      relationshipContext: 'DATING',
      partnerA: snapshotA,
      partnerB: snapshotB,
      revision: 1,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
      displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
      calculatedAt: NOW,
    }),
  /SNAPSHOT_CONTEXT_MISMATCH/
);
assert.throws(
  () =>
    buildPairFactorEvaluationSnapshot({
      snapshotId: 'pair-evaluation-expired-component',
      pairId: 'pair-ab',
      factor: structureFactor,
      strategy: boundedGap,
      relationshipContext: boundedGap.context,
      partnerA: {
        ...snapshotA,
        effectiveUntil: new Date('2026-08-11T00:00:00.000Z'),
      },
      partnerB: snapshotB,
      revision: 1,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
      displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
      calculatedAt: NOW,
    }),
  /SNAPSHOT_NOT_EFFECTIVE/
);
const actionabilityVariant = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-actionability',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: { ...boundedGap, actionability: 'AWARENESS' },
  relationshipContext: boundedGap.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(actionabilityVariant.inputHash, pairAB.inputHash);
assert.notEqual(actionabilityVariant.evaluation.actionability, pairAB.evaluation.actionability);
assert.notEqual(actionabilityVariant.outputHash, pairAB.outputHash);
assert.equal(
  actionabilityVariant.outputHash,
  expectedPairEvaluationOutputHash(actionabilityVariant)
);
const strategyPinnedVariant = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-strategy-version',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: {
    ...boundedGap,
    strategyVersion: boundedGap.strategyVersion + 1,
  },
  relationshipContext: boundedGap.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.notEqual(strategyPinnedVariant.inputHash, pairAB.inputHash);
assert.notEqual(strategyPinnedVariant.outputHash, pairAB.outputHash);

const directionalDefinition = definitions.find(
  (definition) => definition.config.type === 'DIRECTIONAL_EXPECTATION'
);
assert.ok(directionalDefinition);
const directionalContext = {
  desiredByA: { minimum: 0.2, maximum: 0.4 },
  desiredByB: { minimum: -0.3, maximum: -0.1 },
};
const directionalEvaluation = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-directional',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: directionalDefinition,
  relationshipContext: directionalDefinition.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  directional: directionalContext,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
const directionalEvaluationSwapped = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-directional',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: directionalDefinition,
  relationshipContext: directionalDefinition.context,
  partnerA: snapshotB,
  partnerB: snapshotA,
  directional: {
    desiredByA: directionalContext.desiredByB,
    desiredByB: directionalContext.desiredByA,
  },
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(directionalEvaluation.inputHash, directionalEvaluationSwapped.inputHash);
assert.equal(directionalEvaluation.outputHash, directionalEvaluationSwapped.outputHash);
assert.equal(
  directionalEvaluation.outputHash,
  expectedPairEvaluationOutputHash(directionalEvaluation)
);
const changedDirectionalEvaluation = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-directional-changed',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: directionalDefinition,
  relationshipContext: directionalDefinition.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  directional: {
    ...directionalContext,
    desiredByA: { minimum: 0.5, maximum: 0.7 },
  },
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.notEqual(changedDirectionalEvaluation.inputHash, directionalEvaluation.inputHash);

const roleEvaluation = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-role',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: roleCoverageDefinition,
  relationshipContext: roleCoverageDefinition.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  roleCoverage,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
const roleEvaluationSwapped = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-role',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: roleCoverageDefinition,
  relationshipContext: roleCoverageDefinition.context,
  partnerA: snapshotB,
  partnerB: snapshotA,
  roleCoverage: {
    partnerA: [...roleCoverage.partnerB].reverse(),
    partnerB: [...roleCoverage.partnerA].reverse(),
    fairnessConfidence: roleCoverage.fairnessConfidence,
  },
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(roleEvaluation.inputHash, roleEvaluationSwapped.inputHash);
assert.equal(roleEvaluation.outputHash, roleEvaluationSwapped.outputHash);
assert.equal(roleEvaluation.outputHash, expectedPairEvaluationOutputHash(roleEvaluation));
const changedRoleEvaluation = buildPairFactorEvaluationSnapshot({
  snapshotId: 'pair-evaluation-role-changed',
  pairId: 'pair-ab',
  factor: structureFactor,
  strategy: roleCoverageDefinition,
  relationshipContext: roleCoverageDefinition.context,
  partnerA: snapshotA,
  partnerB: snapshotB,
  roleCoverage: { ...roleCoverage, fairnessConfidence: 0.5 },
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.notEqual(changedRoleEvaluation.inputHash, roleEvaluation.inputHash);
assert.equal(
  replayPairFactorEvaluationSnapshot(pairAB, {
    pairId: 'pair-ab',
    factor: structureFactor,
    strategy: boundedGap,
    relationshipContext: boundedGap.context,
    partnerA: snapshotB,
    partnerB: snapshotA,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  }).status,
  'MATCH'
);

const connectionFactor = MVP_FACTOR_REGISTRY.factors.find(
  (item) => item.key === 'communication.weekly.connection'
);
const connectionMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
  (item) => item.key === 'weekly.connection.direct'
);
const weeklyInstrument = MVP_FACTOR_REGISTRY.instruments.find(
  (item) => item.key === 'weekly.mvp'
);
assert.ok(connectionFactor && connectionMeasurement && weeklyInstrument);
const endedPairEvidence = createEvidenceEvent(
  {
    eventId: 'ended-pair-self-evidence',
    idempotencyKey: 'ended-pair-self-evidence',
    actorId: 'user-a',
    subjectKind: 'INDIVIDUAL',
    subjectId: 'user-a',
    pairId: 'ended-pair',
    observationScope: 'SELF',
    factorKey: connectionFactor.key,
    measurementKey: connectionMeasurement.key,
    instrumentKey: weeklyInstrument.key,
    sourceType: connectionMeasurement.sourceType,
    sourceRef: 'ended-pair-check-in',
    ...pairContextEvidencePolicy,
    privacyClass: connectionFactor.privacyClass,
    submittedValue: { kind: 'SCALAR', value: 0.2 },
    reliabilityMultiplier: 1,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  connectionFactor,
  connectionMeasurement,
  weeklyInstrument
);
assert.equal(
  buildIndividualFactorSnapshot({
    snapshotId: 'new-pair-isolated-snapshot',
    subjectId: 'user-a',
    contextPairId: 'new-pair',
    projectionPurpose: 'PAIR_MODEL',
    factor: connectionFactor,
    events: [endedPairEvidence],
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt: NOW,
  }).status,
  'MISSING'
);
const pairEvidence = createEvidenceEvent(
  {
    eventId: 'pair-evidence-connection',
    idempotencyKey: 'pair-evidence-connection',
    actorId: 'user-a',
    subjectKind: 'PAIR',
    subjectId: 'pair-ab',
    pairId: 'pair-ab',
    observationScope: 'PAIR_DYAD',
    factorKey: connectionFactor.key,
    measurementKey: connectionMeasurement.key,
    instrumentKey: weeklyInstrument.key,
    sourceType: connectionMeasurement.sourceType,
    sourceRef: 'weekly-pair-1',
    ...pairContextEvidencePolicy,
    privacyClass: connectionFactor.privacyClass,
    submittedValue: { kind: 'SCALAR', value: 0.65 },
    reliabilityMultiplier: 1,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  connectionFactor,
  connectionMeasurement,
  weeklyInstrument
);
const pairSnapshot = buildPairFactorSnapshot({
  snapshotId: 'pair-factor-connection-1',
  pairId: 'pair-ab',
  factor: connectionFactor,
  events: [pairEvidence],
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(pairSnapshot.status, 'AVAILABLE');
const ordinalFactor: FactorDefinition = {
  ...connectionFactor,
  id: 'factor.selfcheckOrdinal',
  key: 'selfcheck.ordinal',
  type: 'VALUE',
  valueSchema: ordinalSchema,
  semantics: {
    kind: 'ORDERED',
    lowPole: { key: 'LOW', label: 'low' },
    highPole: { key: 'HIGH', label: 'high' },
    labels: ordinalSchema.levels.map((level) => ({
      key: level.value,
      label: level.label,
    })),
    interpretation: 'CAPABILITY',
  },
  aggregationStrategy: {
    type: 'WEIGHTED_MEAN',
    minimumEvidence: 1,
    expectedEvidence: 2,
  },
  confidenceRequirements: {
    minimumEvidenceReliability: 0,
    minimumSnapshotConfidence: 0,
    minimumPairConfidence: 0,
  },
  freshnessPolicy: { type: 'NON_EXPIRING' },
  definitionVersion: 1,
};
const ordinalEvidence = ([
  { value: 'LOW', rank: 0 },
  { value: 'HIGH', rank: 2 },
] as const).map((ordinal, index) => ({
  ...pairEvidence,
  eventId: `ordinal-${index}`,
  idempotencyKey: `ordinal-${index}`,
  factorKey: ordinalFactor.key,
  submittedValue: { kind: 'ORDINAL', ...ordinal } as const,
  normalizedValue: { kind: 'ORDINAL', ...ordinal } as const,
  versions: {
    ...pairEvidence.versions,
    definitionVersion: ordinalFactor.definitionVersion,
  },
  inputHash: `ordinal-${index}`,
  status: 'ACCEPTED' as const,
}));
const ordinalAggregation = aggregateFactorEvidence(
  ordinalFactor,
  ordinalEvidence,
  NOW
);
assert.equal(ordinalAggregation.status, 'AVAILABLE');
assert.deepEqual(ordinalAggregation.value, {
  kind: 'ORDINAL',
  value: 'MEDIUM',
  rank: 1,
});
const ordinalSnapshot = buildPairFactorSnapshot({
  snapshotId: 'pair-factor-ordinal',
  pairId: 'pair-ab',
  factor: ordinalFactor,
  events: ordinalEvidence,
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(ordinalSnapshot.status, 'AVAILABLE');
assert.deepEqual(ordinalSnapshot.value, ordinalAggregation.value);
const rejectedPairEvidence = createEvidenceEvent(
  {
    eventId: 'pair-evidence-connection-rejected',
    idempotencyKey: 'pair-evidence-connection-rejected',
    actorId: 'user-a',
    subjectKind: 'PAIR',
    subjectId: 'pair-ab',
    pairId: 'pair-ab',
    observationScope: 'PAIR_DYAD',
    factorKey: connectionFactor.key,
    measurementKey: connectionMeasurement.key,
    instrumentKey: weeklyInstrument.key,
    sourceType: connectionMeasurement.sourceType,
    sourceRef: 'weekly-pair-rejected',
    ...pairContextEvidencePolicy,
    privacyClass: connectionFactor.privacyClass,
    submittedValue: { kind: 'SCALAR', value: 2 },
    reliabilityMultiplier: 1,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  connectionFactor,
  connectionMeasurement,
  weeklyInstrument
);
assert.equal(rejectedPairEvidence.status, 'REJECTED');
const pairSnapshotWithRejected = buildPairFactorSnapshot({
  snapshotId: 'pair-factor-connection-with-rejected',
  pairId: 'pair-ab',
  factor: connectionFactor,
  events: [pairEvidence, rejectedPairEvidence],
  revision: 2,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: NOW,
});
assert.equal(pairSnapshotWithRejected.inputHash, pairSnapshot.inputHash);
assert.equal(pairSnapshotWithRejected.outputHash, pairSnapshot.outputHash);
assert.equal(pairSnapshot.calculatedAt.toISOString(), '2026-08-11T00:00:00.000Z');
assert.equal(pairSnapshot.effectiveFrom.toISOString(), '2026-08-11T00:00:00.000Z');
assert.equal(pairSnapshot.effectiveUntil?.toISOString(), '2026-08-12T00:00:00.000Z');
assert.equal(
  isSnapshotEffectiveAt(pairSnapshot, new Date('2026-08-11T23:59:59.999Z')),
  true
);
assert.equal(
  isSnapshotEffectiveAt(pairSnapshot, new Date('2026-08-12T00:00:00.000Z')),
  false
);
const sameWindowPairSnapshot = buildPairFactorSnapshot({
  snapshotId: 'pair-factor-connection-same-window',
  pairId: 'pair-ab',
  factor: connectionFactor,
  events: [pairEvidence],
  revision: 1,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: new Date('2026-08-11T23:59:59.999Z'),
});
assert.equal(sameWindowPairSnapshot.inputHash, pairSnapshot.inputHash);
assert.equal(sameWindowPairSnapshot.outputHash, pairSnapshot.outputHash);
const agedPairSnapshot = buildPairFactorSnapshot({
  snapshotId: 'pair-factor-connection-aged',
  pairId: 'pair-ab',
  factor: connectionFactor,
  events: [pairEvidence],
  revision: 2,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: new Date('2026-08-12T12:00:00.000Z'),
});
assert.notEqual(agedPairSnapshot.inputHash, pairSnapshot.inputHash);
assert.notEqual(agedPairSnapshot.outputHash, pairSnapshot.outputHash);
assert.ok(agedPairSnapshot.metrics.freshness < pairSnapshot.metrics.freshness);
assert.equal(agedPairSnapshot.effectiveFrom.toISOString(), '2026-08-12T00:00:00.000Z');
assert.equal(agedPairSnapshot.effectiveUntil?.toISOString(), '2026-08-13T00:00:00.000Z');
const expiredPairSnapshot = buildPairFactorSnapshot({
  snapshotId: 'pair-factor-connection-expired',
  pairId: 'pair-ab',
  factor: connectionFactor,
  events: [pairEvidence],
  revision: 3,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
  displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  calculatedAt: new Date('2026-09-09T12:00:00.000Z'),
});
assert.equal(expiredPairSnapshot.status, 'MISSING');
assert.deepEqual(expiredPairSnapshot.value, {
  kind: 'MISSING',
  reasonCode: 'EXPIRED',
});
assert.equal(expiredPairSnapshot.effectiveUntil?.toISOString(), '2026-09-10T00:00:00.000Z');
assert.equal(
  validateStoredSnapshotInterval({
    calculatedAt: pairSnapshot.calculatedAt,
    effectiveFrom: pairSnapshot.effectiveFrom,
    effectiveUntil: pairSnapshot.effectiveFrom,
  }),
  false
);

const zeroWeightEvidence = createEvidenceEvent(
  {
    eventId: 'pair-evidence-zero-weight',
    idempotencyKey: 'pair-evidence-zero-weight',
    actorId: 'user-a',
    subjectKind: 'PAIR',
    subjectId: 'pair-zero-weight',
    pairId: 'pair-zero-weight',
    observationScope: 'PAIR_DYAD',
    factorKey: connectionFactor.key,
    measurementKey: connectionMeasurement.key,
    instrumentKey: weeklyInstrument.key,
    sourceType: connectionMeasurement.sourceType,
    sourceRef: 'weekly-pair-zero-weight',
    ...pairContextEvidencePolicy,
    privacyClass: connectionFactor.privacyClass,
    submittedValue: { kind: 'SCALAR', value: 0.65 },
    reliabilityMultiplier: 0,
    observedAt: NOW,
    recordedAt: NOW,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  },
  connectionFactor,
  connectionMeasurement,
  weeklyInstrument
);
assert.equal(zeroWeightEvidence.status, 'ACCEPTED');
assert.deepEqual(
  aggregateFactorEvidence(connectionFactor, [zeroWeightEvidence], NOW).reasonCodes,
  ['EVIDENCE_RELIABILITY_BELOW_MINIMUM']
);
const zeroWeightAggregation = aggregateFactorEvidence(
  {
    ...connectionFactor,
    confidenceRequirements: {
      ...connectionFactor.confidenceRequirements,
      minimumEvidenceReliability: 0,
      minimumSnapshotConfidence: 0,
    },
    freshnessPolicy: { type: 'NON_EXPIRING' },
  },
  [zeroWeightEvidence],
  NOW
);
assert.equal(zeroWeightAggregation.status, 'INSUFFICIENT_DATA');
assert.deepEqual(zeroWeightAggregation.value, {
  kind: 'INSUFFICIENT_DATA',
  reasonCode: 'LOW_CONFIDENCE',
});
assert.deepEqual(zeroWeightAggregation.reasonCodes, ['ZERO_EFFECTIVE_WEIGHT']);
assert.equal(
  replayPairFactorSnapshot(pairSnapshot, {
    pairId: 'pair-ab',
    factor: connectionFactor,
    events: [pairEvidence],
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  }).status,
  'MATCH'
);

const matchingOnlyFactor = MVP_FACTOR_REGISTRY.factors.find(
  (item) => item.key === 'lifePlans.family.childrenIntent'
);
assert.ok(matchingOnlyFactor);
const constraintEvidence = {
  ...pairEvidence,
  eventId: 'constraint-evidence',
  idempotencyKey: 'constraint-evidence',
  factorKey: matchingOnlyFactor.key,
  submittedValue: { kind: 'CONSTRAINT', value: 'YES' } as const,
  normalizedValue: { kind: 'CONSTRAINT', value: 'YES' } as const,
  versions: {
    ...pairEvidence.versions,
    definitionVersion: matchingOnlyFactor.definitionVersion,
  },
  inputHash: 'constraint-evidence',
  status: 'ACCEPTED' as const,
};
const constraintAggregation = aggregateFactorEvidence(
  matchingOnlyFactor,
  [constraintEvidence],
  NOW
);
assert.equal(constraintAggregation.status, 'AVAILABLE');
assert.deepEqual(constraintAggregation.value, {
  kind: 'CONSTRAINT',
  value: 'YES',
});
assert.throws(
  () =>
    aggregateFactorEvidence(
      {
        ...matchingOnlyFactor,
        aggregationStrategy: {
          type: 'WEIGHTED_MEAN',
          minimumEvidence: 1,
          expectedEvidence: 1,
        },
      },
      [constraintEvidence],
      NOW
    ),
  /CONSTRAINT_AGGREGATION_STRATEGY_INVALID/
);
const partnerDisclosure = discloseFactor(
  matchingOnlyFactor,
  {
    status: 'AVAILABLE',
    value: { kind: 'CONSTRAINT', value: 'YES' },
    confidence: 1,
  },
  'PARTNER',
  { partnerDisclosure: true, matchingUse: true }
);
assert.equal(partnerDisclosure.disclosure, 'WITHHELD');
assert.equal(partnerDisclosure.reasonCode, 'PARTNER_DISCLOSURE_FORBIDDEN');
assert.equal('value' in partnerDisclosure, false);

const normalDisclosureFactor = MVP_FACTOR_REGISTRY.factors.find(
  (item) => item.privacyClass === 'NORMAL'
);
const sensitiveDisclosureFactor = MVP_FACTOR_REGISTRY.factors.find(
  (item) => item.privacyClass === 'SENSITIVE'
);
assert.ok(normalDisclosureFactor);
assert.ok(sensitiveDisclosureFactor);
const normalPartnerDisclosure = discloseFactor(
  normalDisclosureFactor,
  {
    status: 'AVAILABLE',
    value: { kind: 'SCALAR', value: 0.72 },
    confidence: 0.91,
  },
  'PARTNER',
  { partnerDisclosure: true, matchingUse: true }
);
assert.equal(normalPartnerDisclosure.disclosure, 'SUMMARY_ONLY');
assert.equal(normalPartnerDisclosure.reasonCode, 'PARTNER_SAFE_SUMMARY');
assert.equal('value' in normalPartnerDisclosure, false);
const sensitivePartnerDisclosure = discloseFactor(
  sensitiveDisclosureFactor,
  {
    status: 'AVAILABLE',
    value: { kind: 'SCALAR', value: 0.72 },
    confidence: 0.91,
  },
  'PARTNER',
  { partnerDisclosure: true, matchingUse: true }
);
assert.equal(sensitivePartnerDisclosure.disclosure, 'WITHHELD');
assert.equal(
  sensitivePartnerDisclosure.reasonCode,
  'PARTNER_DISCLOSURE_FORBIDDEN'
);
assert.equal('value' in sensitivePartnerDisclosure, false);
assert.equal(
  discloseFactor(
    matchingOnlyFactor,
    {
      status: 'AVAILABLE',
      value: { kind: 'CONSTRAINT', value: 'YES' },
      confidence: 1,
    },
    'MATCHING_ENGINE',
    { partnerDisclosure: true, matchingUse: false }
  ).disclosure,
  'WITHHELD'
);

const availableSnapshot = (
  factorKey: string,
  value: IndividualFactorSnapshot['value'],
  confidence = 0.9
): IndividualFactorSnapshot => ({
  snapshotId: `recommendation-${factorKey}`,
  subjectId: 'user-a',
  projectionPurpose: 'RECOMMENDATION',
  factorKey,
  revision: 1,
  status: 'AVAILABLE',
  value,
  metrics: {
    confidence,
    coverage: 1,
    freshness: 1,
    consistency: 1,
    evidenceCount: 3,
  },
  evidenceIds: [],
  versions: {
    registryVersion: 1,
    definitionVersion: 1,
    algorithmVersion: 1,
    snapshotVersion: 1,
    displayVersion: 1,
    measurementRefs: [],
    instrumentRefs: [],
  },
  inputHash: `input-${factorKey}`,
  outputHash: `output-${factorKey}`,
  calculatedAt: NOW,
  effectiveFrom: new Date('2026-08-11T00:00:00.000Z'),
});
const recommendationSnapshots = [
  availableSnapshot('communication.weekly.connection', { kind: 'SCALAR', value: 0.4 }),
  availableSnapshot('communication.weekly.tension', { kind: 'SCALAR', value: 0.3 }),
  availableSnapshot('wellbeing.current.overload', { kind: 'SCALAR', value: 0.4 }),
  availableSnapshot('communication.conflict.repairSkill', {
    kind: 'MASTERY',
    score01: 0.6,
    level: 'INTERMEDIATE',
  }),
];
const recommended = recommendActions({
  actions: MVP_FACTOR_REGISTRY.actions,
  context: 'COMMITTED_RELATIONSHIP',
  factorSnapshots: recommendationSnapshots,
  pairEvaluations: [],
  blockedActionKeys: [],
  limit: 3,
});
const recommendedReversed = recommendActions({
  actions: [...MVP_FACTOR_REGISTRY.actions].reverse(),
  context: 'COMMITTED_RELATIONSHIP',
  factorSnapshots: [...recommendationSnapshots].reverse(),
  pairEvaluations: [],
  blockedActionKeys: [],
  limit: 3,
});
assert.deepEqual(recommended, recommendedReversed);
assert.ok(recommended.recommendations.length >= 2);

const collectionNames = [
  DefinitionRegistryRelease.collection.collectionName,
  EvidenceEvent.collection.collectionName,
  IndividualFactorSnapshotModel.collection.collectionName,
  PairFactorSnapshotModel.collection.collectionName,
  PairFactorEvaluationSnapshotModel.collection.collectionName,
];
assert.deepEqual(collectionNames, [
  'factor_definition_registry_releases',
  'factor_evidence_events',
  'individual_factor_snapshots',
  'pair_factor_snapshots',
  'pair_factor_evaluation_snapshots',
]);
for (const model of [
  DefinitionRegistryRelease,
  EvidenceEvent,
  IndividualFactorSnapshotModel,
  PairFactorSnapshotModel,
  PairFactorEvaluationSnapshotModel,
]) {
  assert.ok(
    model.schema.indexes().some((index) => index[1].unique === true),
    `${model.modelName} must expose a canonical unique index`
  );
}

const expectedFactorTypes: readonly FactorDefinition['type'][] = [
  'TRAIT',
  'STATE',
  'SKILL',
  'PREFERENCE_AXIS',
  'VALUE',
  'NEED',
  'EXPECTATION',
  'ROLE_PREFERENCE',
  'ROLE_CAPABILITY',
  'CONSTRAINT',
  'OUTCOME',
];
assert.equal(new Set(expectedFactorTypes).size, 11);

console.log('factor-engine selfcheck: ok');
