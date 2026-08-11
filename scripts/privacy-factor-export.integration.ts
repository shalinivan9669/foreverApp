import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { disclosePairEvaluation } from '@/domain/model/privacy/disclosure';
import { privacyExportService } from '@/domain/services/privacyExport.service';
import { EventLog } from '@/models/EventLog';
import {
  EvidenceEvent,
  type EvidenceEventType,
} from '@/models/EvidenceEvent';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import { Pair } from '@/models/Pair';
import {
  PairFactorEvaluationSnapshot,
  type PairFactorEvaluationSnapshotType,
} from '@/models/PairFactorEvaluationSnapshot';
import { User } from '@/models/User';

const EXPECTED_SECTION_LIMIT = 250;
const EXPECTED_EVIDENCE_IDS_LIMIT = 100;
const EXPECTED_FACTOR_SET_LIMIT = 50;
const EXPECTED_IDENTIFIER_LIMIT = 256;
const EXPECTED_TEXT_LIMIT = 4_000;
const FACTOR_KEY = 'communication.weekly.connection';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const parsedMongoUri = new URL(mongodbUri);
const databaseName = decodeURIComponent(parsedMongoUri.pathname.replace(/^\//, ''));
const expectedReplicaSet = parsedMongoUri.searchParams.get('replicaSet');
const allowedLocalHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
if (
  parsedMongoUri.protocol !== 'mongodb:' ||
  !allowedLocalHosts.has(parsedMongoUri.hostname) ||
  !databaseName.endsWith('_test') ||
  !expectedReplicaSet
) {
  throw new Error(
    'Factor privacy integration requires an explicit local replica-set Mongo URI and a database ending in _test'
  );
}

const runId = randomUUID();
const ownerUserId = `factor-privacy-owner-${runId}`;
const partnerUserId = `factor-privacy-partner-${runId}`;
const outsiderUserId = `factor-privacy-outsider-${runId}`;
const ownerPairId = new Types.ObjectId();
const outsiderPairId = new Types.ObjectId();
const ownerPairKey = [ownerUserId, partnerUserId].sort().join('|');
const outsiderPairKey = [partnerUserId, outsiderUserId].sort().join('|');
const ownerEvidenceMarker = `owner-evidence-${runId}`;
const ownerSnapshotMarker = `owner-snapshot-${runId}`;
const partnerEvidenceSecret = `partner-evidence-secret-${runId}`;
const observerEvidenceSecret = `observer-evidence-secret-${runId}`;
const dyadEvidenceSecret = `dyad-evidence-secret-${runId}`;
const mismatchedObservedSecret = `mismatched-observed-secret-${runId}`;
const partnerSnapshotSecret = `partner-snapshot-secret-${runId}`;
const pairInternalSnapshotSecret = `pair-internal-snapshot-secret-${runId}`;
const outsiderPairSecret = `outsider-pair-secret-${runId}`;
const baseTime = new Date('2026-08-11T08:00:00.000Z');

const userFixture = (id: string, username: string) => ({
  id,
  username,
  avatar: 'integration-avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'in_relationship' as const,
  },
  vectors: {},
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 50,
  },
  profile: {
    onboarding: {
      seeking: {
        valuedQualities: ['kindness', 'honesty', 'respect'],
        relationshipPriority: 'emotional_intimacy' as const,
        minExperience: 'none' as const,
        dealBreakers: 'none',
        firstDateSetting: 'cafe' as const,
        weeklyTimeCommitment: '5-10h' as const,
      },
    },
  },
});

const evidenceVersions = {
  registryVersion: 2,
  definitionVersion: 2,
  measurementVersion: 1,
  instrumentVersion: 1,
  algorithmVersion: 1,
};

const snapshotVersions = {
  registryVersion: 2,
  definitionVersion: 2,
  algorithmVersion: 1,
  snapshotVersion: 1,
  displayVersion: 1,
  measurementRefs: [{ key: 'weekly.connection', version: 1 }],
  instrumentRefs: [{ key: 'weekly-check-in', version: 1 }],
};

const snapshotCalculatedAt = new Date('2026-08-11T00:00:00.000Z');

