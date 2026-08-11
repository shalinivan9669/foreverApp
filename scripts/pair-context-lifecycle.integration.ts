import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { activityOfferService } from '@/domain/services/activityOffer.service';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { pairsService } from '@/domain/services/pairs.service';
import {
  currentWeekKey,
  weeklyCheckInService,
} from '@/domain/services/weeklyCheckIn.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { EventLog } from '@/models/EventLog';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { Notification } from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { PairEvent } from '@/models/PairEvent';
import { PairInvite } from '@/models/PairInvite';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { PartnerSignal } from '@/models/PartnerSignal';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { SafetyGate } from '@/models/SafetyGate';
import { User } from '@/models/User';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import { WeeklyCycle } from '@/models/WeeklyCycle';

type IndexKey = Record<string, number>;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

const deferred = (): Deferred => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const PAIR_CONTEXT_TEST_DATABASE = 'foreverapp_pair_context_test';
const PAIR_CONTEXT_INDEX_NAME = 'pair_contexts_by_member_key';
const PAIR_CONTEXT_INDEX_KEY: IndexKey = { key: 1, createdAt: -1 };
const LEGACY_PAIR_KEY: IndexKey = { key: 1 };
const prepareLegacyIndexOnly = process.argv.includes('--prepare-legacy-index-only');

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const parsedMongoUri = new URL(mongodbUri);
const allowedLocalHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const databaseName = decodeURIComponent(parsedMongoUri.pathname.replace(/^\//, ''));
const expectedReplicaSet = parsedMongoUri.searchParams.get('replicaSet');
if (
  parsedMongoUri.protocol !== 'mongodb:' ||
  !allowedLocalHosts.has(parsedMongoUri.hostname) ||
  !databaseName.endsWith('_test') ||
  !expectedReplicaSet
) {
  throw new Error(
    'Integration requires an explicit local replica-set Mongo URI and a database ending in _test'
  );
}
if (prepareLegacyIndexOnly && databaseName !== PAIR_CONTEXT_TEST_DATABASE) {
  throw new Error(
    `Legacy-index fixture preparation is restricted to ${PAIR_CONTEXT_TEST_DATABASE}`
  );
}

const runId = randomUUID();
const memberA = `pair-context-a-${runId}`;
const memberB = `pair-context-b-${runId}`;
const memberIds = [memberA, memberB].sort();
const pairKey = memberIds.join('|');
const weeklyRaceLabels = [
  'current-end',
  'claim-end',
  'skip-end',
  'claim-pause',
] as const;
const weeklyRaceMemberIds = weeklyRaceLabels.flatMap((label) => [
  `pair-context-weekly-${label}-a-${runId}`,
  `pair-context-weekly-${label}-b-${runId}`,
]);
const runScopedMemberIds = [...memberIds, ...weeklyRaceMemberIds];
const auditRequest = {
  route: '/integration/pair-context-lifecycle',
  method: 'TEST',
};

type LifecycleEvidence = {
  replicaSet: string;
  firstPairId: string;
  secondPairId: string;
  endedArtifacts: {
    claimsReleased: number;
    weeklyCyclesExpired: number;
    activitiesCancelled: number;
    recommendationsExpired: number;
    pairEventsExpired: number;
    safetyGatesRevoked: number;
    partnerSignalsDeleted: number;
    notificationsDeleted: number;
  };
  endedGuardStatus: number;
  pairContextsForMemberKey: number;
  activeClaimsAfterReconnect: number;
  weeklyLifecycleRaces: {
    endWins: number;
    pauseWins: number;
  };
};

const sameKey = (actual: IndexKey, expected: IndexKey): boolean => {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([key, value], index) =>
        expectedEntries[index]?.[0] === key && expectedEntries[index]?.[1] === value
    )
  );
};

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

