import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { activitiesService } from '@/domain/services/activities.service';
import { pairHistoryService } from '@/domain/services/pairHistory.service';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { ensurePublicPairingId } from '@/domain/services/userPublicIdentity.service';
import {
  SYSTEM_ACTIVITY_TEMPLATES,
} from '@/domain/services/pairActivityDecision.service';
import { notificationService } from '@/domain/services/notification.service';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import {
  currentWeekKey,
  weeklyCheckInService,
} from '@/domain/services/weeklyCheckIn.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { toPairActivityDTO } from '@/lib/dto/activity.dto';
import { EventLog } from '@/models/EventLog';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import {
  Notification,
  type NotificationType,
} from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import {
  PairActivity,
  type PairActivityType,
} from '@/models/PairActivity';
import { PairInvite } from '@/models/PairInvite';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import type { RecommendationProvenanceType } from '@/models/RecommendationProvenance';
import { User } from '@/models/User';
import { EconomyWallet } from '@/models/EconomyWallet';
import { EconomyLedger } from '@/models/EconomyLedger';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import { WeeklyCycle } from '@/models/WeeklyCycle';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const parsedMongoUri = new URL(mongodbUri);
const allowedLocalHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const databaseName = decodeURIComponent(
  parsedMongoUri.pathname.replace(/^\//, '')
);
if (
  parsedMongoUri.protocol !== 'mongodb:' ||
  !allowedLocalHosts.has(parsedMongoUri.hostname) ||
  !databaseName.endsWith('_test') ||
  !parsedMongoUri.searchParams.get('replicaSet')
) {
  throw new Error(
    'Integration requires an explicit local replica-set Mongo URI and a database ending in _test'
  );
}

const expectedReplicaSet = parsedMongoUri.searchParams.get('replicaSet');
const runId = randomUUID();
const memberA = `two-user-mvp-a-${runId}`;
const memberB = `two-user-mvp-b-${runId}`;
const memberIds = [memberA, memberB].sort();
const pairKey = memberIds.join('|');
const timingsMs: Record<string, number> = {};

const cycleDates = [
  new Date('2026-08-10T12:00:00.000Z'),
  new Date('2026-08-17T12:00:00.000Z'),
  new Date('2026-08-24T12:00:00.000Z'),
] as const;

const weeklyFactorKeys = [
  'communication.weekly.connection',
  'communication.weekly.tension',
  'wellbeing.current.overload',
  'wellbeing.current.readiness',
] as const;

const privateNotesByCycle = cycleDates.map((_, index) => ({
  memberA: `weekly-private-a-${runId}-cycle-${index + 1}`,
  memberB: `weekly-private-b-${runId}-cycle-${index + 1}`,
}));
const privateNoteA = privateNotesByCycle[0]?.memberA ?? '';
const privateNoteB = privateNotesByCycle[0]?.memberB ?? '';

const auditRequest = {
  route: '/integration/two-user-mvp',
  method: 'TEST',
};

type AcceptanceEvidence = {
  replicaSet: string;
  invite: {
    concurrentAttempts: number;
    concurrentSuccesses: number;
    retryableConflicts: number;
    retryAlreadyAccepted: boolean;
  };
  cycles: Array<{
    cycleNumber: number;
    weekKey: string;
    dataStatus: 'ENOUGH';
    factorEvidenceEvents: number;
    individualFactorSnapshots: number;
    pairEvaluations: number;
    legacySnapshotRevision: number;
    legacySnapshotCount: number;
    decisionId: string;
    templateId: string;
    actionKey: string;
    activityId: string;
    feedbackAnswers: number;
    activityFactorEvents: number;
    historyVisibleForBoth: true;
  }>;
  freeAccessVerified: true;
  counts: {
    pairs: number;
    membershipClaims: number;
    weeklySubmissions: number;
    weeklyCycles: number;
    recommendationDecisions: number;
    activities: number;
    notifications: number;
    auditEvents: number;
  };
  privacy: {
    peerWeeklyRawProjected: false;
    activityRawProjected: false;
    historyRawProjected: false;
    auditSecretsRecorded: false;
  };
};

type ConcurrentAcceptOutcome =
  | {
      kind: 'accepted';
      pairId: string;
      alreadyAccepted: boolean;
    }
  | { kind: 'retryable_conflict' };

const timed = async <T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> => {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    timingsMs[label] = Date.now() - startedAt;
  }
};

const freeCall = async <T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.status === 402 || /ENTITLEMENT|PAYWALL|PAYMENT_REQUIRED/i.test(error.code))
    ) {
      assert.fail(`${label} unexpectedly required a paid entitlement: ${error.code}`);
    }
    if (error instanceof Error) {
      error.message = `${label}: ${error.message}`;
    }
    throw error;
  }
};

const assertNoForbiddenKeys = (
  value: object,
  forbiddenKeys: readonly string[],
  surface: string
): void => {
  const forbidden = new Set(forbiddenKeys);
  const visit = (node: object): void => {
    if (Array.isArray(node)) {
      for (const entry of node) {
        if (typeof entry === 'object' && entry !== null) visit(entry);
      }
      return;
    }
    for (const [key, entry] of Object.entries(node)) {
      assert.equal(
        forbidden.has(key),
        false,
        `${surface} exposed forbidden key ${key}`
      );
      if (typeof entry === 'object' && entry !== null) visit(entry);
    }
  };
  visit(value);
};

const assertOmitsSecrets = (
  value: object,
  secrets: readonly string[],
  surface: string
): void => {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(
      serialized.includes(secret),
      false,
      `${surface} exposed a private sentinel`
    );
  }
};