const evidenceFixture = (index: number): EvidenceEventType => {
  const isTextBoundary = index === EXPECTED_SECTION_LIMIT;
  const isSetBoundary = index === EXPECTED_SECTION_LIMIT - 1;
  const storedValue = isTextBoundary
    ? {
        kind: 'TEXT' as const,
        textValue: `${ownerEvidenceMarker}-${'x'.repeat(EXPECTED_TEXT_LIMIT + 500)}`,
      }
    : isSetBoundary
      ? {
          kind: 'SET' as const,
          setValues: Array.from(
            { length: EXPECTED_FACTOR_SET_LIMIT + 1 },
            (_, item) => `set-${item}`
          ),
        }
      : { kind: 'SCALAR' as const, scalarValue: index / EXPECTED_SECTION_LIMIT };
  const at = new Date(baseTime.getTime() + index);
  return {
    eventId: `owner-evidence-${runId}-${index}`,
    idempotencyKey: `owner-evidence-idempotency-${runId}-${index}`,
    actorId: ownerUserId,
    subjectKind: 'INDIVIDUAL',
    subjectId: ownerUserId,
    pairId: ownerPairId.toString(),
    observationScope: 'SELF',
    factorKey: FACTOR_KEY,
    measurementKey: 'weekly.connection',
    instrumentKey: 'weekly-check-in',
    sourceType: 'CHECK_IN',
    sourceRef: isTextBoundary
      ? `weekly:${'r'.repeat(EXPECTED_IDENTIFIER_LIMIT + 100)}`
      : `weekly:${index}`,
    sourceRevision: 'weekly-check-in-v1',
    sourceHash: index.toString(16).padStart(64, '0'),
    submittedValue: storedValue,
    normalizedValue: storedValue,
    reliability: 0.9,
    observedAt: at,
    recordedAt: at,
    context: 'COMMITTED_RELATIONSHIP',
    purpose: 'PAIR_MODEL',
    privacyClass: 'PRIVATE',
    captureMode: 'PAIR_MODEL_ONLY',
    policyVersion: 'factor-privacy-policy-v1',
    consentRevision: 'factor-privacy-consent-v1',
    retentionClass: 'PAIR_CONTEXT',
    versions: evidenceVersions,
    inputHash: `owner-input-hash-${runId}-${index}`,
    status: 'ACCEPTED',
  };
};

const privateEvidenceFixture = (params: {
  eventId: string;
  actorId: string;
  subjectKind: EvidenceEventType['subjectKind'];
  subjectId: string;
  observationScope: EvidenceEventType['observationScope'];
  secret: string;
  observedSubjectId?: string;
}): EvidenceEventType => ({
  eventId: params.eventId,
  idempotencyKey: `${params.eventId}-idempotency`,
  actorId: params.actorId,
  subjectKind: params.subjectKind,
  subjectId: params.subjectId,
  pairId: ownerPairId.toString(),
  observationScope: params.observationScope,
  ...(params.observedSubjectId
    ? { observedSubjectId: params.observedSubjectId }
    : {}),
  factorKey: FACTOR_KEY,
  measurementKey: 'weekly.connection',
  instrumentKey: 'weekly-check-in',
  sourceType: 'CHECK_IN',
  sourceRef: params.secret,
  sourceRevision: 'weekly-check-in-v1',
  sourceHash: 'f'.repeat(64),
  submittedValue: { kind: 'TEXT', textValue: params.secret },
  normalizedValue: { kind: 'TEXT', textValue: params.secret },
  reliability: 0.8,
  observedAt: baseTime,
  recordedAt: baseTime,
  context: 'COMMITTED_RELATIONSHIP',
  purpose: 'PAIR_MODEL',
  privacyClass: 'PRIVATE',
  captureMode: 'PAIR_MODEL_ONLY',
  policyVersion: 'factor-privacy-policy-v1',
  consentRevision: 'factor-privacy-consent-v1',
  retentionClass: 'PAIR_CONTEXT',
  versions: evidenceVersions,
  inputHash: `${params.secret}-hash`,
  status: 'ACCEPTED',
});