const onboardingFixture = (userId: string, now: Date) => ({
  userId,
  status: 'completed' as const,
  contentRevision: `pair-context-${runId}`,
  policyVersion: 'pair-context-integration-v1',
  consent: {
    adultConfirmed: true,
    voluntaryParticipationConfirmed: true,
    privacyAcknowledged: true,
    confirmedAt: now,
  },
  cursor: 0,
  answers: [],
  startedAt: now,
  completedAt: now,
});

const assertPairContextIndexReady = async (): Promise<void> => {
  const indexes = await Pair.collection.indexes();
  const contextIndex = indexes.find(
    (index) =>
      index.name === PAIR_CONTEXT_INDEX_NAME &&
      index.unique !== true &&
      sameKey(index.key as IndexKey, PAIR_CONTEXT_INDEX_KEY)
  );
  const legacyUniqueIndexes = indexes.filter(
    (index) =>
      index.unique === true && sameKey(index.key as IndexKey, LEGACY_PAIR_KEY)
  );
  assert.ok(contextIndex, 'named non-unique pair-context lookup index is missing');
  assert.equal(legacyUniqueIndexes.length, 0, 'legacy unique Pair key index remains');
};

const prepareLegacyIndexFixture = async (): Promise<void> => {
  const mongoDatabase = mongoose.connection.db;
  assert.ok(mongoDatabase, 'Mongo database connection is unavailable');
  const collectionExists = await mongoDatabase
    .listCollections({ name: Pair.collection.name }, { nameOnly: true })
    .hasNext();
  if (!collectionExists) {
    await mongoDatabase.createCollection(Pair.collection.name);
  }

  assert.equal(
    await Pair.collection.countDocuments(),
    0,
    'legacy-index fixture preparation requires an empty pairs collection'
  );

  const indexes = await Pair.collection.indexes();
  const unexpectedNamedIndex = indexes.find(
    (index) =>
      index.name === PAIR_CONTEXT_INDEX_NAME &&
      !sameKey(index.key as IndexKey, PAIR_CONTEXT_INDEX_KEY)
  );
  assert.equal(
    unexpectedNamedIndex,
    undefined,
    `${PAIR_CONTEXT_INDEX_NAME} has an unexpected key`
  );

  const removableNames = new Set(
    indexes
      .filter(
        (index) =>
          sameKey(index.key as IndexKey, PAIR_CONTEXT_INDEX_KEY) ||
          sameKey(index.key as IndexKey, LEGACY_PAIR_KEY)
      )
      .map((index) => index.name)
      .filter((name): name is string => Boolean(name))
  );
  for (const indexName of removableNames) {
    await Pair.collection.dropIndex(indexName);
  }

  await Pair.collection.createIndex(LEGACY_PAIR_KEY, {
    unique: true,
    name: 'legacy_pair_key_unique',
  });
  const finalIndexes = await Pair.collection.indexes();
  assert.equal(
    finalIndexes.some(
      (index) =>
        index.unique === true && sameKey(index.key as IndexKey, LEGACY_PAIR_KEY)
    ),
    true,
    'legacy Pair key fixture was not created'
  );
  assert.equal(
    finalIndexes.some((index) =>
      sameKey(index.key as IndexKey, PAIR_CONTEXT_INDEX_KEY)
    ),
    false,
    'pair-context lookup index was not removed from the legacy fixture'
  );
  console.log(
    JSON.stringify({
      suite: 'pair-context-index-fixture',
      status: 'prepared',
      database: databaseName,
    })
  );
};

const ensureSupportingIndexes = async (): Promise<void> => {
  await Promise.all([
    Pair.createIndexes(),
    PairInvite.createIndexes(),
    PairMembershipClaim.createIndexes(),
    MvpOnboardingSession.createIndexes(),
    Notification.createIndexes(),
    SafetyGate.createIndexes(),
    WeeklyCycle.createIndexes(),
    WeeklyCheckIn.createIndexes(),
    PairStateSnapshot.createIndexes(),
    RecommendationDecision.createIndexes(),
    PairEvent.createIndexes(),
    PartnerSignal.createIndexes(),
    EventLog.createIndexes(),
    User.createIndexes(),
  ]);
};