const userFixture = (id: string, username: string) => ({
  id,
  username,
  entryCohort: 'EXISTING_PARTNER' as const,
  avatar: 'integration-avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'in_relationship' as const,
  },
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
  contentRevision: `two-user-mvp-${runId}`,
  policyVersion: 'two-user-mvp-v1',
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

const normalizeProvenance = (value: RecommendationProvenanceType) => ({
  version: value.version,
  cycleId: String(value.cycleId),
  cycleKey: value.cycleKey,
  snapshotId: String(value.snapshotId),
  snapshotRevision: value.snapshotRevision,
  inputHash: value.inputHash,
  inputDefinitionVersion: value.inputDefinitionVersion,
  pairStateAlgorithmVersion: value.pairStateAlgorithmVersion,
  recommendationRuleVersion: value.recommendationRuleVersion,
  activityContentVersion: value.activityContentVersion,
  activityContentHash: value.activityContentHash,
});

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const assertSemanticWeeklyFactors = async (input: {
  pairId: string;
  weekKey: string;
}): Promise<{
  factorEvidenceEvents: number;
  individualFactorSnapshots: number;
  pairEvaluations: number;
  latestPairEvaluationSnapshotIds: string[];
}> => {
  const checkIns = await WeeklyCheckIn.find({
    pairId: new Types.ObjectId(input.pairId),
    weekKey: input.weekKey,
  }).lean();
  assert.equal(checkIns.length, 2, `${input.weekKey} must contain two submissions`);
  assert.ok(
    checkIns.every((checkIn) => checkIn.computed.factorEngine.status === 'MATERIALIZED'),
    `${input.weekKey} Factor materialization is incomplete`
  );

  const eventIds = unique(
    checkIns.flatMap((checkIn) => checkIn.computed.factorEngine.evidenceEventIds)
  );
  const individualSnapshotIds = unique(
    checkIns.flatMap(
      (checkIn) => checkIn.computed.factorEngine.individualSnapshotIds
    )
  );
  const evaluationSnapshotIds = unique(
    checkIns.flatMap(
      (checkIn) => checkIn.computed.factorEngine.pairEvaluationSnapshotIds
    )
  );
  const [events, snapshots, evaluations] = await Promise.all([
    EvidenceEvent.find({ eventId: { $in: eventIds } }).lean(),
    IndividualFactorSnapshot.find({
      snapshotId: { $in: individualSnapshotIds },
    }).lean(),
    PairFactorEvaluationSnapshot.find({
      snapshotId: { $in: evaluationSnapshotIds },
    }).lean(),
  ]);

  assert.equal(events.length, eventIds.length, `${input.weekKey} evidence pointer broke`);
  assert.equal(
    snapshots.length,
    individualSnapshotIds.length,
    `${input.weekKey} individual snapshot pointer broke`
  );
  assert.equal(
    evaluations.length,
    evaluationSnapshotIds.length,
    `${input.weekKey} pair evaluation pointer broke`
  );
  assert.deepEqual(
    [...new Set(events.map((event) => event.factorKey))].sort(),
    [...weeklyFactorKeys].sort(),
    `${input.weekKey} did not materialize every weekly factor`
  );
  assert.ok(
    events.every(
      (event) =>
        event.status === 'ACCEPTED' &&
        event.sourceType === 'CHECK_IN' &&
        event.subjectKind === 'INDIVIDUAL' &&
        event.observationScope === 'SELF' &&
        event.pairId === input.pairId &&
        event.purpose === 'PAIR_MODEL' &&
        event.captureMode === 'PAIR_MODEL_ONLY' &&
        event.retentionClass === 'PAIR_CONTEXT' &&
        event.normalizedValue.kind === 'SCALAR'
    ),
    `${input.weekKey} contains non-semantic or non-pair-model evidence`
  );
  assert.ok(
    snapshots.every(
      (snapshot) =>
        snapshot.contextPairId === input.pairId &&
        snapshot.projectionPurpose === 'PAIR_MODEL' &&
        snapshot.status === 'AVAILABLE' &&
        snapshot.value.kind === 'SCALAR' &&
        snapshot.evidenceIds.length > 0
    ),
    `${input.weekKey} contains an unusable individual Factor snapshot`
  );
  assert.ok(evaluations.length >= weeklyFactorKeys.length);
  assert.ok(
    evaluations.every(
      (evaluation) =>
        evaluation.pairId === input.pairId &&
        evaluation.context === 'COMMITTED_RELATIONSHIP' &&
        evaluation.individualSnapshotIds.length === 2
    ),
    `${input.weekKey} contains a pair evaluation outside its semantic context`
  );
  const latestEvaluationByFactor = new Map<
    string,
    (typeof evaluations)[number]
  >();
  for (const evaluation of evaluations) {
    const latest = latestEvaluationByFactor.get(evaluation.factorKey);
    if (!latest || evaluation.revision > latest.revision) {
      latestEvaluationByFactor.set(evaluation.factorKey, evaluation);
    }
  }
  // After week one, A's first submit can retain an insufficient intermediate
  // revision using B's stale previous-week snapshot. B's submit must supersede
  // it; only the latest revisions are the canonical pair projection inputs.
  assert.deepEqual([...latestEvaluationByFactor.keys()].sort(), [...weeklyFactorKeys].sort());
  assert.ok(
    [...latestEvaluationByFactor.values()].every((evaluation) => evaluation.evaluation.status !== 'INSUFFICIENT_DATA'),
    `${input.weekKey} latest pair evaluations remain insufficient after both submissions`,
  );

  return {
    factorEvidenceEvents: events.length,
    individualFactorSnapshots: snapshots.length,
    pairEvaluations: evaluations.length,
    latestPairEvaluationSnapshotIds: [...latestEvaluationByFactor.values()].map(
      (evaluation) => evaluation.snapshotId
    ),
  };
};

const cleanupRunScope = async (): Promise<void> => {
  const pairs = await Pair.find({ key: pairKey }).select({ _id: 1 });
  const pairIds = pairs.map((pair) => pair._id);
  const pairIdStrings = pairIds.map(String);

  await Promise.all([
    EventLog.deleteMany({
      $or: [
        { 'actor.userId': { $in: memberIds } },
        { 'context.pairId': { $in: pairIdStrings } },
      ],
    }),
    Notification.deleteMany({ userId: { $in: memberIds } }),
    EconomyWallet.deleteMany({ _id: { $in: memberIds } }),
    EconomyLedger.deleteMany({ userId: { $in: memberIds } }),
    RecommendationDecision.deleteMany({ pairId: { $in: pairIds } }),
    PairActivity.deleteMany({ pairId: { $in: pairIds } }),
    EvidenceEvent.deleteMany({
      $or: [
        { actorId: { $in: memberIds } },
        { subjectId: { $in: memberIds } },
        { pairId: { $in: pairIdStrings } },
      ],
    }),
    IndividualFactorSnapshot.deleteMany({
      $or: [
        { subjectId: { $in: memberIds } },
        { contextPairId: { $in: pairIdStrings } },
      ],
    }),
    PairFactorSnapshot.deleteMany({ pairId: { $in: pairIdStrings } }),
    PairFactorEvaluationSnapshot.deleteMany({ pairId: { $in: pairIdStrings } }),
    PairStateSnapshot.deleteMany({ pairId: { $in: pairIds } }),
    WeeklyCycle.deleteMany({ pairId: { $in: pairIds } }),
    WeeklyCheckIn.deleteMany({ userId: { $in: memberIds } }),
    PairMembershipClaim.deleteMany({ userId: { $in: memberIds } }),
    PairInvite.deleteMany({
      $or: [
        { creatorUserId: { $in: memberIds } },
        { acceptedByUserId: { $in: memberIds } },
      ],
    }),
    MvpOnboardingSession.deleteMany({ userId: { $in: memberIds } }),
  ]);

  await Promise.all([
    Pair.deleteMany({ key: pairKey }),
    User.deleteMany({ id: { $in: memberIds } }),
  ]);

  const remaining = await Promise.all([
    EventLog.countDocuments({
      $or: [
        { 'actor.userId': { $in: memberIds } },
        { 'context.pairId': { $in: pairIdStrings } },
      ],
    }),
    Notification.countDocuments({ userId: { $in: memberIds } }),
    EconomyWallet.countDocuments({ _id: { $in: memberIds } }),
    EconomyLedger.countDocuments({ userId: { $in: memberIds } }),
    RecommendationDecision.countDocuments({ pairId: { $in: pairIds } }),
    PairActivity.countDocuments({ pairId: { $in: pairIds } }),
    EvidenceEvent.countDocuments({
      $or: [
        { actorId: { $in: memberIds } },
        { subjectId: { $in: memberIds } },
        { pairId: { $in: pairIdStrings } },
      ],
    }),
    IndividualFactorSnapshot.countDocuments({
      $or: [
        { subjectId: { $in: memberIds } },
        { contextPairId: { $in: pairIdStrings } },
      ],
    }),
    PairFactorSnapshot.countDocuments({ pairId: { $in: pairIdStrings } }),
    PairFactorEvaluationSnapshot.countDocuments({ pairId: { $in: pairIdStrings } }),
    PairStateSnapshot.countDocuments({ pairId: { $in: pairIds } }),
    WeeklyCycle.countDocuments({ pairId: { $in: pairIds } }),
    WeeklyCheckIn.countDocuments({ userId: { $in: memberIds } }),
    PairMembershipClaim.countDocuments({ userId: { $in: memberIds } }),
    PairInvite.countDocuments({
      $or: [
        { creatorUserId: { $in: memberIds } },
        { acceptedByUserId: { $in: memberIds } },
      ],
    }),
    MvpOnboardingSession.countDocuments({ userId: { $in: memberIds } }),
    Pair.countDocuments({ key: pairKey }),
    User.countDocuments({ id: { $in: memberIds } }),
  ]);
  assert.equal(
    remaining.reduce((sum, count) => sum + count, 0),
    0,
    `two-user cleanup left run-scoped records: ${remaining.join(',')}`
  );
};

const ensureCriticalIndexes = async (): Promise<void> => {
  await Promise.all([
    User.createIndexes(),
    Pair.createIndexes(),
    PairInvite.createIndexes(),
    PairMembershipClaim.createIndexes(),
    WeeklyCheckIn.createIndexes(),
    WeeklyCycle.createIndexes(),
    PairStateSnapshot.createIndexes(),
    RecommendationDecision.createIndexes(),
    Notification.createIndexes(),
    EvidenceEvent.createIndexes(),
    IndividualFactorSnapshot.createIndexes(),
    PairFactorSnapshot.createIndexes(),
    PairFactorEvaluationSnapshot.createIndexes(),
  ]);
};

const runAcceptance = async (
  replicaSet: string
): Promise<AcceptanceEvidence> => {
  mock.timers.setTime(cycleDates[0].getTime());
  await timed('indexes', ensureCriticalIndexes);

  const fixtureNow = new Date();
  await timed('fixtures', async () => {
    await User.create([
      userFixture(memberA, 'integration-a'),
      userFixture(memberB, 'integration-b'),
    ]);
    await MvpOnboardingSession.create([
      onboardingFixture(memberA, fixtureNow),
      onboardingFixture(memberB, fixtureNow),
    ]);
  });

  const inviteEvidence = await timed('pairInvite', async () => {
    const issued = await pairInviteService.create({
      currentUserId: memberA,
    });
    assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);

    const claimed = await pairInviteService.accept({ currentUserId: memberB, token: issued.token, auditRequest });
    assert.equal(claimed.status, 'AWAITING_PARTNER_CONFIRMATION');
    assert.equal(await Pair.countDocuments({ key: pairKey }), 0, 'recipient confirmation alone created a Pair');
    const partnerPublicId = await ensurePublicPairingId(memberB);

    const concurrentAttempts = 4;
    const outcomes = await Promise.all(
      Array.from({ length: concurrentAttempts }, async (): Promise<ConcurrentAcceptOutcome> => {
        try {
          const result = await pairInviteService.confirm({
            currentUserId: memberA,
            inviteId: issued.invite.id,
            partnerPublicId,
            auditRequest,
          });
          return {
            kind: 'accepted',
            pairId: result.pairId,
            alreadyAccepted: result.alreadyAccepted,
          };
        } catch (error) {
          if (
            error instanceof DomainError &&
            error.code === 'PAIR_INVITE_UNAVAILABLE'
          ) {
            return { kind: 'retryable_conflict' };
          }
          throw error;
        }
      })
    );
    const accepted = outcomes.filter(
      (outcome): outcome is Extract<ConcurrentAcceptOutcome, { kind: 'accepted' }> =>
        outcome.kind === 'accepted'
    );
    const conflicts = outcomes.filter(
      (outcome) => outcome.kind === 'retryable_conflict'
    );
    assert.ok(accepted.length >= 1, 'concurrent invite acceptance had no winner');
    assert.ok(
      accepted.some((outcome) => !outcome.alreadyAccepted),
      'concurrent invite acceptance did not perform the initial transition'
    );

    const retry = await pairInviteService.confirm({
      currentUserId: memberA,
      inviteId: issued.invite.id,
      partnerPublicId,
      auditRequest,
    });
    assert.equal(retry.alreadyAccepted, true, 'invite retry was not idempotent');
    assert.equal(
      new Set([...accepted.map((outcome) => outcome.pairId), retry.pairId]).size,
      1,
      'invite attempts did not converge on one pair'
    );

    const pairs = await Pair.find({ key: pairKey });
    assert.equal(pairs.length, 1, 'pair acceptance created duplicate pairs');
    const pair = pairs[0];
    assert.ok(pair);
    assert.deepEqual([...pair.members].map(String).sort(), memberIds);

    const claims = await PairMembershipClaim.find({ pairId: pair._id }).lean();
    assert.equal(claims.length, 2, 'pair acceptance did not create two claims');
    assert.deepEqual(claims.map((claim) => claim.userId).sort(), memberIds);
    assert.equal(
      await PairInvite.countDocuments({
        _id: issued.invite.id,
        status: 'ACCEPTED',
        pairId: pair._id,
      }),
      1,
      'invite did not persist one accepted state'
    );

    return {
      pairId: String(pair._id),
      inviteId: issued.invite.id,
      token: issued.token,
      concurrentAttempts,
      concurrentSuccesses: accepted.length,
      retryableConflicts: conflicts.length,
      retryAlreadyAccepted: retry.alreadyAccepted,
    };
  });

  const weeklyEvidence = await timed('weeklyCycle', async () => {
    const weekKey = currentWeekKey();
    const answersA = {
      closeness: 0.78,
      fatigue: 0.28,
      irritation: 0.18,
      readiness: 0.82,
      unresolvedTopic: false,
      note: privateNoteA,
    };
    const answersB = {
      closeness: 0.66,
      fatigue: 0.34,
      irritation: 0.25,
      readiness: 0.74,
      unresolvedTopic: false,
      note: privateNoteB,
    };

    const submittedA = await weeklyCheckInService.submit({
      currentUserId: memberA,
      pairId: inviteEvidence.pairId,
      weekKey,
      answers: answersA,
      auditRequest,
    });
    const retriedA = await weeklyCheckInService.submit({
      currentUserId: memberA,
      pairId: inviteEvidence.pairId,
      weekKey,
      answers: answersA,
      auditRequest,
    });
    assert.equal(retriedA.id, submittedA.id, 'weekly retry created a new row');

    const pairAfterFirst = await Pair.findById(inviteEvidence.pairId);
    assert.ok(pairAfterFirst, 'pair was not reloadable after first weekly submit');
    const partialCycle = await weeklyCycleService.current({
      pair: pairAfterFirst,
      currentUserId: memberA,
    });
    assert.equal(partialCycle.pair.dataStatus, 'PARTIAL');
    assert.equal(partialCycle.currentUser.completionStatus, 'SUBMITTED');
    assert.equal(partialCycle.peer.completionStatus, 'PENDING');

    await weeklyCheckInService.submit({
      currentUserId: memberB,
      pairId: inviteEvidence.pairId,
      weekKey,
      answers: answersB,
      auditRequest,
    });

    const reloadedPair = await Pair.findById(inviteEvidence.pairId);
    assert.ok(reloadedPair, 'pair was not reloadable after both weekly submits');
    const canonical = await weeklyCycleService.current({
      pair: reloadedPair,
      currentUserId: memberA,
    });
    assert.equal(canonical.pair.dataStatus, 'ENOUGH');
    assert.equal(canonical.pair.bothSubmitted, true);
    assert.equal(canonical.currentUser.completionStatus, 'SUBMITTED');
    assert.equal(canonical.peer.completionStatus, 'SUBMITTED');

    const [ownerA, ownerB, internalPairSummary] = await Promise.all([
      weeklyCheckInService.current({
        currentUserId: memberA,
        pairId: inviteEvidence.pairId,
        weekKey,
      }),
      weeklyCheckInService.current({
        currentUserId: memberB,
        pairId: inviteEvidence.pairId,
        weekKey,
      }),
      weeklyCheckInService.pairCurrent({
        currentUserId: memberA,
        pairId: inviteEvidence.pairId,
        weekKey,
      }),
    ]);
    assert.ok(ownerA);
    assert.ok(ownerB);
    assert.equal(ownerA.answers.note, privateNoteA);
    assert.equal(ownerB.answers.note, privateNoteB);
    assert.equal(JSON.stringify(ownerA).includes(privateNoteB), false);
    assert.equal(JSON.stringify(ownerB).includes(privateNoteA), false);

    const safePairProjection = internalPairSummary;
    assert.equal(safePairProjection.pair.dataStatus, 'ENOUGH');
    const weeklyRawKeys = [
      'answers',
      'note',
      'closeness',
      'fatigue',
      'irritation',
      'readiness',
      'unresolvedTopic',
    ];
    assertNoForbiddenKeys(
      safePairProjection,
      weeklyRawKeys,
      'safe weekly pair projection'
    );
    assertNoForbiddenKeys(canonical, weeklyRawKeys, 'canonical weekly cycle');
    assertOmitsSecrets(
      safePairProjection,
      [privateNoteA, privateNoteB],
      'safe weekly pair projection'
    );

    const cycle = await WeeklyCycle.findOne({
      pairId: reloadedPair._id,
      cycleKey: weekKey,
    }).lean();
    assert.ok(cycle, 'canonical weekly cycle was not persisted');
    assert.equal(cycle.pairReadiness, 'ENOUGH');
    assert.equal(cycle.submissionCount, 2);
    assert.ok(cycle.latestSnapshotId);

    const latestSnapshot = await PairStateSnapshot.findById(
      cycle.latestSnapshotId
    ).lean();
    assert.ok(latestSnapshot, 'latest canonical snapshot pointer was broken');
    assert.equal(latestSnapshot.dataStatus, 'ENOUGH');
    assert.equal(latestSnapshot.revision, cycle.latestSnapshotRevision);
    assert.equal(latestSnapshot.revision, canonical.snapshot.revision);
    const factorCounts = await assertSemanticWeeklyFactors({
      pairId: inviteEvidence.pairId,
      weekKey,
    });
    assert.deepEqual(
      [...latestSnapshot.input.evidenceRevisionIds].sort(),
      [...factorCounts.latestPairEvaluationSnapshotIds].sort(),
      'canonical snapshot provenance did not use semantic pair evaluations'
    );
    assert.match(latestSnapshot.input.hash, /^[a-f0-9]{64}$/);

    const [snapshotCount, duplicateRevisions, duplicateInputs] =
      await Promise.all([
        PairStateSnapshot.countDocuments({ cycleId: cycle._id }),
        PairStateSnapshot.aggregate<{ count: number }>([
          { $match: { cycleId: cycle._id } },
          { $group: { _id: '$revision', count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
        ]),
        PairStateSnapshot.aggregate<{ count: number }>([
          { $match: { cycleId: cycle._id } },
          {
            $group: {
              _id: {
                hash: '$input.hash',
                algorithm: '$algorithm.version',
              },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ]),
      ]);
    assert.ok(snapshotCount >= 2, 'weekly cycle did not retain revisions');
    assert.equal(duplicateRevisions.length, 0, 'snapshot revisions duplicated');
    assert.equal(duplicateInputs.length, 0, 'canonical snapshot inputs duplicated');
    assert.equal(
      await WeeklyCycle.countDocuments({
        pairId: reloadedPair._id,
        cycleKey: weekKey,
      }),
      1,
      'weekly cycle duplicated'
    );
    assert.equal(
      await WeeklyCheckIn.countDocuments({
        userId: { $in: memberIds },
        weekKey,
      }),
      2,
      'weekly submissions duplicated'
    );
    return {
      weekKey,
      cycle,
      latestSnapshot,
      snapshotCount,
      ...factorCounts,
    };
  });

  const recommendationEvidence = await timed('recommendation', async () => {
    const first = await recommendationWorkflowService.offer({
      pairId: inviteEvidence.pairId,
      currentUserId: memberA,
      auditRequest,
    });
    const reloaded = await recommendationWorkflowService.offer({
      pairId: inviteEvidence.pairId,
      currentUserId: memberB,
      auditRequest,
    });
    assert.equal(reloaded.id, first.id, 'recommendation retry changed decision');
    assert.equal(
      reloaded.activity.id,
      first.activity.id,
      'recommendation retry changed activity'
    );

    const [storedDecision, storedActivity] = await Promise.all([
      RecommendationDecision.findById(first.id).lean(),
      PairActivity.findById(first.activity.id).lean(),
    ]);
    assert.ok(storedDecision, 'recommendation decision was not persisted');
    assert.ok(storedActivity, 'recommended activity was not persisted');
    assert.ok(storedDecision.provenance, 'decision provenance was missing');
    assert.ok(
      storedActivity.recommendationProvenance,
      'activity provenance was missing'
    );
    assert.deepEqual(
      normalizeProvenance(storedDecision.provenance),
      normalizeProvenance(storedActivity.recommendationProvenance)
    );
    assert.equal(
      String(storedDecision.provenance.cycleId),
      String(weeklyEvidence.cycle._id)
    );
    assert.equal(
      String(storedDecision.provenance.snapshotId),
      String(weeklyEvidence.latestSnapshot._id)
    );
    assert.equal(
      storedDecision.provenance.snapshotRevision,
      weeklyEvidence.latestSnapshot.revision
    );
    assert.equal(
      storedDecision.provenance.inputHash,
      weeklyEvidence.latestSnapshot.input.hash
    );
    assert.match(
      storedDecision.provenance.activityContentHash,
      /^[a-f0-9]{64}$/
    );

    const templateIdValue = storedActivity.stateMeta?.templateId;
    if (typeof templateIdValue !== 'string') {
      assert.fail('recommended activity did not retain a template ID');
    }
    const templateId = templateIdValue;
    assert.ok(
      SYSTEM_ACTIVITY_TEMPLATES.some((template) => template._id === templateId),
      'recommendation did not reuse a SYSTEM activity template'
    );
    assert.equal(
      await RecommendationDecision.countDocuments({
        pairId: weeklyEvidence.cycle.pairId,
        cycleKey: weeklyEvidence.weekKey,
      }),
      1,
      'recommendation decision duplicated'
    );
    assert.equal(
      await PairActivity.countDocuments({ pairId: weeklyEvidence.cycle.pairId }),
      1,
      'recommended activity duplicated'
    );

    return {
      decision: first,
      templateId,
    };
  });

  const activityEvidence = await timed('activityLifecycle', async () => {
    const accepted = await freeCall('cycle 1 accept activity', () =>
      recommendationWorkflowService.accept({
        pairId: inviteEvidence.pairId,
        decisionId: recommendationEvidence.decision.id,
        currentUserId: memberA,
        auditRequest,
      })
    );
    const acceptedRetry = await freeCall('cycle 1 accept activity retry', () =>
      recommendationWorkflowService.accept({
        pairId: inviteEvidence.pairId,
        decisionId: recommendationEvidence.decision.id,
        currentUserId: memberA,
        auditRequest,
      })
    );
    assert.equal(accepted.status, 'ACCEPTED');
    assert.equal(acceptedRetry.status, 'ACCEPTED');

    const activityId = recommendationEvidence.decision.activity.id;
    await freeCall('cycle 1 start activity', () =>
      activitiesService.startActivity({
        activityId,
        currentUserId: memberA,
        auditRequest,
      })
    );
    const started = await PairActivity.findById(activityId).lean();
    assert.ok(started?.startedAt, 'explicit START did not persist startedAt');
    assert.equal(started.status, 'in_progress');
    const firstStartedAt = started.startedAt.getTime();
    await freeCall('cycle 1 start activity retry', () =>
      activitiesService.startActivity({
        activityId,
        currentUserId: memberA,
        auditRequest,
      })
    );
    const startedRetry = await PairActivity.findById(activityId).lean();
    assert.ok(startedRetry?.startedAt, 'activity was not reloadable after START');
    assert.equal(
      startedRetry.startedAt.getTime(),
      firstStartedAt,
      'START retry replaced startedAt'
    );

    const activityDocument = await PairActivity.findById(activityId);
    assert.ok(activityDocument, 'activity was not reloadable for feedback');
    const activityBeforeFeedback = toPairActivityDTO(
      activityDocument.toObject<PairActivityType & { _id: Types.ObjectId }>()
    );
    assert.ok(activityBeforeFeedback.checkIns.length > 0);
    const positiveFeedback = activityBeforeFeedback.checkIns.map((checkIn) => ({
      checkInId: checkIn.id,
      ui: checkIn.map.length,
    }));

    const partial = await freeCall('cycle 1 feedback A', () =>
      activitiesService.checkinActivity({
        activityId,
        currentUserId: memberA,
        answers: positiveFeedback,
        allowPairModelUse: true,
        auditRequest,
      })
    );
    assert.equal(partial.dataStatus, 'PARTIAL');
    assert.equal(partial.bothSubmitted, false);
    const partialRetry = await freeCall('cycle 1 feedback A retry', () =>
      activitiesService.checkinActivity({
        activityId,
        currentUserId: memberA,
        answers: positiveFeedback,
        allowPairModelUse: true,
        auditRequest,
      })
    );
    assert.equal(partialRetry.dataStatus, 'PARTIAL');
    const afterARetry = await PairActivity.findById(activityId).lean();
    assert.ok(afterARetry);
    assert.equal(
      afterARetry.answers?.length,
      positiveFeedback.length,
      'same-role feedback retry appended duplicate answers'
    );

    const enough = await freeCall('cycle 1 feedback B', () =>
      activitiesService.checkinActivity({
        activityId,
        currentUserId: memberB,
        answers: positiveFeedback,
        allowPairModelUse: true,
        auditRequest,
      })
    );
    assert.equal(enough.dataStatus, 'ENOUGH');
    assert.equal(enough.bothSubmitted, true);
    const afterBoth = await PairActivity.findById(activityId).lean();
    assert.ok(afterBoth);
    const feedbackAnswers = afterBoth.answers ?? [];
    assert.equal(feedbackAnswers.length, positiveFeedback.length * 2);
    assert.equal(
      new Set(
        feedbackAnswers.map((answer) => `${answer.by}:${answer.checkInId}`)
      ).size,
      feedbackAnswers.length,
      'feedback contains duplicate role/question effects'
    );

    const taskResultEvents = await EvidenceEvent.find({
      pairId: inviteEvidence.pairId,
      sourceType: 'TASK_RESULT',
      sourceRef: { $regex: `^pair-activity:${activityId}:feedback:` },
      status: 'ACCEPTED',
    }).lean();
    assert.ok(taskResultEvents.length > 0, 'check-in did not record TASK_RESULT evidence');
    assert.ok(
      taskResultEvents.every(
        (event) =>
          event.captureMode === 'PAIR_MODEL_ONLY' &&
          event.purpose === 'PAIR_MODEL' &&
          event.retentionClass === 'PAIR_CONTEXT'
      ),
      'consented check-in evidence was not isolated to the pair model'
    );
    const completed = await freeCall('cycle 1 complete activity', () =>
      activitiesService.completeActivity({
        activityId,
        currentUserId: memberA,
        auditRequest,
      })
    );
    assert.equal(completed.status, 'completed_success');
    assert.equal(completed.resultSummary.dataStatus, 'ENOUGH');
    const factorEventsAfterCompletion = await EvidenceEvent.find({
      pairId: inviteEvidence.pairId,
      sourceRef: { $regex: `^pair-activity:${activityId}:` },
      status: 'ACCEPTED',
    }).lean();
    assert.ok(
      factorEventsAfterCompletion.some((event) => event.sourceType === 'PAIR_ACTIVITY'),
      'activity completion did not persist PAIR_ACTIVITY evidence'
    );

    const completionRetry = await freeCall('cycle 1 complete activity retry', () =>
      activitiesService.completeActivity({
        activityId,
        currentUserId: memberA,
        auditRequest,
      })
    );
    assert.equal(completionRetry.status, 'completed_success');
    const [
      finalActivity,
      factorEventsAfterRetry,
      individualSnapshots,
      pairSnapshots,
      pairEvaluationSnapshots,
    ] =
      await Promise.all([
        PairActivity.findById(activityId).lean(),
        EvidenceEvent.find({
          pairId: inviteEvidence.pairId,
          sourceRef: { $regex: `^pair-activity:${activityId}:` },
          status: 'ACCEPTED',
        }).lean(),
        IndividualFactorSnapshot.find({
          contextPairId: inviteEvidence.pairId,
          evidenceIds: { $in: factorEventsAfterCompletion.map((event) => event.eventId) },
        }).lean(),
        PairFactorSnapshot.find({
          pairId: inviteEvidence.pairId,
          evidenceIds: { $in: factorEventsAfterCompletion.map((event) => event.eventId) },
        }).lean(),
        PairFactorEvaluationSnapshot.find({
          pairId: inviteEvidence.pairId,
        }).lean(),
      ]);
    assert.ok(finalActivity);
    assert.equal(finalActivity.status, 'completed_success');
    assert.equal(finalActivity.resultSummary?.factorEvidenceRecorded, true);
    assert.equal(
      factorEventsAfterRetry.length,
      factorEventsAfterCompletion.length,
      'completion retry duplicated immutable Factor evidence'
    );
    assert.ok(individualSnapshots.length > 0, 'individual Factor snapshots missing');
    assert.ok(pairSnapshots.length > 0, 'pair Factor snapshots missing');
    assert.ok(pairEvaluationSnapshots.length > 0, 'pair evaluations missing');
    assert.equal(
      await RecommendationDecision.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
        cycleKey: weeklyEvidence.weekKey,
      }),
      1
    );
    assert.equal(
      await PairActivity.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
      }),
      1
    );

    const finalActivityDocument = await PairActivity.findById(activityId);
    assert.ok(finalActivityDocument);
    const activityDto = toPairActivityDTO(
      finalActivityDocument.toObject<
        PairActivityType & { _id: Types.ObjectId }
      >()
    );
    assertNoForbiddenKeys(
      activityDto,
      [
        'answers',
        'successScore',
        'effect',
        'recommendationProvenance',
        'stateMeta',
        'members',
        'submittedBy',
        'usefulnessAvg',
        'comfortAvg',
        'tensionAvg',
        'wantsSimilarRatio',
        'participationRatio',
        'subjectiveChangeAvg',
        'difficultyAvg',
        'effectApplied',
        'effectExplanation',
        'factorEvidence',
        'taskResultEventIds',
        'pairActivityEventIds',
        'individualSnapshotIds',
        'pairSnapshotIds',
        'pairEvaluationSnapshotIds',
      ],
      'activity DTO'
    );

    return {
      activityId,
      activityDto,
      feedbackAnswers: feedbackAnswers.length,
      factorEvents: factorEventsAfterRetry.length,
    };
  });

  const cycleRuns: Array<{
    cycleNumber: number;
    weekKey: string;
    factorEvidenceEvents: number;
    individualFactorSnapshots: number;
    pairEvaluations: number;
    legacySnapshotRevision: number;
    legacySnapshotCount: number;
    cycleId: string;
    snapshotId: string;
    decisionId: string;
    templateId: string;
    actionKey: string;
    activityId: string;
    feedbackAnswers: number;
    activityFactorEvents: number;
  }> = [
    {
      cycleNumber: 1,
      weekKey: weeklyEvidence.weekKey,
      factorEvidenceEvents: weeklyEvidence.factorEvidenceEvents,
      individualFactorSnapshots: weeklyEvidence.individualFactorSnapshots,
      pairEvaluations: weeklyEvidence.pairEvaluations,
      legacySnapshotRevision: weeklyEvidence.latestSnapshot.revision,
      legacySnapshotCount: weeklyEvidence.snapshotCount,
      cycleId: String(weeklyEvidence.cycle._id),
      snapshotId: String(weeklyEvidence.latestSnapshot._id),
      decisionId: recommendationEvidence.decision.id,
      templateId: recommendationEvidence.templateId,
      actionKey: recommendationEvidence.decision.activity.actionDefinition.key,
      activityId: activityEvidence.activityId,
      feedbackAnswers: activityEvidence.feedbackAnswers,
      activityFactorEvents: activityEvidence.factorEvents,
    },
  ];

  for (let cycleIndex = 1; cycleIndex < cycleDates.length; cycleIndex += 1) {
    const cycleNumber = cycleIndex + 1;
    const cycleDate = cycleDates[cycleIndex];
    const notes = privateNotesByCycle[cycleIndex];
    assert.ok(cycleDate && notes);
    mock.timers.setTime(cycleDate.getTime());

    const weekly = await timed(`weeklyCycle${cycleNumber}`, async () => {
      const weekKey = currentWeekKey();
      const answersA = {
        closeness: 0.72 + cycleIndex * 0.02,
        fatigue: 0.3 - cycleIndex * 0.02,
        irritation: 0.2 - cycleIndex * 0.02,
        readiness: 0.76 + cycleIndex * 0.02,
        unresolvedTopic: false,
        note: notes.memberA,
      };
      const answersB = {
        closeness: 0.68 + cycleIndex * 0.02,
        fatigue: 0.32 - cycleIndex * 0.02,
        irritation: 0.22 - cycleIndex * 0.02,
        readiness: 0.74 + cycleIndex * 0.02,
        unresolvedTopic: false,
        note: notes.memberB,
      };
      const submittedA = await freeCall(`cycle ${cycleNumber} submit A`, () =>
        weeklyCheckInService.submit({
          currentUserId: memberA,
          pairId: inviteEvidence.pairId,
          weekKey,
          answers: answersA,
          auditRequest,
        })
      );
      const retriedA = await freeCall(`cycle ${cycleNumber} retry A`, () =>
        weeklyCheckInService.submit({
          currentUserId: memberA,
          pairId: inviteEvidence.pairId,
          weekKey,
          answers: answersA,
          auditRequest,
        })
      );
      assert.equal(retriedA.id, submittedA.id);
      await freeCall(`cycle ${cycleNumber} submit B`, () =>
        weeklyCheckInService.submit({
          currentUserId: memberB,
          pairId: inviteEvidence.pairId,
          weekKey,
          answers: answersB,
          auditRequest,
        })
      );

      const pair = await Pair.findById(inviteEvidence.pairId);
      assert.ok(pair);
      const [canonical, ownerA, ownerB] = await Promise.all([
        freeCall(`cycle ${cycleNumber} pair projection`, () =>
          weeklyCycleService.current({ pair, currentUserId: memberA })
        ),
        freeCall(`cycle ${cycleNumber} owner A projection`, () =>
          weeklyCheckInService.current({
            currentUserId: memberA,
            pairId: inviteEvidence.pairId,
            weekKey,
          })
        ),
        freeCall(`cycle ${cycleNumber} owner B projection`, () =>
          weeklyCheckInService.current({
            currentUserId: memberB,
            pairId: inviteEvidence.pairId,
            weekKey,
          })
        ),
      ]);
      assert.equal(canonical.pair.dataStatus, 'ENOUGH');
      assert.equal(canonical.pair.bothSubmitted, true);
      assert.ok(ownerA && ownerB);
      assert.equal(ownerA.answers.note, notes.memberA);
      assert.equal(ownerB.answers.note, notes.memberB);
      assertOmitsSecrets(canonical, [notes.memberA, notes.memberB], `cycle ${cycleNumber}`);

      const cycle = await WeeklyCycle.findOne({
        pairId: pair._id,
        cycleKey: weekKey,
      }).lean();
      assert.ok(cycle?.latestSnapshotId);
      assert.equal(cycle.pairReadiness, 'ENOUGH');
      assert.equal(cycle.submissionCount, 2);
      const latestSnapshot = await PairStateSnapshot.findById(
        cycle.latestSnapshotId
      ).lean();
      assert.ok(latestSnapshot);
      assert.equal(latestSnapshot.dataStatus, 'ENOUGH');
      const legacySnapshotCount = await PairStateSnapshot.countDocuments({
        cycleId: cycle._id,
      });
      const factorCounts = await assertSemanticWeeklyFactors({
        pairId: inviteEvidence.pairId,
        weekKey,
      });
      assert.deepEqual(
        [...latestSnapshot.input.evidenceRevisionIds].sort(),
        [...factorCounts.latestPairEvaluationSnapshotIds].sort(),
        `cycle ${cycleNumber} canonical provenance did not use Factor evaluations`
      );
      return {
        weekKey,
        cycle,
        latestSnapshot,
        legacySnapshotCount,
        ...factorCounts,
      };
    });

    const recommendation = await timed(`recommendation${cycleNumber}`, async () => {
      const offered = await freeCall(`cycle ${cycleNumber} recommendation`, () =>
        recommendationWorkflowService.offer({
          pairId: inviteEvidence.pairId,
          currentUserId: memberA,
          auditRequest,
        })
      );
      const retry = await freeCall(`cycle ${cycleNumber} recommendation retry`, () =>
        recommendationWorkflowService.offer({
          pairId: inviteEvidence.pairId,
          currentUserId: memberB,
          auditRequest,
        })
      );
      assert.equal(retry.id, offered.id);
      assert.equal(retry.activity.id, offered.activity.id);
      const [storedDecision, storedActivity] = await Promise.all([
        RecommendationDecision.findById(offered.id).lean(),
        PairActivity.findById(offered.activity.id).lean(),
      ]);
      assert.ok(storedDecision?.provenance);
      assert.ok(storedActivity?.recommendationProvenance);
      assert.equal(String(storedDecision.provenance.cycleId), String(weekly.cycle._id));
      assert.equal(
        String(storedDecision.provenance.snapshotId),
        String(weekly.latestSnapshot._id)
      );
      assert.ok(storedActivity.actionDefinition);
      assert.ok(storedActivity.targetFactorKeys.length > 0);
      assert.equal(Object.prototype.hasOwnProperty.call(storedActivity, 'axis'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(storedActivity, 'effect'), false);
      const templateId = storedActivity.stateMeta?.templateId;
      assert.equal(typeof templateId, 'string');
      assert.ok(
        SYSTEM_ACTIVITY_TEMPLATES.some(
          (template) => String(template._id) === templateId
        )
      );
      return {
        decision: offered,
        templateId: String(templateId),
        actionKey: storedActivity.actionDefinition.key,
      };
    });

    const activity = await timed(`activityLifecycle${cycleNumber}`, async () => {
      await freeCall(`cycle ${cycleNumber} accept activity`, () =>
        recommendationWorkflowService.accept({
          pairId: inviteEvidence.pairId,
          decisionId: recommendation.decision.id,
          currentUserId: memberA,
          auditRequest,
        })
      );
      const activityId = recommendation.decision.activity.id;
      await freeCall(`cycle ${cycleNumber} start activity`, () =>
        activitiesService.startActivity({
          activityId,
          currentUserId: memberA,
          auditRequest,
        })
      );
      const document = await PairActivity.findById(activityId);
      assert.ok(document);
      const dto = toPairActivityDTO(
        document.toObject<PairActivityType & { _id: Types.ObjectId }>()
      );
      const positiveFeedback = dto.checkIns.map((checkIn) => ({
        checkInId: checkIn.id,
        ui: checkIn.map.length,
      }));
      await freeCall(`cycle ${cycleNumber} feedback A`, () =>
        activitiesService.checkinActivity({
          activityId,
          currentUserId: memberA,
          answers: positiveFeedback,
          allowPairModelUse: true,
          auditRequest,
        })
      );
      const enough = await freeCall(`cycle ${cycleNumber} feedback B`, () =>
        activitiesService.checkinActivity({
          activityId,
          currentUserId: memberB,
          answers: positiveFeedback,
          allowPairModelUse: true,
          auditRequest,
        })
      );
      assert.equal(enough.dataStatus, 'ENOUGH');
      const completed = await freeCall(`cycle ${cycleNumber} complete activity`, () =>
        activitiesService.completeActivity({
          activityId,
          currentUserId: memberA,
          auditRequest,
        })
      );
      assert.equal(completed.status, 'completed_success');
      const completionRetry = await freeCall(
        `cycle ${cycleNumber} complete retry`,
        () =>
          activitiesService.completeActivity({
            activityId,
            currentUserId: memberB,
            auditRequest,
          })
      );
      assert.equal(completionRetry.status, 'completed_success');

      const stored = await PairActivity.findById(activityId).lean();
      assert.ok(stored?.resultSummary?.factorEvidenceRecorded);
      const provenance = stored.resultSummary.factorEvidence;
      const factorEventIds = unique([
        ...provenance.taskResultEventIds,
        ...provenance.pairActivityEventIds,
      ]);
      const [factorEvents, pairSnapshots, evaluations] = await Promise.all([
        EvidenceEvent.find({ eventId: { $in: factorEventIds } }).lean(),
        PairFactorSnapshot.find({
          snapshotId: { $in: provenance.pairSnapshotIds },
        }).lean(),
        PairFactorEvaluationSnapshot.find({
          snapshotId: { $in: provenance.pairEvaluationSnapshotIds },
        }).lean(),
      ]);
      assert.equal(factorEvents.length, factorEventIds.length);
      assert.ok(
        factorEvents.some((event) => event.sourceType === 'TASK_RESULT') &&
          factorEvents.some((event) => event.sourceType === 'PAIR_ACTIVITY')
      );
      assert.ok(pairSnapshots.length > 0);
      assert.ok(evaluations.length > 0);
      assert.equal(
        await EvidenceEvent.countDocuments({ eventId: { $in: factorEventIds } }),
        factorEvents.length,
        'completion retry duplicated activity Factor evidence'
      );
      return {
        activityId,
        feedbackAnswers: stored.answers?.length ?? 0,
        factorEvents: factorEvents.length,
      };
    });

    cycleRuns.push({
      cycleNumber,
      weekKey: weekly.weekKey,
      factorEvidenceEvents: weekly.factorEvidenceEvents,
      individualFactorSnapshots: weekly.individualFactorSnapshots,
      pairEvaluations: weekly.pairEvaluations,
      legacySnapshotRevision: weekly.latestSnapshot.revision,
      legacySnapshotCount: weekly.legacySnapshotCount,
      cycleId: String(weekly.cycle._id),
      snapshotId: String(weekly.latestSnapshot._id),
      decisionId: recommendation.decision.id,
      templateId: recommendation.templateId,
      actionKey: recommendation.actionKey,
      activityId: activity.activityId,
      feedbackAnswers: activity.feedbackAnswers,
      activityFactorEvents: activity.factorEvents,
    });
  }

  const assertHistoryPrivacy = async (): Promise<void> => {
    await timed('historyPrivacy', async () => {
      const pair = await Pair.findById(inviteEvidence.pairId);
      assert.ok(pair, 'pair was not reloadable for history');
      const roleA = pair.members[0] === memberA ? 'A' : 'B';
      const roleB = roleA === 'A' ? 'B' : 'A';
      const [historyA, historyB] = await Promise.all([
        freeCall('history A', () =>
          pairHistoryService.list({ pair, role: roleA, limit: 20 })
        ),
        freeCall('history B', () =>
          pairHistoryService.list({ pair, role: roleB, limit: 20 })
        ),
      ]);
      for (const [surface, history] of [
        ['pair history A', historyA] as const,
        ['pair history B', historyB] as const,
      ]) {
        for (const cycle of cycleRuns) {
          assert.ok(
            history.items.some(
              (item) => item.kind === 'activity' && item.id === cycle.activityId
            ),
            `${surface} omitted cycle ${cycle.cycleNumber} activity`
          );
        }
        assertNoForbiddenKeys(
          history,
          [
            'answers',
            'note',
            'closeness',
            'fatigue',
            'irritation',
            'readiness',
            'unresolvedTopic',
            'successScore',
            'effect',
            'recommendationProvenance',
            'stateMeta',
            'submittedBy',
          ],
          surface
        );
        assertOmitsSecrets(
          history,
          privateNotesByCycle.flatMap((notes) => [notes.memberA, notes.memberB]),
          surface
        );
      }
    });
  };

  const notificationCount = await timed('notifications', async () => {
    const notificationSpecs: Array<{
      userIds: string[];
      pairId: string;
      type: NotificationType;
      sourceKey: string;
    }> = [
      {
        userIds: memberIds,
        pairId: inviteEvidence.pairId,
        type: 'PAIR_JOINED',
        sourceKey: `pair_invite:${inviteEvidence.inviteId}`,
      },
      ...cycleRuns.flatMap(
        (cycle): Array<{
          userIds: string[];
          pairId: string;
          type: NotificationType;
          sourceKey: string;
        }> => [
          {
            userIds: memberIds,
            pairId: inviteEvidence.pairId,
            type: 'CYCLE_AVAILABLE',
            sourceKey: `cycle:${cycle.cycleId}`,
          },
          {
            userIds: memberIds,
            pairId: inviteEvidence.pairId,
            type: 'SUMMARY_READY',
            sourceKey: `snapshot:${cycle.snapshotId}`,
          },
          {
            userIds: memberIds,
            pairId: inviteEvidence.pairId,
            type: 'ACTION_AVAILABLE',
            sourceKey: `decision:${cycle.decisionId}`,
          },
          {
            userIds: [memberB],
            pairId: inviteEvidence.pairId,
            type: 'FEEDBACK_REQUESTED',
            sourceKey: `activity:${cycle.activityId}`,
          },
        ]
      ),
    ];
    await Promise.all(
      notificationSpecs.flatMap((spec) => [
        notificationService.create(spec),
        notificationService.create(spec),
      ])
    );

    const [pageA, pageB, duplicateNotifications, count] = await Promise.all([
      notificationService.list({ currentUserId: memberA, limit: 50 }),
      notificationService.list({ currentUserId: memberB, limit: 50 }),
      Notification.aggregate<{ count: number }>([
        { $match: { pairId: new Types.ObjectId(inviteEvidence.pairId) } },
        {
          $group: {
            _id: { userId: '$userId', dedupeKey: '$dedupeKey' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]),
      Notification.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
      }),
    ]);
    const expectedA = 1 + cycleRuns.length * 3;
    const expectedB = 1 + cycleRuns.length * 4;
    assert.equal(pageA.items.length, expectedA);
    assert.equal(pageB.items.length, expectedB);
    assert.equal(pageA.unreadCount, expectedA);
    assert.equal(pageB.unreadCount, expectedB);
    assert.equal(
      count,
      expectedA + expectedB,
      'notification types or dedupe count drifted'
    );
    assert.equal(duplicateNotifications.length, 0, 'notifications duplicated');
    assertNoForbiddenKeys(
      pageA,
      ['userId', 'pairId', 'dedupeKey', 'expiresAt'],
      'notification DTO'
    );
    return count;
  });

  const auditEvents = await EventLog.find({
    $or: [
      { 'actor.userId': { $in: memberIds } },
      { 'context.pairId': inviteEvidence.pairId },
    ],
  }).lean();
  assert.ok(auditEvents.length > 0, 'acceptance flow did not emit audit events');
  assertOmitsSecrets(
    auditEvents,
    [
      ...privateNotesByCycle.flatMap((notes) => [notes.memberA, notes.memberB]),
      inviteEvidence.token,
    ],
    'audit events'
  );
  assert.doesNotMatch(
    JSON.stringify(auditEvents),
    /ENTITLEMENT_REQUIRED|PAYWALL|PAYMENT_REQUIRED|"status":402/i,
    'free-cycle flow emitted a paid-access failure'
  );
  await assertHistoryPrivacy();
  assert.ok(cycleRuns.length >= 3, 'fewer than three free cycles were exercised');
  assert.deepEqual(
    cycleRuns.map((cycle) => cycle.weekKey),
    cycleDates.map((cycleDate) => currentWeekKey(cycleDate)),
    'weekly cycles were not exercised in the expected consecutive weeks'
  );
  const [weeklySubmissionCount, weeklyCycleCount, decisionCount, activityCount] =
    await Promise.all([
      WeeklyCheckIn.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
      }),
      WeeklyCycle.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
      }),
      RecommendationDecision.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
      }),
      PairActivity.countDocuments({
        pairId: new Types.ObjectId(inviteEvidence.pairId),
      }),
    ]);
  assert.equal(weeklySubmissionCount, cycleRuns.length * 2);
  assert.equal(weeklyCycleCount, cycleRuns.length);
  assert.equal(decisionCount, cycleRuns.length);
  assert.equal(activityCount, cycleRuns.length);

  return {
    replicaSet,
    invite: {
      concurrentAttempts: inviteEvidence.concurrentAttempts,
      concurrentSuccesses: inviteEvidence.concurrentSuccesses,
      retryableConflicts: inviteEvidence.retryableConflicts,
      retryAlreadyAccepted: inviteEvidence.retryAlreadyAccepted,
    },
    cycles: cycleRuns.map((cycle) => ({
      cycleNumber: cycle.cycleNumber,
      weekKey: cycle.weekKey,
      dataStatus: 'ENOUGH' as const,
      factorEvidenceEvents: cycle.factorEvidenceEvents,
      individualFactorSnapshots: cycle.individualFactorSnapshots,
      pairEvaluations: cycle.pairEvaluations,
      legacySnapshotRevision: cycle.legacySnapshotRevision,
      legacySnapshotCount: cycle.legacySnapshotCount,
      decisionId: cycle.decisionId,
      templateId: cycle.templateId,
      actionKey: cycle.actionKey,
      activityId: cycle.activityId,
      feedbackAnswers: cycle.feedbackAnswers,
      activityFactorEvents: cycle.activityFactorEvents,
      historyVisibleForBoth: true as const,
    })),
    freeAccessVerified: true,
    counts: {
      pairs: 1,
      membershipClaims: 2,
      weeklySubmissions: cycleRuns.length * 2,
      weeklyCycles: cycleRuns.length,
      recommendationDecisions: cycleRuns.length,
      activities: cycleRuns.length,
      notifications: notificationCount,
      auditEvents: auditEvents.length,
    },
    privacy: {
      peerWeeklyRawProjected: false,
      activityRawProjected: false,
      historyRawProjected: false,
      auditSecretsRecorded: false,
    },
  };
};