const individualSnapshotFixture = (
  index: number
): IndividualFactorSnapshotType => ({
  snapshotId: `owner-individual-snapshot-${runId}-${index}`,
  subjectId: ownerUserId,
  contextPairId: ownerPairId.toString(),
  projectionPurpose: 'PAIR_MODEL',
  factorKey: FACTOR_KEY,
  revision: index,
  status: 'AVAILABLE',
  value:
    index === EXPECTED_SECTION_LIMIT
      ? { kind: 'CATEGORY', categoryValue: ownerSnapshotMarker }
      : { kind: 'SCALAR', scalarValue: index / EXPECTED_SECTION_LIMIT },
  metrics: {
    confidence: 0.82,
    coverage: 0.8,
    freshness: 0.9,
    consistency: 0.75,
    evidenceCount: index === EXPECTED_SECTION_LIMIT ? 101 : 1,
  },
  evidenceIds:
    index === EXPECTED_SECTION_LIMIT
      ? Array.from({ length: EXPECTED_EVIDENCE_IDS_LIMIT + 1 }, (_, item) =>
          item === 0
            ? `evidence-${'i'.repeat(EXPECTED_IDENTIFIER_LIMIT + 100)}`
            : `evidence-${runId}-${item}`
        )
      : [`owner-evidence-${runId}-${index}`],
  versions: snapshotVersions,
  inputHash: `owner-individual-input-${runId}-${index}`,
  outputHash: `owner-individual-output-${runId}-${index}`,
  calculatedAt: new Date(snapshotCalculatedAt.getTime()),
  effectiveFrom: new Date(snapshotCalculatedAt.getTime()),
});

const pairEvaluationFixture = (
  index: number
): PairFactorEvaluationSnapshotType => ({
  snapshotId: `owner-pair-evaluation-${runId}-${index}`,
  pairId: ownerPairId.toString(),
  memberAId: ownerUserId,
  memberBId: partnerUserId,
  factorKey: FACTOR_KEY,
  context: 'COMMITTED_RELATIONSHIP',
  strategy: 'MINIMUM_BOTH',
  strategyVersion: 1,
  directionality: 'SYMMETRIC',
  revision: index,
  evaluation: {
    strategy: 'MINIMUM_BOTH',
    context: 'COMMITTED_RELATIONSHIP',
    status: 'TENSION',
    internalFit: 0.137,
    confidence: 0.82,
    reasonCodes: ['VALUES_DIFFER'],
    actionability: 'AWARENESS',
    directionalFit: { aAcceptsB: 0.21, bAcceptsA: 0.79 },
    roleMetrics: {
      coverage: 0.61,
      loadImbalance: 0.39,
      preferenceSatisfaction: 0.58,
    },
  },
  individualSnapshotIds: [
    `owner-snapshot-ref-${runId}-${index}`,
    `${pairInternalSnapshotSecret}-${index}`,
  ],
  pairSnapshotId: `${pairInternalSnapshotSecret}-pair-${index}`,
  versions: snapshotVersions,
  inputHash: `${pairInternalSnapshotSecret}-input-${index}`,
  outputHash: `${pairInternalSnapshotSecret}-output-${index}`,
  calculatedAt: new Date(snapshotCalculatedAt.getTime()),
  effectiveFrom: new Date(snapshotCalculatedAt.getTime()),
});