const createWeeklyRacePair = async (
  label: (typeof weeklyRaceLabels)[number]
) => {
  const members: [string, string] = [
    `pair-context-weekly-${label}-a-${runId}`,
    `pair-context-weekly-${label}-b-${runId}`,
  ];
  const pair = await Pair.create({
    members,
    key: [...members].sort().join('|'),
    status: 'active',
    contextVersion: 'pair-context-v1',
  });
  return { pair, members };
};

const waitForWeeklyRaceGuard = async (
  guard: Promise<void>,
  operation: Promise<object>,
  label: string
): Promise<void> => {
  await Promise.race([
    guard,
    operation.then(() => {
      throw new Error(`${label} settled before reaching its lifecycle fence`);
    }),
  ]);
};

const assertNoWeeklyRaceArtifacts = async (
  pairId: Types.ObjectId,
  label: string
): Promise<void> => {
  const [cycles, snapshots, notifications, cyclesWithClaims] = await Promise.all([
    WeeklyCycle.countDocuments({ pairId }),
    PairStateSnapshot.countDocuments({ pairId }),
    Notification.countDocuments({ pairId }),
    WeeklyCycle.countDocuments({
      pairId,
      'submissionClaims.0': { $exists: true },
    }),
  ]);
  assert.deepEqual(
    [cycles, snapshots, notifications, cyclesWithClaims],
    [0, 0, 0, 0],
    `${label} left weekly artifacts after the lifecycle transition won`
  );
};

const exerciseWeeklyLifecycleRaces = async (): Promise<
  LifecycleEvidence['weeklyLifecycleRaces']
> => {
  const runEndRace = async (
    kind: 'current' | 'claim' | 'skip',
    label: 'current-end' | 'claim-end' | 'skip-end'
  ): Promise<void> => {
    const { pair, members } = await createWeeklyRacePair(label);
    const now = new Date();
    const guardReached = deferred();
    const releaseGuard = deferred();
    const hooks = {
      beforeTransactionalPairFence: async () => {
        guardReached.resolve();
        await releaseGuard.promise;
      },
    };
    const operation: Promise<object> =
      kind === 'current'
        ? weeklyCycleService.current(
            { pair, currentUserId: members[0], now },
            hooks
          )
        : kind === 'claim'
          ? weeklyCycleService.claimSubmission(
              {
                pair,
                currentUserId: members[0],
                cycleKey: currentWeekKey(now),
                now,
              },
              hooks
            )
          : weeklyCycleService.skipCurrent(
              { pair, currentUserId: members[0], now },
              hooks
            );

    await waitForWeeklyRaceGuard(guardReached.promise, operation, label);
    try {
      await pairsService.endPair({
        pairId: String(pair._id),
        currentUserId: members[1],
        auditRequest,
      });
    } finally {
      releaseGuard.resolve();
    }
    await assert.rejects(
      operation,
      (error: object) =>
        error instanceof DomainError &&
        error.code === 'STATE_CONFLICT' &&
        error.status === 409
    );
    assert.equal((await Pair.findById(pair._id).lean())?.status, 'ended');
    await assertNoWeeklyRaceArtifacts(pair._id as Types.ObjectId, label);
  };

  await runEndRace('current', 'current-end');
  await runEndRace('claim', 'claim-end');
  await runEndRace('skip', 'skip-end');

  const pauseRace = await createWeeklyRacePair('claim-pause');
  const pauseNow = new Date();
  const pauseGuardReached = deferred();
  const releasePauseGuard = deferred();
  const pauseOperation: Promise<object> = weeklyCycleService.claimSubmission(
    {
      pair: pauseRace.pair,
      currentUserId: pauseRace.members[0],
      cycleKey: currentWeekKey(pauseNow),
      now: pauseNow,
    },
    {
      beforeTransactionalPairFence: async () => {
        pauseGuardReached.resolve();
        await releasePauseGuard.promise;
      },
    }
  );
  await waitForWeeklyRaceGuard(
    pauseGuardReached.promise,
    pauseOperation,
    'claim-pause'
  );
  try {
    await pairsService.pausePair({
      pairId: String(pauseRace.pair._id),
      currentUserId: pauseRace.members[1],
      auditRequest,
    });
  } finally {
    releasePauseGuard.resolve();
  }
  await assert.rejects(
    pauseOperation,
    (error: object) =>
      error instanceof DomainError &&
      error.code === 'STATE_CONFLICT' &&
      error.status === 409
  );
  assert.equal((await Pair.findById(pauseRace.pair._id).lean())?.status, 'paused');
  await assertNoWeeklyRaceArtifacts(
    pauseRace.pair._id as Types.ObjectId,
    'claim-pause'
  );

  return { endWins: 3, pauseWins: 1 };
};

