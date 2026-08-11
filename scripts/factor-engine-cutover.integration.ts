import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  processWeeklyFactorCheckIn,
  readLatestInternalWeeklyPairEvaluations,
} from '@/domain/services/factorEngineRuntime.service';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import {
  runFactorEngineMigration,
} from './lib/factor-engine-migration';
import {
  runPrivacyRequestV2Migration,
} from './lib/privacy-request-v2-migration';

type IndexKey = Record<string, number>;

const baseMongoUri =
  process.env.FACTOR_ENGINE_TEST_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  'mongodb://127.0.0.1:27018/foreverapp_factor_cutover_test?directConnection=true';
const parsedUri = new URL(baseMongoUri);
const allowedLocalHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const configuredDatabase = decodeURIComponent(parsedUri.pathname.replace(/^\//, ''));
if (
  parsedUri.protocol !== 'mongodb:' ||
  !allowedLocalHosts.has(parsedUri.hostname) ||
  !configuredDatabase.endsWith('_test') ||
  parsedUri.searchParams.get('directConnection') !== 'true'
) {
  throw new Error(
    'Factor cutover integration requires a local direct Mongo URI and a database ending in _test'
  );
}

const runId = randomUUID().replaceAll('-', '');
const isolatedDatabase = `foreverapp_factor_cutover_${runId}_test`;
parsedUri.pathname = `/${isolatedDatabase}`;
const mongodbUri = parsedUri.toString();
process.env.MONGODB_URI = mongodbUri;
process.env.JWT_SECRET ??= 'factor-cutover-integration-secret-32-chars-minimum';

const legacyOnlyUser = `legacy-only-${runId}`;
const mixedA = `mixed-a-${runId}`;
const mixedB = `mixed-b-${runId}`;
const newOnlyUser = `new-only-${runId}`;
const newOnlyPartner = `new-only-partner-${runId}`;
const invalidUser = `invalid-${runId}`;
const invalidPartner = `invalid-partner-${runId}`;
const onboardingUser = `onboarding-${runId}`;
const privacyUser = `privacy-${runId}`;
const mixedPairId = new Types.ObjectId();
const newOnlyPairId = new Types.ObjectId();
const invalidPairId = new Types.ObjectId();
const newOnlyCheckInId = new Types.ObjectId();
const baseDate = new Date('2026-08-11T09:00:00.000Z');
const migrationAsOf = new Date('2026-08-11T09:01:00.000Z');

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

const rawAnswers = (offset: number) => ({
  closeness: 0.7 + offset,
  fatigue: 0.3,
  irritation: 0.2,
  readiness: 0.8 - offset,
  unresolvedTopic: false,
});

const onboardingAnswers = [
  {
    questionId: 'repair_confidence',
    questionRevision: 'repair-confidence-v1',
    answerRevision: 1,
    capturePolicy: 'PRIVATE',
    value: { kind: 'single', optionId: 'sometimes_manage' },
    answeredAt: baseDate,
  },
  {
    questionId: 'planning_style',
    questionRevision: 'planning-style-v1',
    answerRevision: 1,
    capturePolicy: 'PAIR_MODEL_ONLY',
    value: { kind: 'single', optionId: 'flexible_window' },
    answeredAt: baseDate,
  },
  {
    questionId: 'children_intent',
    questionRevision: 'children-intent-v1',
    answerRevision: 1,
    capturePolicy: 'PRIVATE',
    value: { kind: 'skipped' },
    answeredAt: baseDate,
  },
] as const;

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    directConnection: true,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });

  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');
  try {
    await database.collection('pairs').insertMany([
      {
        _id: mixedPairId,
        members: [mixedA, mixedB],
        key: [mixedA, mixedB].sort().join('|'),
        status: 'active',
        contextVersion: 'pair-context-v1',
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        _id: newOnlyPairId,
        members: [newOnlyUser, newOnlyPartner],
        key: [newOnlyUser, newOnlyPartner].sort().join('|'),
        status: 'active',
        contextVersion: 'pair-context-v1',
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        _id: invalidPairId,
        members: [invalidUser, invalidPartner],
        key: [invalidUser, invalidPartner].sort().join('|'),
        status: 'active',
        contextVersion: 'pair-context-v1',
        createdAt: baseDate,
        updatedAt: baseDate,
      },
    ]);
    await database.collection('users').insertMany([
      { id: legacyOnlyUser, vectors: { communication: { level: 0.91 } } },
      { id: mixedA, vectors: { communication: { level: 0.12 } } },
    ]);

    const newOnly = await processWeeklyFactorCheckIn({
      pairId: newOnlyPairId.toHexString(),
      memberIds: [newOnlyUser, newOnlyPartner],
      actorId: newOnlyUser,
      checkInId: newOnlyCheckInId.toHexString(),
      ...rawAnswers(0),
      observedAt: baseDate,
      recordedAt: baseDate,
    });
    assert.equal(newOnly.evidence.length, 4);
    await database.collection('weekly_checkins').insertMany([
      {
        _id: newOnlyCheckInId,
        userId: newOnlyUser,
        pairId: newOnlyPairId,
        weekKey: '2026-W33',
        answers: rawAnswers(0),
        computed: {
          factorEngine: {
            status: 'MATERIALIZED',
            registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
            evidenceEventIds: newOnly.evidence.map((item) => item.eventId),
            individualSnapshotIds: newOnly.individualSnapshots.map(
              (item) => item.snapshotId
            ),
            pairEvaluationSnapshotIds: [],
          },
        },
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        _id: new Types.ObjectId(),
        userId: mixedA,
        pairId: mixedPairId.toHexString(),
        weekKey: '2026-W33',
        answers: rawAnswers(0),
        computed: { factorEngine: { status: 'PENDING' } },
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        _id: new Types.ObjectId(),
        userId: mixedB,
        pairId: mixedPairId.toHexString(),
        weekKey: '2026-W33',
        answers: rawAnswers(-0.05),
        computed: { factorEngine: { status: 'PENDING' } },
        createdAt: new Date(baseDate.getTime() + 1_000),
        updatedAt: new Date(baseDate.getTime() + 1_000),
      },
      {
        _id: new Types.ObjectId(),
        userId: invalidUser,
        pairId: invalidPairId.toHexString(),
        weekKey: '2026-W34',
        answers: { ...rawAnswers(0), closeness: 7 },
        computed: { factorEngine: { status: 'PENDING' } },
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        _id: new Types.ObjectId(),
        userId: newOnlyPartner,
        pairId: newOnlyPairId,
        weekKey: '2026-W35',
        answers: rawAnswers(0),
        computed: { factorEngine: { status: 'PENDING' } },
        createdAt: new Date(migrationAsOf.getTime() + 60_000),
        updatedAt: new Date(migrationAsOf.getTime() + 60_000),
      },
      {
        _id: new Types.ObjectId(),
        userId: newOnlyPartner,
        pairId: newOnlyPairId,
        weekKey: '2026-W36',
        answers: rawAnswers(0),
        computed: { factorEngine: { status: 'PENDING' } },
        createdAt: baseDate,
        updatedAt: new Date(migrationAsOf.getTime() + 60_000),
      },
    ]);

    await database.collection('mvp_onboarding_sessions').insertOne({
      _id: new Types.ObjectId(),
      userId: onboardingUser,
      status: 'completed',
      contentRevision: 'mvp-onboarding-content-v2',
      policyVersion: 'mvp-privacy-v1',
      consent: {
        adultConfirmed: true,
        voluntaryParticipationConfirmed: true,
        privacyAcknowledged: true,
        confirmedAt: baseDate,
      },
      cursor: 12,
      answers: onboardingAnswers,
      factorEngine: {
        status: 'PENDING',
        evidenceEventIds: [],
        individualSnapshotIds: [],
      },
      startedAt: baseDate,
      completedAt: baseDate,
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    await DefinitionRegistryRelease.deleteMany({});
    await database.collection('individual_factor_snapshots').createIndex(
      { subjectId: 1, contextPairId: 1, factorKey: 1, revision: 1 },
      { unique: true, name: 'obsolete_context_without_projection_purpose' }
    );

    const dryRun = await runFactorEngineMigration({
      mode: 'DRY_RUN',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(dryRun.asOf, migrationAsOf.toISOString());
    assert.equal(dryRun.weekly.deferredAfterCutoff, 2);
    assert.equal(dryRun.registry.wouldSeed, true);
    assert.equal(dryRun.weekly.replayEligible, 2);
    assert.equal(dryRun.weekly.wouldNormalizePairIds, 3);
    assert.equal(dryRun.weekly.unreplayable.RAW_ANSWERS_INVALID, 1);
    assert.equal(dryRun.onboarding.replayEligible, 1);
    assert.equal(dryRun.indexes.obsoleteExactMatches, 1);
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: { $in: [mixedA, mixedB] } }),
      0
    );

    const applied = await runFactorEngineMigration({
      mode: 'NEW_ONLY',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(applied.registry.seeded, true);
    assert.equal(applied.weekly.normalizedPairIds, 3);
    assert.equal(applied.weekly.replayed, 2);
    assert.equal(applied.onboarding.replayed, 1);
    assert.equal(applied.indexes.droppedObsoleteExactMatches, 1);
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: { $in: [mixedA, mixedB] } }),
      8
    );
    assert.equal(await EvidenceEvent.countDocuments({ actorId: invalidUser }), 0);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: legacyOnlyUser }), 0);
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: onboardingUser }),
      3
    );
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({ subjectId: legacyOnlyUser }),
      0
    );
    assert.equal(
      await PairFactorEvaluationSnapshot.countDocuments({
        pairId: mixedPairId.toHexString(),
      }),
      4
    );

    const pairRead = await readLatestInternalWeeklyPairEvaluations({
      pairId: mixedPairId.toHexString(),
    });
    assert.equal(pairRead.evaluations.length, 4);
    const serializedPairRead = JSON.stringify(pairRead);
    assert.equal(serializedPairRead.includes('submittedValue'), false);
    assert.equal(serializedPairRead.includes('normalizedValue'), false);

    const repeated = await runFactorEngineMigration({
      mode: 'NEW_ONLY',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(repeated.registry.seeded, false);
    assert.equal(repeated.weekly.replayed, 0);
    assert.equal(repeated.onboarding.replayed, 0);
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: newOnlyUser }),
      4
    );
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: { $in: [mixedA, mixedB] } }),
      8
    );

    const mixedMarker = await database.collection('weekly_checkins').findOne({
      userId: mixedA,
    });
    const missingEvidenceId = mixedMarker?.computed?.factorEngine
      ?.evidenceEventIds?.[0];
    assert.equal(typeof missingEvidenceId, 'string');
    await EvidenceEvent.deleteOne({ eventId: missingEvidenceId });
    await database.collection('mvp_onboarding_sessions').updateOne(
      { userId: onboardingUser },
      {
        $set: {
          'factorEngine.registryVersion':
            MVP_FACTOR_REGISTRY.registryVersion - 1,
        },
      }
    );

    const repaired = await runFactorEngineMigration({
      mode: 'NEW_ONLY',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(repaired.weekly.staleMarkers, 1);
    assert.equal(repaired.weekly.replayed, 1);
    assert.equal(repaired.onboarding.staleMarkers, 1);
    assert.equal(repaired.onboarding.replayed, 1);
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: { $in: [mixedA, mixedB] } }),
      8
    );

    const repairedOnboardingMarker = await database
      .collection('mvp_onboarding_sessions')
      .findOne({ userId: onboardingUser });
    const missingSnapshotId = repairedOnboardingMarker?.factorEngine
      ?.individualSnapshotIds?.[0];
    assert.equal(typeof missingSnapshotId, 'string');
    await IndividualFactorSnapshot.deleteOne({ snapshotId: missingSnapshotId });
    const repairedMissingSnapshot = await runFactorEngineMigration({
      mode: 'NEW_ONLY',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(repairedMissingSnapshot.weekly.staleMarkers, 0);
    assert.equal(repairedMissingSnapshot.weekly.replayed, 0);
    assert.equal(repairedMissingSnapshot.onboarding.staleMarkers, 1);
    assert.equal(repairedMissingSnapshot.onboarding.replayed, 1);

    const stableAfterRepair = await runFactorEngineMigration({
      mode: 'NEW_ONLY',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(stableAfterRepair.weekly.staleMarkers, 0);
    assert.equal(stableAfterRepair.weekly.replayed, 0);
    assert.equal(stableAfterRepair.onboarding.staleMarkers, 0);
    assert.equal(stableAfterRepair.onboarding.replayed, 0);

    const contractMarker = await database
      .collection('mvp_onboarding_sessions')
      .findOne({ userId: onboardingUser });
    const contractSnapshotId = contractMarker?.factorEngine
      ?.individualSnapshotIds?.[0];
    assert.equal(typeof contractSnapshotId, 'string');
    const snapshotCollection = database.collection('individual_factor_snapshots');
    const contractSnapshot = await snapshotCollection.findOne({
      snapshotId: contractSnapshotId,
    });
    assert.ok(contractSnapshot);
    const contractMutations = [
      {
        corrupt: { $unset: { 'versions.displayVersion': '' } },
        restore: {
          $set: {
            'versions.displayVersion': contractSnapshot.versions.displayVersion,
          },
        },
      },
      {
        corrupt: { $set: { 'versions.measurementRefs': [] } },
        restore: {
          $set: {
            'versions.measurementRefs': contractSnapshot.versions.measurementRefs,
          },
        },
      },
      {
        corrupt: { $unset: { effectiveFrom: '' } },
        restore: { $set: { effectiveFrom: contractSnapshot.effectiveFrom } },
      },
    ] as const;
    for (const mutation of contractMutations) {
      await snapshotCollection.updateOne(
        { snapshotId: contractSnapshotId },
        mutation.corrupt
      );
      const detectedContractGap = await runFactorEngineMigration({
        mode: 'DRY_RUN',
        batchSize: 2,
        now: migrationAsOf,
      });
      assert.equal(detectedContractGap.onboarding.staleMarkers, 1);
      assert.equal(detectedContractGap.onboarding.replayed, 0);
      await snapshotCollection.updateOne(
        { snapshotId: contractSnapshotId },
        mutation.restore
      );
    }
    const stableAfterContractRestore = await runFactorEngineMigration({
      mode: 'DRY_RUN',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(stableAfterContractRestore.onboarding.staleMarkers, 0);

    const sourceTimeMarker = await database
      .collection('mvp_onboarding_sessions')
      .findOne({ userId: onboardingUser });
    const sourceTimeEvidenceId = sourceTimeMarker?.factorEngine
      ?.evidenceEventIds?.[0];
    assert.equal(typeof sourceTimeEvidenceId, 'string');
    const evidenceCollection = database.collection('factor_evidence_events');
    const sourceTimeEvidence = await evidenceCollection.findOne({
      eventId: sourceTimeEvidenceId,
    });
    assert.ok(sourceTimeEvidence?.recordedAt instanceof Date);
    await evidenceCollection.updateOne(
      { eventId: sourceTimeEvidenceId },
      {
        $set: {
          recordedAt: new Date(sourceTimeEvidence.recordedAt.getTime() + 1),
        },
      }
    );
    const detectedSourceTimeGap = await runFactorEngineMigration({
      mode: 'DRY_RUN',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(detectedSourceTimeGap.onboarding.staleMarkers, 1);
    await evidenceCollection.updateOne(
      { eventId: sourceTimeEvidenceId },
      { $set: { recordedAt: sourceTimeEvidence.recordedAt } }
    );
    const stableAfterSourceTimeRestore = await runFactorEngineMigration({
      mode: 'DRY_RUN',
      batchSize: 2,
      now: migrationAsOf,
    });
    assert.equal(stableAfterSourceTimeRestore.onboarding.staleMarkers, 0);

    const weeklyPairTypes = await database
      .collection('weekly_checkins')
      .aggregate<{ type: string; count: number }>([
        { $match: { userId: { $in: [mixedA, mixedB] } } },
        { $group: { _id: { $type: '$pairId' }, count: { $sum: 1 } } },
        { $project: { _id: 0, type: '$_id', count: 1 } },
      ])
      .toArray();
    assert.deepEqual(weeklyPairTypes, [{ type: 'objectId', count: 2 }]);

    const individualIndexes = await database
      .collection('individual_factor_snapshots')
      .listIndexes()
      .toArray();
    assert.equal(
      individualIndexes.some(
        (index) => index.name === 'obsolete_context_without_projection_purpose'
      ),
      false
    );
    assert.ok(
      individualIndexes.some((index) =>
        sameIndexKey(index.key as IndexKey, {
          subjectId: 1,
          contextPairId: 1,
          projectionPurpose: 1,
          factorKey: 1,
          revision: 1,
        })
      )
    );

    await database.collection('privacy_requests').insertOne({
      _id: new Types.ObjectId(),
      ownerUserId: privacyUser,
      kind: 'ACCOUNT_DELETION',
      status: 'PENDING_POLICY_REVIEW',
      requestVersion: 'privacy-request-v1',
      policyReasonCode: 'SHARED_ARTIFACT_RETENTION_REQUIRED',
      requestedAt: baseDate,
      createdAt: baseDate,
      updatedAt: baseDate,
    });
    await database.collection('privacy_requests').createIndex(
      { ownerUserId: 1, kind: 1, status: 1 },
      {
        unique: true,
        name: 'privacy_request_one_pending_per_owner',
        partialFilterExpression: { status: 'PENDING_POLICY_REVIEW' },
      }
    );
    const privacyDryRun = await runPrivacyRequestV2Migration({
      mode: 'DRY_RUN',
      batchSize: 1,
    });
    assert.equal(privacyDryRun.eligible, 1);
    assert.equal(privacyDryRun.legacyExactIndexes, 1);
    const privacyApplied = await runPrivacyRequestV2Migration({
      mode: 'PRIVACY_V2',
      batchSize: 1,
    });
    assert.equal(privacyApplied.migrated, 1);
    assert.equal(privacyApplied.droppedLegacyExactIndexes, 1);
    const migratedPrivacy = await database.collection('privacy_requests').findOne({
      ownerUserId: privacyUser,
    });
    assert.equal(migratedPrivacy?.status, 'PENDING_CONFIRMATION');
    assert.equal(migratedPrivacy?.requestVersion, 'privacy-request-v2');
    assert.equal(typeof migratedPrivacy?.ownerSubjectHash, 'string');
    assert.equal(migratedPrivacy?.ownerSubjectHash.length, 64);
    const privacyRepeated = await runPrivacyRequestV2Migration({
      mode: 'PRIVACY_V2',
      batchSize: 1,
    });
    assert.equal(privacyRepeated.migrated, 0);

    await database.collection('users').deleteMany({
      id: { $in: [legacyOnlyUser, mixedA] },
    });
    assert.equal(
      await database.collection('users').countDocuments({
        vectors: { $exists: true },
      }),
      0
    );
    const noLegacyFieldRuntime = await processWeeklyFactorCheckIn({
      pairId: newOnlyPairId.toHexString(),
      memberIds: [newOnlyUser, newOnlyPartner],
      actorId: newOnlyPartner,
      checkInId: `no-legacy-field-${runId}`,
      ...rawAnswers(-0.1),
      observedAt: new Date(baseDate.getTime() + 2_000),
    });
    assert.equal(noLegacyFieldRuntime.pairEvaluations.length, 4);
    assert.equal(
      await database.collection('users').countDocuments({
        id: { $in: [newOnlyUser, newOnlyPartner] },
      }),
      0
    );

    const collectionNames = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(
        (collection) => collection.name
      )
    );
    assert.equal(collectionNames.has('vector_snapshots'), false);
    assert.equal(collectionNames.has('scoring_versions'), false);
    assert.ok(collectionNames.has('factor_evidence_events'));
    assert.ok(collectionNames.has('individual_factor_snapshots'));
    assert.ok(collectionNames.has('pair_factor_evaluation_snapshots'));

    console.log(
      JSON.stringify({
        integration: 'factor-engine-cutover',
        database: isolatedDatabase,
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        legacyOnlyEvidence: 0,
        mixedWeeklyReplayed: applied.weekly.replayed,
        onboardingReplayed: applied.onboarding.replayed,
        repeatedWrites: repeated.weekly.replayed + repeated.onboarding.replayed,
        repairedStaleMarkers:
          repaired.weekly.staleMarkers +
          repaired.onboarding.staleMarkers +
          repairedMissingSnapshot.onboarding.staleMarkers,
        startupWithoutLegacyFields: true,
        legacyVectorCollectionsCreated: 0,
      })
    );
  } finally {
    await database.dropDatabase();
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