const seedFixtures = async (): Promise<void> => {
  await Promise.all([
    User.createIndexes(),
    Pair.createIndexes(),
    EvidenceEvent.createIndexes(),
    IndividualFactorSnapshot.createIndexes(),
    PairFactorEvaluationSnapshot.createIndexes(),
    EventLog.createIndexes(),
  ]);

  await User.create([
    userFixture(ownerUserId, 'factor-privacy-owner'),
    userFixture(partnerUserId, 'factor-privacy-partner'),
    userFixture(outsiderUserId, 'factor-privacy-outsider'),
  ]);
  await Pair.create([
    {
      _id: ownerPairId,
      members: [ownerUserId, partnerUserId],
      key: ownerPairKey,
      status: 'active',
      contextVersion: 'pair-context-v1',
    },
    {
      _id: outsiderPairId,
      members: [partnerUserId, outsiderUserId],
      key: outsiderPairKey,
      status: 'active',
      contextVersion: 'pair-context-v1',
    },
  ]);

  const ownerEvidenceRows = Array.from(
    { length: EXPECTED_SECTION_LIMIT + 1 },
    (_, index) => evidenceFixture(index)
  );
  const privateEvidenceRows: EvidenceEventType[] = [
    privateEvidenceFixture({
      eventId: `partner-evidence-${runId}`,
      actorId: partnerUserId,
      subjectKind: 'INDIVIDUAL',
      subjectId: partnerUserId,
      observationScope: 'SELF',
      secret: partnerEvidenceSecret,
    }),
    privateEvidenceFixture({
      eventId: `observer-evidence-${runId}`,
      actorId: partnerUserId,
      subjectKind: 'INDIVIDUAL',
      subjectId: ownerUserId,
      observationScope: 'OBSERVER_REPORT',
      observedSubjectId: ownerUserId,
      secret: observerEvidenceSecret,
    }),
    privateEvidenceFixture({
      eventId: `dyad-evidence-${runId}`,
      actorId: ownerUserId,
      subjectKind: 'PAIR',
      subjectId: ownerPairId.toString(),
      observationScope: 'PAIR_DYAD',
      observedSubjectId: partnerUserId,
      secret: dyadEvidenceSecret,
    }),
    privateEvidenceFixture({
      eventId: `mismatched-observed-${runId}`,
      actorId: ownerUserId,
      subjectKind: 'INDIVIDUAL',
      subjectId: ownerUserId,
      observationScope: 'SELF',
      observedSubjectId: partnerUserId,
      secret: mismatchedObservedSecret,
    }),
  ];
  await EvidenceEvent.collection.insertMany([
    ...ownerEvidenceRows,
    ...privateEvidenceRows,
  ]);

  const ownerIndividualRows = Array.from(
    { length: EXPECTED_SECTION_LIMIT + 1 },
    (_, index) => individualSnapshotFixture(index)
  );
  const partnerIndividualRow: IndividualFactorSnapshotType = {
    ...individualSnapshotFixture(EXPECTED_SECTION_LIMIT + 1),
    snapshotId: `partner-individual-snapshot-${runId}`,
    subjectId: partnerUserId,
    value: { kind: 'CATEGORY', categoryValue: partnerSnapshotSecret },
    inputHash: `${partnerSnapshotSecret}-input`,
    outputHash: `${partnerSnapshotSecret}-output`,
  };
  await IndividualFactorSnapshot.collection.insertMany([
    ...ownerIndividualRows,
    partnerIndividualRow,
  ]);

  const ownerPairEvaluationRows = Array.from(
    { length: EXPECTED_SECTION_LIMIT + 1 },
    (_, index) => pairEvaluationFixture(index)
  );
  const mismatchedMemberRow: PairFactorEvaluationSnapshotType = {
    ...pairEvaluationFixture(EXPECTED_SECTION_LIMIT + 1),
    snapshotId: `mismatched-member-pair-evaluation-${runId}`,
    memberAId: ownerUserId,
    memberBId: outsiderUserId,
    individualSnapshotIds: [
      `${outsiderPairSecret}-a`,
      `${outsiderPairSecret}-b`,
    ],
    inputHash: `${outsiderPairSecret}-mismatch-input`,
    outputHash: `${outsiderPairSecret}-mismatch-output`,
  };
  const outsiderPairRow: PairFactorEvaluationSnapshotType = {
    ...pairEvaluationFixture(EXPECTED_SECTION_LIMIT + 2),
    snapshotId: `outsider-pair-evaluation-${runId}`,
    pairId: outsiderPairId.toString(),
    memberAId: partnerUserId,
    memberBId: outsiderUserId,
    revision: 0,
    individualSnapshotIds: [
      `${outsiderPairSecret}-a`,
      `${outsiderPairSecret}-b`,
    ],
    inputHash: `${outsiderPairSecret}-input`,
    outputHash: `${outsiderPairSecret}-output`,
  };
  await PairFactorEvaluationSnapshot.collection.insertMany([
    ...ownerPairEvaluationRows,
    mismatchedMemberRow,
    outsiderPairRow,
  ]);
};