const seedActiveArtifacts = async (pairId: Types.ObjectId, now: Date): Promise<void> => {
  const mongoDatabase = mongoose.connection.db;
  assert.ok(mongoDatabase, 'Mongo database connection is unavailable');
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  await Promise.all([
    mongoDatabase.collection(WeeklyCycle.collection.name).insertOne({
      pairId,
      cycleKey: `pair-context-${runId}`,
      startsAt: now,
      endsAt: expiresAt,
      expiresAt,
      timeZone: 'UTC',
      status: 'OPEN',
      memberIds,
      memberCompletion: memberIds.map((userId) => ({
        userId,
        status: 'PENDING',
      })),
      pairReadiness: 'NOT_READY',
      submissionCount: 0,
      submissionClaims: [
        {
          userId: memberA,
          token: `pair-context-claim-${runId}`,
          expiresAt,
        },
      ],
      inputDefinitionVersion: 'pair-context-integration-v1',
      algorithmVersion: 'pair-context-integration-v1',
      createdAt: now,
      updatedAt: now,
    }),
    mongoDatabase.collection(PairActivity.collection.name).insertOne({
      pairId,
      status: 'offered',
      createdAt: now,
      updatedAt: now,
    }),
    mongoDatabase.collection(RecommendationDecision.collection.name).insertOne({
      pairId,
      cycleKey: `pair-context-${runId}`,
      activityId: new Types.ObjectId(),
      status: 'OFFERED',
      reasonCode: 'CURRENT_CYCLE_SUPPORT',
      decisionVersion: 'recommendation-decision-v1',
      replacementDepth: 0,
      createdAt: now,
      updatedAt: now,
    }),
    mongoDatabase.collection(PairEvent.collection.name).insertOne({
      pairId,
      key: `pair-context-${runId}`,
      status: 'offered',
      createdAt: now,
      updatedAt: now,
    }),
    mongoDatabase.collection(SafetyGate.collection.name).insertOne({
      pairId,
      ownerUserId: memberA,
      enabled: true,
      retentionClass: 'UNTIL_REVOKED_OR_PAIR_END',
      createdAt: now,
      updatedAt: now,
    }),
    mongoDatabase.collection(PartnerSignal.collection.name).insertOne({
      pairId,
      fromUserId: memberA,
      toUserId: memberB,
      sourceCheckInId: new Types.ObjectId(),
      dateKey: now.toISOString().slice(0, 10),
      text: 'Integration-only lifecycle signal',
      tone: 'support',
      status: 'sent',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
    mongoDatabase.collection(Notification.collection.name).insertOne({
      userId: memberA,
      pairId,
      type: 'ACTION_AVAILABLE',
      dedupeKey: `pair-context-${runId}`,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
};

const assertEndedArtifacts = async (
  pairId: Types.ObjectId
): Promise<LifecycleEvidence['endedArtifacts']> => {
  const mongoDatabase = mongoose.connection.db;
  assert.ok(mongoDatabase, 'Mongo database connection is unavailable');

  const pair = await Pair.findById(pairId).lean();
  assert.equal(pair?.status, 'ended');
  assert.ok(pair?.endedAt, 'ended Pair has no endedAt timestamp');
  assert.equal(pair?.endedByUserId, memberA);
  assert.equal(pair?.endReason, 'MEMBER_REQUEST');
  assert.equal(pair?.activeActivity, undefined);

  const weeklyCycles = await mongoDatabase
    .collection(WeeklyCycle.collection.name)
    .find({ pairId })
    .toArray();
  assert.equal(weeklyCycles.length, 2);
  assert.equal(
    weeklyCycles.every(
      (cycle) =>
        cycle.status === 'EXPIRED' &&
        cycle.pairReadiness === 'EXPIRED' &&
        Array.isArray(cycle.submissionClaims) &&
        cycle.submissionClaims.length === 0 &&
        cycle.memberCompletion.every(
          (entry: { status: string }) => entry.status === 'EXPIRED'
        )
    ),
    true,
    'Pair end did not expire every open weekly cycle and submission claim'
  );

  const pairActivity = await mongoDatabase
    .collection(PairActivity.collection.name)
    .findOne({ pairId });
  const recommendation = await mongoDatabase
    .collection(RecommendationDecision.collection.name)
    .findOne({ pairId });
  const pairEvent = await mongoDatabase
    .collection(PairEvent.collection.name)
    .findOne({ pairId });
  const safetyGate = await mongoDatabase
    .collection(SafetyGate.collection.name)
    .findOne({ pairId });

  assert.equal(pairActivity?.status, 'cancelled');
  assert.equal(recommendation?.status, 'EXPIRED');
  assert.ok(recommendation?.expiredAt, 'recommendation has no expiredAt timestamp');
  assert.equal(pairEvent?.status, 'expired');
  assert.ok(pairEvent?.expiresAt, 'pair event has no expiresAt timestamp');
  assert.equal(safetyGate?.enabled, false);
  assert.ok(safetyGate?.revokedAt, 'SafetyGate has no revokedAt timestamp');

  const [claims, partnerSignals, notifications] = await Promise.all([
    PairMembershipClaim.countDocuments({ pairId }),
    PartnerSignal.countDocuments({ pairId }),
    Notification.countDocuments({ pairId }),
  ]);
  assert.equal(claims, 0);
  assert.equal(partnerSignals, 0);
  assert.equal(notifications, 0);

  return {
    claimsReleased: 2,
    weeklyCyclesExpired: 2,
    activitiesCancelled: 1,
    recommendationsExpired: 1,
    pairEventsExpired: 1,
    safetyGatesRevoked: 1,
    partnerSignalsDeleted: 1,
    notificationsDeleted: 5,
  };
};

const assertEndWinsArtifactCreationRaces = async (input: {
  pairId: string;
  pairObjectId: Types.ObjectId;
  fixtureNow: Date;
}): Promise<void> => {
  const offerGuardReached = deferred();
  const checkInGuardReached = deferred();
  const releaseGuards = deferred();
  const cycleKey = currentWeekKey(input.fixtureNow);
  const activityCountBefore = await PairActivity.countDocuments({
    pairId: input.pairObjectId,
  });

  const offerAttempt = activityOfferService.createFromTemplate(
    {
      pairId: input.pairId,
      currentUserId: memberA,
      templateId: 'system-resource-relief',
      recommendationContext: {
        cycleId: new Types.ObjectId(),
        cycleKey,
        snapshotId: new Types.ObjectId(),
        snapshotRevision: 0,
        inputHash: `pair-context-race-${runId}`,
        inputDefinitionVersion: 'pair-context-race-v1',
        pairStateAlgorithmVersion: 'pair-context-race-v1',
      },
    },
    {
      beforeTransactionalPairGuard: async () => {
        offerGuardReached.resolve();
        await releaseGuards.promise;
      },
    }
  );
  const checkInAttempt = weeklyCheckInService.submit(
    {
      currentUserId: memberB,
      pairId: input.pairId,
      weekKey: cycleKey,
      answers: {
        closeness: 0.6,
        fatigue: 0.4,
        irritation: 0.2,
        readiness: 0.7,
        unresolvedTopic: false,
      },
    },
    {
      beforePrimaryCommitLifecycleGuard: async () => {
        checkInGuardReached.resolve();
        await releaseGuards.promise;
      },
    }
  );

  const rejectIfSettledBeforeGuard = async (
    operation: Promise<unknown>,
    label: string
  ): Promise<void> => {
    await operation;
    throw new Error(`${label} settled before reaching its lifecycle guard`);
  };
  await Promise.all([
    Promise.race([
      offerGuardReached.promise,
      rejectIfSettledBeforeGuard(offerAttempt, 'activity offer'),
    ]),
    Promise.race([
      checkInGuardReached.promise,
      rejectIfSettledBeforeGuard(checkInAttempt, 'weekly check-in'),
    ]),
  ]);

  assert.equal(
    await WeeklyCycle.countDocuments({ pairId: input.pairObjectId, status: 'OPEN' }),
    2,
    'weekly submission did not reach the deterministic pre-commit race point'
  );
  assert.equal(
    await Notification.countDocuments({ pairId: input.pairObjectId }),
    5,
    'weekly race fixture did not materialize its bounded cycle notifications'
  );

  try {
    await pairsService.endPair({
      pairId: input.pairId,
      currentUserId: memberA,
      auditRequest,
    });
  } finally {
    releaseGuards.resolve();
  }

  await assert.rejects(
    offerAttempt,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'ACTIVITY_UNAVAILABLE' &&
      error.status === 409
  );
  await assert.rejects(
    checkInAttempt,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'STATE_CONFLICT' &&
      error.status === 409
  );
  assert.equal(
    await PairActivity.countDocuments({ pairId: input.pairObjectId }),
    activityCountBefore,
    'activity offer was inserted after Pair end won the transaction race'
  );
  assert.equal(
    await WeeklyCheckIn.countDocuments({
      pairId: input.pairId,
      userId: memberB,
      weekKey: cycleKey,
    }),
    0,
    'weekly check-in was inserted after Pair end won the transaction race'
  );
};

const cleanupRunScope = async (): Promise<void> => {
  const pairs = await Pair.find({ members: { $in: runScopedMemberIds } }).select({
    _id: 1,
  });
  const pairIds = pairs.map((pair) => pair._id);
  const pairIdStrings = pairIds.map(String);

  await Promise.all([
    EventLog.deleteMany({
      $or: [
        { 'actor.userId': { $in: runScopedMemberIds } },
        { 'context.pairId': { $in: pairIdStrings } },
      ],
    }),
    Notification.deleteMany({
      $or: [
        { userId: { $in: runScopedMemberIds } },
        { pairId: { $in: pairIds } },
      ],
    }),
    PartnerSignal.deleteMany({ pairId: { $in: pairIds } }),
    SafetyGate.deleteMany({ pairId: { $in: pairIds } }),
    PairEvent.deleteMany({ pairId: { $in: pairIds } }),
    RecommendationDecision.deleteMany({ pairId: { $in: pairIds } }),
    PairActivity.deleteMany({ pairId: { $in: pairIds } }),
    PairStateSnapshot.deleteMany({ pairId: { $in: pairIds } }),
    WeeklyCheckIn.deleteMany({
      $or: [
        { pairId: { $in: pairIds } },
        { pairId: { $in: pairIdStrings } },
        { userId: { $in: runScopedMemberIds } },
      ],
    }),
    WeeklyCycle.deleteMany({ pairId: { $in: pairIds } }),
    PairMembershipClaim.deleteMany({ userId: { $in: runScopedMemberIds } }),
    PairInvite.deleteMany({
      $or: [
        { creatorUserId: { $in: runScopedMemberIds } },
        { acceptedByUserId: { $in: runScopedMemberIds } },
      ],
    }),
    MvpOnboardingSession.deleteMany({ userId: { $in: runScopedMemberIds } }),
  ]);
  await Promise.all([
    Pair.deleteMany({ _id: { $in: pairIds } }),
    User.deleteMany({ id: { $in: runScopedMemberIds } }),
  ]);

  const remaining = await Promise.all([
    EventLog.countDocuments({ 'actor.userId': { $in: runScopedMemberIds } }),
    Notification.countDocuments({
      $or: [
        { userId: { $in: runScopedMemberIds } },
        { pairId: { $in: pairIds } },
      ],
    }),
    PartnerSignal.countDocuments({ pairId: { $in: pairIds } }),
    SafetyGate.countDocuments({ pairId: { $in: pairIds } }),
    PairEvent.countDocuments({ pairId: { $in: pairIds } }),
    RecommendationDecision.countDocuments({ pairId: { $in: pairIds } }),
    PairActivity.countDocuments({ pairId: { $in: pairIds } }),
    PairStateSnapshot.countDocuments({ pairId: { $in: pairIds } }),
    WeeklyCycle.countDocuments({ pairId: { $in: pairIds } }),
    PairMembershipClaim.countDocuments({ userId: { $in: runScopedMemberIds } }),
    PairInvite.countDocuments({ creatorUserId: { $in: runScopedMemberIds } }),
    MvpOnboardingSession.countDocuments({ userId: { $in: runScopedMemberIds } }),
    Pair.countDocuments({ _id: { $in: pairIds } }),
    User.countDocuments({ id: { $in: runScopedMemberIds } }),
  ]);
  assert.equal(
    remaining.reduce((sum, count) => sum + count, 0),
    0,
    `pair-context cleanup left run-scoped records: ${remaining.join(',')}`
  );
};

const runLifecycle = async (replicaSet: string): Promise<LifecycleEvidence> => {
  await ensureSupportingIndexes();
  await assertPairContextIndexReady();
  const weeklyLifecycleRaces = await exerciseWeeklyLifecycleRaces();

  const fixtureNow = new Date();
  await User.create([
    userFixture(memberA, 'pair-context-integration-a'),
    userFixture(memberB, 'pair-context-integration-b'),
  ]);
  await MvpOnboardingSession.create([
    onboardingFixture(memberA, fixtureNow),
    onboardingFixture(memberB, fixtureNow),
  ]);

  const firstInvite = await pairInviteService.create({
    currentUserId: memberA,
    now: fixtureNow,
  });
  const firstAcceptance = await pairInviteService.accept({
    currentUserId: memberB,
    token: firstInvite.token,
    auditRequest,
    now: new Date(fixtureNow.getTime() + 1_000),
  });
  assert.equal(firstAcceptance.status, 'ACCEPTED');
  assert.equal(firstAcceptance.alreadyAccepted, false);
  const firstPairId = firstAcceptance.pairId;
  const firstPairObjectId = new Types.ObjectId(firstPairId);
  assert.equal(
    await PairMembershipClaim.countDocuments({ pairId: firstPairObjectId }),
    2
  );

  await seedActiveArtifacts(firstPairObjectId, new Date(fixtureNow.getTime() + 2_000));
  const activeArtifactCounts = await Promise.all([
    WeeklyCycle.countDocuments({ pairId: firstPairObjectId, status: 'OPEN' }),
    PairActivity.countDocuments({ pairId: firstPairObjectId, status: 'offered' }),
    RecommendationDecision.countDocuments({
      pairId: firstPairObjectId,
      status: 'OFFERED',
    }),
    PairEvent.countDocuments({ pairId: firstPairObjectId, status: 'offered' }),
    SafetyGate.countDocuments({ pairId: firstPairObjectId, enabled: true }),
    PartnerSignal.countDocuments({ pairId: firstPairObjectId }),
    Notification.countDocuments({ pairId: firstPairObjectId }),
  ]);
  assert.deepEqual(
    activeArtifactCounts,
    [1, 1, 1, 1, 1, 1, 3],
    'active Pair artifact fixture is incomplete'
  );
  await assertEndWinsArtifactCreationRaces({
    pairId: firstPairId,
    pairObjectId: firstPairObjectId,
    fixtureNow,
  });
  const endedArtifacts = await assertEndedArtifacts(firstPairObjectId);

  const endedGuard = await requirePairMember(firstPairId, memberA);
  assert.equal(endedGuard.ok, false, 'ended Pair remained accessible to its former member');
  if (endedGuard.ok) {
    throw new Error('ended Pair remained accessible to its former member');
  }
  assert.equal(endedGuard.response.status, 404);
  const endedGuardPayload = (await endedGuard.response.json()) as {
    error?: { code?: string };
  };
  assert.equal(endedGuardPayload.error?.code, 'NOT_FOUND');

  const secondInvite = await pairInviteService.create({
    currentUserId: memberA,
    now: new Date(fixtureNow.getTime() + 3_000),
  });
  const secondAcceptance = await pairInviteService.accept({
    currentUserId: memberB,
    token: secondInvite.token,
    auditRequest,
    now: new Date(fixtureNow.getTime() + 4_000),
  });
  assert.equal(secondAcceptance.status, 'ACCEPTED');
  assert.equal(secondAcceptance.alreadyAccepted, false);
  const secondPairId = secondAcceptance.pairId;
  const secondPairObjectId = new Types.ObjectId(secondPairId);
  assert.notEqual(secondPairId, firstPairId, 'reconnect reused the ended Pair _id');

  const contexts = await Pair.find({ key: pairKey }).lean();
  assert.equal(contexts.length, 2);
  const endedContext = contexts.find((pair) => String(pair._id) === firstPairId);
  const activeContext = contexts.find((pair) => String(pair._id) === secondPairId);
  assert.equal(endedContext?.status, 'ended');
  assert.equal(activeContext?.status, 'active');
  assert.equal(activeContext?.contextVersion, 'pair-context-v1');
  assert.deepEqual([...(activeContext?.members ?? [])].sort(), memberIds);

  const activeGuard = await requirePairMember(secondPairId, memberA);
  assert.equal(activeGuard.ok, true, 'fresh Pair is not accessible to its member');
  const activeClaims = await PairMembershipClaim.find({
    userId: { $in: memberIds },
  }).lean();
  assert.equal(activeClaims.length, 2);
  assert.equal(
    activeClaims.every((claim) => String(claim.pairId) === secondPairId),
    true,
    'membership claims still reference the ended Pair'
  );

  const newContextArtifactCounts = await Promise.all([
    WeeklyCycle.countDocuments({ pairId: secondPairObjectId }),
    PairActivity.countDocuments({ pairId: secondPairObjectId }),
    RecommendationDecision.countDocuments({ pairId: secondPairObjectId }),
    PairEvent.countDocuments({ pairId: secondPairObjectId }),
    SafetyGate.countDocuments({ pairId: secondPairObjectId }),
    PartnerSignal.countDocuments({ pairId: secondPairObjectId }),
  ]);
  assert.equal(
    newContextArtifactCounts.reduce((sum, count) => sum + count, 0),
    0,
    'fresh Pair inherited artifacts from the ended context'
  );

  const acceptedInvites = await PairInvite.find({
    creatorUserId: memberA,
    acceptedByUserId: memberB,
    status: 'ACCEPTED',
  })
    .lean();
  assert.deepEqual(
    acceptedInvites.map((invite) => String(invite.pairId)).sort(),
    [firstPairId, secondPairId].sort()
  );

  return {
    replicaSet,
    firstPairId,
    secondPairId,
    endedArtifacts,
    endedGuardStatus: endedGuard.response.status,
    pairContextsForMemberKey: contexts.length,
    activeClaimsAfterReconnect: activeClaims.length,
    weeklyLifecycleRaces,
  };
};

const main = async (): Promise<void> => {
  let evidence: LifecycleEvidence | undefined;
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

    if (prepareLegacyIndexOnly) {
      await prepareLegacyIndexFixture();
      return;
    }
    evidence = await runLifecycle(String(hello.setName));
  } finally {
    if (!prepareLegacyIndexOnly && mongoose.connection.readyState === 1) {
      await cleanupRunScope();
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  assert.ok(evidence, 'pair-context lifecycle evidence was not produced');
  console.log(
    JSON.stringify({
      suite: 'pair-context-lifecycle',
      status: 'passed',
      database: databaseName,
      evidence,
    })
  );
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