const main = async (): Promise<void> => {
  let evidence: AcceptanceEvidence | undefined;
  let fakeClockEnabled = false;
  await timed('connect', async () => {
    await mongoose.connect(mongodbUri, {
      autoIndex: false,
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5_000,
    });
  });

  try {
    const db = mongoose.connection.db;
    assert.ok(db, 'Mongo database connection is unavailable');
    const hello = await db.admin().command({ hello: 1 });
    assert.equal(
      hello.setName,
      expectedReplicaSet,
      'Mongo connection is not using the requested replica set'
    );
    mock.timers.enable({ apis: ['Date'], now: cycleDates[0] });
    fakeClockEnabled = true;
    evidence = await runAcceptance(String(hello.setName));
  } finally {
    if (fakeClockEnabled) {
      mock.timers.reset();
    }
    if (mongoose.connection.readyState === 1) {
      await timed('cleanup', cleanupRunScope);
    }
    if (mongoose.connection.readyState !== 0) {
      await timed('disconnect', async () => mongoose.disconnect());
    }
  }

  assert.ok(evidence, 'acceptance evidence was not produced');
  console.log(
    JSON.stringify({
      suite: 'two-user-mvp',
      status: 'passed',
      database: databaseName,
      evidence,
      timingsMs,
    })
  );
};

void main().catch((error: Error) => {
  const code = error instanceof DomainError ? `${error.code}: ` : '';
  const message = `${code}${error.message}`;
  console.error(
    JSON.stringify({
      suite: 'two-user-mvp',
      status: message.startsWith('SERVICE_CONTRACT_BLOCKER:')
        ? 'blocked'
        : 'failed',
      database: databaseName,
      error: message,
      timingsMs,
    })
  );
  process.exitCode = 1;
});
