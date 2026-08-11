import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import mongoose, { Types } from 'mongoose';
import { accountDeletionService } from '@/domain/services/accountDeletion.service';
import {
  AccountWriteBarrierError,
  accountWriteBarrierService,
} from '@/domain/services/accountWriteBarrier.service';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { signJwt, verifyJwt } from '@/lib/jwt';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { Pair } from '@/models/Pair';
import { PrivacyRequest } from '@/models/PrivacyRequest';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const assertSafeTestUri = (uri: string): void => {
  const parsed = new URL(uri);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (parsed.protocol !== 'mongodb:') {
    throw new Error('Integration requires a mongodb:// URI');
  }
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '27018') {
    throw new Error('Integration is restricted to 127.0.0.1:27018');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('Integration requires a database ending in _test');
  }
  if (parsed.searchParams.get('directConnection') !== 'true') {
    throw new Error('Integration requires directConnection=true');
  }
};

assertSafeTestUri(mongodbUri);

const runId = randomUUID();
const testRunId = `privacy-execution-${runId}`;
const cancelRunId = `${testRunId}-cancel`;
const controlRunId = `${testRunId}-unrelated-control`;
const raceRunId = `${testRunId}-barrier-race`;
const ownerUserId = `delete-owner-${runId}`;
const partnerUserId = `delete-partner-${runId}`;
const cancelUserId = `cancel-owner-${runId}`;
const inverseUserId = `delete-inverse-${runId}`;
const expiredLeaseUserId = `delete-expired-lease-${runId}`;
const pairKey = [ownerUserId, partnerUserId].sort().join('|');
const jwtSecret = process.env.JWT_SECRET?.trim() || randomUUID();
process.env.JWT_SECRET = jwtSecret;

const auditRequest = {
  route: '/integration/privacy-deletion-execution',
  method: 'TEST',
  requestId: runId,
};

const factorCollections = [
  'factor_evidence_events',
  'individual_factor_snapshots',
  'pair_factor_snapshots',
  'pair_factor_evaluation_snapshots',
] as const;