const cleanupRunScope = async (): Promise<void> => {
  await Promise.all([
    EventLog.deleteMany({ 'actor.userId': ownerUserId }),
    EvidenceEvent.deleteMany({
      $or: [
        { actorId: { $in: [ownerUserId, partnerUserId] } },
        { subjectId: { $in: [ownerUserId, partnerUserId] } },
        { pairId: { $in: [ownerPairId.toString(), outsiderPairId.toString()] } },
      ],
    }),
    IndividualFactorSnapshot.deleteMany({
      subjectId: { $in: [ownerUserId, partnerUserId] },
    }),
    PairFactorEvaluationSnapshot.deleteMany({
      pairId: { $in: [ownerPairId.toString(), outsiderPairId.toString()] },
    }),
    Pair.deleteMany({ _id: { $in: [ownerPairId, outsiderPairId] } }),
    User.deleteMany({ id: { $in: [ownerUserId, partnerUserId, outsiderUserId] } }),
  ]);

  const remaining = await Promise.all([
    EventLog.countDocuments({ 'actor.userId': ownerUserId }),
    EvidenceEvent.countDocuments({
      eventId: { $regex: runId },
    }),
    IndividualFactorSnapshot.countDocuments({
      snapshotId: { $regex: runId },
    }),
    PairFactorEvaluationSnapshot.countDocuments({
      snapshotId: { $regex: runId },
    }),
    Pair.countDocuments({ _id: { $in: [ownerPairId, outsiderPairId] } }),
    User.countDocuments({ id: { $in: [ownerUserId, partnerUserId, outsiderUserId] } }),
  ]);
  assert.equal(
    remaining.reduce((sum, count) => sum + count, 0),
    0,
    `factor privacy cleanup left run-scoped records: ${remaining.join(',')}`
  );
};

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    socketTimeoutMS: 15_000,
    maxPoolSize: 20,
  });

  try {
    const mongoDatabase = mongoose.connection.db;
    assert.ok(mongoDatabase, 'Mongo database connection is unavailable');
    const hello = await mongoDatabase.admin().command({ hello: 1 });
    assert.equal(
      hello.setName,
      expectedReplicaSet,
      'Mongo connection is not using the requested replica set'
    );

    await seedFixtures();
    const privacyExport = await privacyExportService.buildOwnerExport({
      ownerUserId,
      auditRequest: {
        route: '/integration/privacy-factor-export',
        method: 'TEST',
      },
    });
    const factorExport = privacyExport.factorEngine;
    const exportJson = JSON.stringify(privacyExport);

    assert.equal(
      factorExport.manifest.manifestVersion,
      'factor-engine-privacy-manifest-v1'
    );
    assert.equal(
      factorExport.manifest.projectionVersion,
      'factor-engine-owner-export-v1'
    );
    assert.equal(
      factorExport.manifest.disclosurePolicyVersion,
      'central-factor-disclosure-v1'
    );
    assert.deepEqual(factorExport.manifest.bounds, {
      evidenceEvents: EXPECTED_SECTION_LIMIT,
      individualFactorSnapshots: EXPECTED_SECTION_LIMIT,
      pairEvaluationSummaries: EXPECTED_SECTION_LIMIT,
      pairContexts: 100,
      evidenceIdsPerSnapshot: EXPECTED_EVIDENCE_IDS_LIMIT,
      setValuesPerFactorValue: EXPECTED_FACTOR_SET_LIMIT,
      maxTextChars: EXPECTED_TEXT_LIMIT,
      maxIdentifierChars: EXPECTED_IDENTIFIER_LIMIT,
    });

    for (const section of [
      factorExport.evidenceEvents,
      factorExport.individualFactorSnapshots,
      factorExport.pairEvaluationSummaries,
    ]) {
      assert.equal(section.limit, EXPECTED_SECTION_LIMIT);
      assert.equal(section.items.length, EXPECTED_SECTION_LIMIT);
      assert.equal(section.truncated, true);
    }

    const textBoundary = factorExport.evidenceEvents.items.find(
      (item) => item.submittedValue.kind === 'TEXT'
    );
    assert.equal(textBoundary?.submittedValue.kind, 'TEXT');
    if (textBoundary?.submittedValue.kind !== 'TEXT') {
      throw new Error('bounded owner text evidence is missing');
    }
    assert.equal(textBoundary.submittedValue.value.length, EXPECTED_TEXT_LIMIT);
    assert.equal(textBoundary.sourceRef.length, EXPECTED_IDENTIFIER_LIMIT);
    assert.match(textBoundary.submittedValue.value, new RegExp(ownerEvidenceMarker));
    assert.deepEqual(
      {
        sourceRevision: textBoundary.sourceRevision,
        sourceHash: textBoundary.sourceHash,
        context: textBoundary.context,
        purpose: textBoundary.purpose,
        privacyClass: textBoundary.privacyClass,
        captureMode: textBoundary.captureMode,
        policyVersion: textBoundary.policyVersion,
        consentRevision: textBoundary.consentRevision,
        retentionClass: textBoundary.retentionClass,
      },
      {
        sourceRevision: 'weekly-check-in-v1',
        sourceHash: EXPECTED_SECTION_LIMIT.toString(16).padStart(64, '0'),
        context: 'COMMITTED_RELATIONSHIP',
        purpose: 'PAIR_MODEL',
        privacyClass: 'PRIVATE',
        captureMode: 'PAIR_MODEL_ONLY',
        policyVersion: 'factor-privacy-policy-v1',
        consentRevision: 'factor-privacy-consent-v1',
        retentionClass: 'PAIR_CONTEXT',
      }
    );

    const setBoundary = factorExport.evidenceEvents.items.find(
      (item) => item.submittedValue.kind === 'SET'
    );
    assert.equal(setBoundary?.submittedValue.kind, 'SET');
    if (setBoundary?.submittedValue.kind !== 'SET') {
      throw new Error('bounded owner set evidence is missing');
    }
    assert.equal(
      setBoundary.submittedValue.values.length,
      EXPECTED_FACTOR_SET_LIMIT
    );

    const ownerSnapshot = factorExport.individualFactorSnapshots.items.find(
      (item) => item.value.kind === 'CATEGORY'
    );
    assert.equal(ownerSnapshot?.value.kind, 'CATEGORY');
    if (ownerSnapshot?.value.kind !== 'CATEGORY') {
      throw new Error('owner individual factor snapshot is missing');
    }
    assert.equal(ownerSnapshot.value.value, ownerSnapshotMarker);
    assert.equal(ownerSnapshot.projectionPurpose, 'PAIR_MODEL');
    assert.equal(ownerSnapshot.evidenceIds.length, EXPECTED_EVIDENCE_IDS_LIMIT);
    assert.equal(ownerSnapshot.evidenceIdsTruncated, true);
    assert.equal(ownerSnapshot.evidenceIdsLimit, EXPECTED_EVIDENCE_IDS_LIMIT);
    assert.equal(ownerSnapshot.evidenceIds[0]?.length, EXPECTED_IDENTIFIER_LIMIT);

    const pairSummary = factorExport.pairEvaluationSummaries.items[0];
    assert.ok(pairSummary, 'pair factor evaluation summary is missing');
    const expectedDisclosure = disclosePairEvaluation(
      pairEvaluationFixture(EXPECTED_SECTION_LIMIT),
      'PAIR_MEMBER',
      true
    );
    assert.equal(expectedDisclosure.disclosure, 'SUMMARY_ONLY');
    const { pairId, calculatedAt, ...actualDisclosure } = pairSummary;
    assert.equal(pairId, ownerPairId.toString());
    assert.equal(calculatedAt, baseTime.toISOString().replace('.000Z', '.250Z'));
    assert.deepEqual(actualDisclosure, expectedDisclosure);
    assert.deepEqual(Object.keys(pairSummary).sort(), [
      'actionability',
      'calculatedAt',
      'confidenceBand',
      'disclosure',
      'factorKey',
      'pairId',
      'reasonCode',
      'status',
    ]);

    for (const secret of [
      partnerUserId,
      outsiderUserId,
      partnerEvidenceSecret,
      observerEvidenceSecret,
      dyadEvidenceSecret,
      mismatchedObservedSecret,
      partnerSnapshotSecret,
      pairInternalSnapshotSecret,
      outsiderPairSecret,
    ]) {
      assert.equal(exportJson.includes(secret), false, `export leaked ${secret}`);
    }
    assert.doesNotMatch(
      JSON.stringify(factorExport.pairEvaluationSummaries),
      /"memberAId"|"memberBId"|"individualSnapshotIds"|"pairSnapshotId"|"internalFit"|"directionalFit"|"roleMetrics"|"inputHash"|"outputHash"|"confidence":/
    );
    assert.equal(
      await EventLog.countDocuments({
        'actor.userId': ownerUserId,
        event: 'PRIVACY_EXPORT_CREATED',
        'metadata.exportVersion': 'owner-export-v1',
      }),
      1
    );

    console.log(
      JSON.stringify({
        suite: 'privacy-factor-export',
        status: 'passed',
        database: databaseName,
        evidence: {
          ownerEvidenceItems: factorExport.evidenceEvents.items.length,
          ownerSnapshotItems:
            factorExport.individualFactorSnapshots.items.length,
          pairSummaryItems:
            factorExport.pairEvaluationSummaries.items.length,
          pairDisclosure: pairSummary.disclosure,
          partnerRawDataProjected: false,
          internalPairIdentifiersProjected: false,
        },
      })
    );
  } finally {
    if (mongoose.connection.readyState === 1) {
      await cleanupRunScope();
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