const userFixture = (id: string, username: string) => ({
  id,
  username,
  avatar: 'avatar',
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

const seedDeletionArtifacts = async (input: {
  database: Db;
  pairId: Types.ObjectId;
  ownerObjectId: Types.ObjectId;
}): Promise<string[]> => {
  const pairIdString = String(input.pairId);
  const fixtures = [
    {
      collection: 'billing_webhook_events',
      document: { testRunId, pairId: input.pairId, eventId: testRunId },
    },
    {
      collection: 'evidence_events',
      document: { testRunId, pairId: input.pairId, ownerUserId },
    },
    {
      collection: 'notifications',
      document: { testRunId, pairId: input.pairId, userId: ownerUserId },
    },
    {
      collection: 'pair_activities',
      document: { testRunId, pairId: input.pairId, status: 'completed_success' },
    },
    {
      collection: 'pair_events',
      document: { testRunId, pairId: input.pairId, status: 'completed' },
    },
    {
      collection: 'pair_membership_claims',
      document: { testRunId, pairId: input.pairId, userId: ownerUserId },
    },
    {
      collection: 'pair_qn_answers',
      document: { testRunId, pairId: input.pairId, privateAnswer: 'owner-only' },
    },
    {
      collection: 'pair_qn_sessions',
      document: { testRunId, pairId: input.pairId, status: 'completed' },
    },
    {
      collection: 'pair_state_snapshots',
      document: { testRunId, pairId: input.pairId, revision: 1 },
    },
    {
      collection: 'partner_signals',
      document: {
        testRunId,
        pairId: input.pairId,
        fromUserId: ownerUserId,
        toUserId: partnerUserId,
      },
    },
    {
      collection: 'recommendation_decisions',
      document: { testRunId, pairId: input.pairId, status: 'COMPLETED' },
    },
    {
      collection: 'safety_gates',
      document: { testRunId, pairId: input.pairId, enabled: false },
    },
    {
      collection: 'subscriptions',
      document: {
        testRunId,
        pairId: input.pairId,
        userId: ownerUserId,
        billingOwnerUserId: ownerUserId,
      },
    },
    {
      collection: 'weekly_checkins',
      document: { testRunId, pairId: input.pairId, userId: ownerUserId },
    },
    {
      collection: 'weekly_cycles',
      document: { testRunId, pairId: input.pairId, status: 'EXPIRED' },
    },
    {
      collection: 'pair_invites',
      document: { testRunId, creatorUserId: ownerUserId, pairId: input.pairId },
    },
    {
      collection: 'likes',
      document: { testRunId, fromId: ownerUserId, toId: partnerUserId },
    },
    {
      collection: 'event_logs',
      document: {
        testRunId,
        actor: { userId: ownerUserId },
        context: { pairId: pairIdString },
      },
    },
    {
      collection: 'insights',
      document: { testRunId, userId: ownerUserId, pairId: input.pairId },
    },
    {
      collection: 'entitlement_quota_usage',
      document: { testRunId, subjectId: ownerUserId },
    },
    {
      collection: 'rate_limit_buckets',
      document: { testRunId, key: `user:${ownerUserId}` },
    },
    {
      collection: 'idempotency_records',
      document: { testRunId, userId: ownerUserId },
    },
    {
      collection: 'mvp_onboarding_sessions',
      document: { testRunId, userId: ownerUserId, privateAnswer: 'owner-only' },
    },
    {
      collection: 'personal_daily_checkins',
      document: { testRunId, userId: ownerUserId, privateJournal: 'owner-only' },
    },
    {
      collection: 'vector_snapshots',
      document: { testRunId, userId: ownerUserId },
    },
    {
      collection: 'vector_snapshots',
      document: { testRunId, userId: input.ownerObjectId },
    },
    {
      collection: 'relationshipactivities',
      document: { testRunId, userId: input.ownerObjectId },
    },
    {
      collection: 'factor_evidence_events',
      document: {
        testRunId,
        eventId: testRunId,
        idempotencyKey: testRunId,
        actorId: ownerUserId,
        subjectKind: 'INDIVIDUAL',
        subjectId: ownerUserId,
        pairId: pairIdString,
      },
    },
    {
      collection: 'factor_evidence_events',
      document: {
        testRunId,
        eventId: `${testRunId}-pairless-accepted-actor`,
        idempotencyKey: `${testRunId}-pairless-accepted-actor`,
        actorId: ownerUserId,
        subjectKind: 'INDIVIDUAL',
        subjectId: `${testRunId}-other-subject`,
        status: 'ACCEPTED',
      },
    },
    {
      collection: 'factor_evidence_events',
      document: {
        testRunId,
        eventId: `${testRunId}-pairless-rejected-subject`,
        idempotencyKey: `${testRunId}-pairless-rejected-subject`,
        actorId: `${testRunId}-other-actor`,
        subjectKind: 'INDIVIDUAL',
        subjectId: ownerUserId,
        status: 'REJECTED',
        rejectionCode: 'CAPTURE_POLICY_VIOLATION',
      },
    },
    {
      collection: 'factor_evidence_events',
      document: {
        testRunId,
        eventId: `${testRunId}-pairless-accepted-observed`,
        idempotencyKey: `${testRunId}-pairless-accepted-observed`,
        actorId: `${testRunId}-observer`,
        subjectKind: 'PAIR',
        subjectId: `${testRunId}-pair-subject`,
        observedSubjectId: ownerUserId,
        status: 'ACCEPTED',
      },
    },
    {
      collection: 'individual_factor_snapshots',
      document: {
        testRunId,
        snapshotId: `${testRunId}-individual`,
        subjectId: ownerUserId,
        factorKey: 'integration.factor',
        revision: 1,
      },
    },
    {
      collection: 'pair_factor_snapshots',
      document: {
        testRunId,
        snapshotId: `${testRunId}-pair`,
        pairId: pairIdString,
        factorKey: 'integration.factor',
        revision: 1,
      },
    },
    {
      collection: 'pair_factor_evaluation_snapshots',
      document: {
        testRunId,
        snapshotId: `${testRunId}-evaluation`,
        pairId: pairIdString,
        factorKey: 'integration.factor',
        revision: 1,
      },
    },
  ];

  for (const fixture of fixtures) {
    await input.database
      .collection(fixture.collection)
      .insertOne(fixture.document);
  }

  return [...new Set(fixtures.map((fixture) => fixture.collection))];
};

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });

  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');

  let pairId: Types.ObjectId | null = null;
  let artifactCollections: string[] = [];
  const privacyRequestIds: Types.ObjectId[] = [];
  const deletedSubject = `deleted:${privacySubjectHash(ownerUserId)}`;

  try {
    await Promise.all([
      User.createIndexes(),
      Pair.createIndexes(),
      PrivacyRequest.createIndexes(),
      SessionSubject.createIndexes(),
    ]);

    const [owner] = await User.create([
      userFixture(ownerUserId, 'deletion-owner'),
      userFixture(partnerUserId, 'deletion-partner'),
      userFixture(cancelUserId, 'cancellation-owner'),
    ]);
    const pair = await Pair.create({
      members: [ownerUserId, partnerUserId],
      key: pairKey,
      status: 'active',
    });
    pairId = pair._id;

    artifactCollections = await seedDeletionArtifacts({
      database,
      pairId,
      ownerObjectId: owner._id,
    });
    await database.collection('factor_evidence_events').insertOne({
      testRunId: controlRunId,
      eventId: controlRunId,
      idempotencyKey: controlRunId,
      actorId: `${controlRunId}-actor`,
      subjectKind: 'INDIVIDUAL',
      subjectId: `${controlRunId}-subject`,
      status: 'ACCEPTED',
    });
    await database.collection('personal_daily_checkins').insertOne({
      testRunId: cancelRunId,
      userId: cancelUserId,
      privateJournal: 'must-survive-cancel',
    });

    const cancelledRequest = await privacyRequestService.requestDeletion({
      ownerUserId: cancelUserId,
      auditRequest,
    });
    privacyRequestIds.push(new Types.ObjectId(cancelledRequest.id));
    assert.equal(cancelledRequest.requestVersion, 'privacy-request-v2');
    assert.equal(cancelledRequest.status, 'PENDING_CONFIRMATION');
    const cancelled = await privacyRequestService.cancelDeletion({
      ownerUserId: cancelUserId,
      auditRequest,
    });
    assert.equal(cancelled?.status, 'CANCELLED');
    assert.equal(await User.countDocuments({ id: cancelUserId }), 1);
    assert.equal(
      await database.collection('personal_daily_checkins').countDocuments({
        testRunId: cancelRunId,
        userId: cancelUserId,
      }),
      1
    );

    const oldSessionVersion = await sessionRevocationService.getOrCreateVersion(
      ownerUserId
    );
    const oldJwt = signJwt(ownerUserId, jwtSecret, 600, oldSessionVersion);
    const initialPayload = verifyJwt(oldJwt, jwtSecret);
    assert.equal(initialPayload?.sub, ownerUserId);
    assert.equal(initialPayload?.sv, oldSessionVersion);
    assert.equal(
      await sessionRevocationService.isActive(ownerUserId, oldSessionVersion),
      true
    );

    const deletionRequest = await privacyRequestService.requestDeletion({
      ownerUserId,
      auditRequest,
    });
    privacyRequestIds.push(new Types.ObjectId(deletionRequest.id));
    assert.equal(deletionRequest.requestVersion, 'privacy-request-v2');
    assert.equal(deletionRequest.status, 'PENDING_CONFIRMATION');

    const writerLease = await accountWriteBarrierService.acquireAuthenticated({
      userId: ownerUserId,
      sessionVersion: oldSessionVersion,
    });
    let signalBarrierWait: (() => void) | undefined;
    let rejectBarrierWait: ((error: Error) => void) | undefined;
    const barrierWaiting = new Promise<void>((resolve, reject) => {
      signalBarrierWait = resolve;
      rejectBarrierWait = reject;
    });
    const deletionPromise = accountDeletionService.execute({
      ownerUserId,
      sessionVersion: oldSessionVersion,
      auditRequest,
      reliabilityTestHooks: {
        onBarrierWait: () => signalBarrierWait?.(),
      },
    }).catch((error: Error) => {
      rejectBarrierWait?.(error);
      throw error;
    });
    await barrierWaiting;
    const deletingSubject = await SessionSubject.findOne({
      subjectKey: privacySubjectHash(ownerUserId),
    }).lean();
    assert.equal(deletingSubject?.accountState, 'DELETING');

    const racePrivacyRequestId = new Types.ObjectId();
    privacyRequestIds.push(racePrivacyRequestId);
    const raceNow = new Date();
    await Promise.all([
      database.collection('personal_daily_checkins').insertOne({
        testRunId: raceRunId,
        userId: ownerUserId,
        privateJournal: 'must-be-drained-before-delete',
      }),
      database.collection('personal_questionnaire_submissions').insertOne({
        testRunId: raceRunId,
        userId: ownerUserId,
        privateAnswer: 'must-be-drained-before-delete',
      }),
      database.collection('event_logs').insertOne({
        testRunId: raceRunId,
        event: 'ACCOUNT_WRITE_BARRIER_TEST',
        actor: { userId: ownerUserId },
      }),
      database.collection('idempotency_records').insertOne({
        testRunId: raceRunId,
        userId: ownerUserId,
        route: '/integration/account-write-barrier',
        key: raceRunId,
        requestHash: raceRunId,
        state: 'completed',
        status: 200,
        attemptCount: 1,
        createdAt: raceNow,
      }),
      database.collection('rate_limit_buckets').insertOne({
        testRunId: raceRunId,
        key: `user:${ownerUserId}`,
        route: '/integration/account-write-barrier',
        windowMs: 60_000,
        windowStart: raceNow,
        count: 1,
        expiresAt: new Date(raceNow.getTime() + 60_000),
      }),
      database.collection('privacy_requests').insertOne({
        _id: racePrivacyRequestId,
        ownerUserId,
        kind: 'ACCOUNT_DELETION',
        status: 'CANCELLED',
        requestVersion: 'privacy-request-v2',
        policyReasonCode: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION',
        ownerSubjectHash: privacySubjectHash(ownerUserId),
        requestedAt: raceNow,
        cancelledAt: raceNow,
        createdAt: raceNow,
        updatedAt: raceNow,
      }),
    ]);
    await accountWriteBarrierService.release(writerLease);
    const result = await deletionPromise;

    const findings: string[] = [];
    const verify = (condition: boolean, failure: string): void => {
      if (!condition) findings.push(failure);
    };

    verify(result.status === 'EXECUTED', 'execution DTO status is not EXECUTED');
    verify(
      result.accountAndSessions === 'DELETED_AND_REVOKED',
      'execution DTO does not report account/session deletion'
    );
    verify(
      (await User.countDocuments({ id: ownerUserId })) === 0,
      'owner User document remains'
    );
    verify(
      (await User.countDocuments({ id: partnerUserId })) === 1,
      'unrelated partner User document was removed'
    );
    verify(
      (await Pair.countDocuments({ _id: pairId })) === 0,
      'deleted owner pair document remains'
    );

    const storedRequest = await PrivacyRequest.findById(deletionRequest.id).lean();
    verify(storedRequest?.status === 'EXECUTED', 'stored PrivacyRequest is not EXECUTED');
    verify(
      storedRequest?.ownerUserId === deletedSubject,
      'stored PrivacyRequest owner is not pseudonymized'
    );
    verify(
      storedRequest?.ownerSubjectHash === privacySubjectHash(ownerUserId),
      'stored PrivacyRequest subject hash changed unexpectedly'
    );
    verify(
      (await PrivacyRequest.countDocuments({ ownerUserId })) === 0,
      'a PrivacyRequest still contains the raw deleted owner id'
    );
    for (const collectionName of [
      'personal_daily_checkins',
      'personal_questionnaire_submissions',
      'event_logs',
      'idempotency_records',
      'rate_limit_buckets',
    ]) {
      verify(
        (await database.collection(collectionName).countDocuments({
          testRunId: raceRunId,
        })) === 0,
        `post-DELETING writer artifact remains in ${collectionName}`
      );
    }

    const sessionSubject = await SessionSubject.findOne({
      subjectKey: privacySubjectHash(ownerUserId),
    }).lean();
    verify(Boolean(sessionSubject), 'SessionSubject is missing after revocation');
    verify(
      sessionSubject?.accountState === 'DELETED',
      'SessionSubject is not in DELETED state'
    );
    verify(
      (sessionSubject?.writeLeases?.length ?? 0) === 0,
      'SessionSubject retains write leases after deletion'
    );
    verify(
      sessionSubject?.version !== oldSessionVersion,
      'SessionSubject version was not rotated'
    );
    verify(Boolean(sessionSubject?.revokedAt), 'SessionSubject has no revokedAt timestamp');
    verify(
      (await sessionRevocationService.isActive(ownerUserId, oldSessionVersion)) === false,
      'old JWT session version is still active'
    );
    verify(
      verifyJwt(oldJwt, jwtSecret)?.sv === oldSessionVersion,
      'old JWT fixture is no longer cryptographically readable for the revocation check'
    );

    let silentReauthenticationRejected = false;
    try {
      await sessionRevocationService.getOrCreateVersion(ownerUserId);
    } catch {
      silentReauthenticationRejected = true;
    }
    verify(
      silentReauthenticationRejected,
      'DELETED account was silently reactivated by session creation'
    );

    const presentCollections = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(
        (collection) => collection.name
      )
    );
    for (const collectionName of artifactCollections) {
      const remaining = await database
        .collection(collectionName)
        .countDocuments({ testRunId });
      const isFactorCollection = factorCollections.includes(
        collectionName as (typeof factorCollections)[number]
      );
      verify(
        remaining === 0,
        `${isFactorCollection ? 'factor ' : ''}artifact remains in ${collectionName} (${remaining})`
      );
    }
    for (const collectionName of factorCollections) {
      verify(
        presentCollections.has(collectionName),
        `factor collection was not available for direct verification: ${collectionName}`
      );
    }
    verify(
      (await database.collection('factor_evidence_events').countDocuments({
        testRunId: controlRunId,
      })) === 1,
      'unrelated pairless Factor evidence was removed'
    );

    verify(
      (await database.collection('event_logs').countDocuments({
        'actor.userId': ownerUserId,
      })) === 0,
      'audit log still contains raw deleted owner id'
    );
    verify(
      (await database.collection('event_logs').countDocuments({
        'actor.userId': deletedSubject,
        event: 'PRIVACY_DELETION_EXECUTED',
      })) === 1,
      'pseudonymized deletion audit event is missing'
    );

    const inverseVersion =
      await sessionRevocationService.getOrCreateVersion(inverseUserId);
    const inverseBarrier = await accountWriteBarrierService.beginDeletion({
      userId: inverseUserId,
      sessionVersion: inverseVersion,
    });
    await assert.rejects(
      accountWriteBarrierService.acquireAuthenticated({
        userId: inverseUserId,
        sessionVersion: inverseVersion,
      }),
      (error: Error) =>
        error instanceof AccountWriteBarrierError &&
        error.reason === 'ACCOUNT_NOT_ACTIVE'
    );

    const expiredVersion =
      await sessionRevocationService.getOrCreateVersion(expiredLeaseUserId);
    await accountWriteBarrierService.acquireAuthenticated({
      userId: expiredLeaseUserId,
      sessionVersion: expiredVersion,
      now: new Date(0),
      ttlMs: 1,
    });
    const expiredBarrier = await accountWriteBarrierService.beginDeletion({
      userId: expiredLeaseUserId,
      sessionVersion: expiredVersion,
      now: new Date(1),
    });
    await accountWriteBarrierService.waitForQuiescence({
      ...expiredBarrier,
      now: () => new Date(2),
      maxWaitMs: 10,
      sleep: async () => undefined,
    });
    verify(
      (await SessionSubject.findOne({
        subjectKey: privacySubjectHash(expiredLeaseUserId),
      }).lean())?.writeLeases?.length === 0,
      'expired write lease was not reclaimed'
    );
    void inverseBarrier;

    if (findings.length > 0) {
      console.error(
        `privacy deletion execution integration found ${findings.length} invariant failure(s):`
      );
      for (const finding of findings) console.error(`- ${finding}`);
      throw new Error('privacy deletion execution integration failed');
    }

    console.log(
      `privacy deletion execution integration passed (${artifactCollections.length} artifact collections, ${factorCollections.length} factor collections)`
    );
  } finally {
    const markerCollections = [...new Set([...artifactCollections, 'personal_daily_checkins'])];
    await Promise.all(
      markerCollections.map((collectionName) =>
        database.collection(collectionName).deleteMany({
          testRunId: { $in: [testRunId, cancelRunId, controlRunId] },
        })
      )
    );
    await Promise.all([
      PrivacyRequest.deleteMany({
        $or: [
          { _id: { $in: privacyRequestIds } },
          { ownerUserId: { $in: [ownerUserId, cancelUserId, deletedSubject] } },
        ],
      }),
      SessionSubject.deleteMany({
        subjectKey: {
          $in: [ownerUserId, inverseUserId, expiredLeaseUserId].map(
            privacySubjectHash
          ),
        },
      }),
      Pair.deleteMany({ key: pairKey }),
      User.deleteMany({
        id: { $in: [ownerUserId, partnerUserId, cancelUserId] },
      }),
      database.collection('event_logs').deleteMany({
        $or: [
          { 'actor.userId': { $in: [ownerUserId, cancelUserId, deletedSubject] } },
          ...(pairId ? [{ 'context.pairId': String(pairId) }] : []),
        ],
      }),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
