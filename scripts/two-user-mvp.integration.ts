import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { activitiesService } from '@/domain/services/activities.service';
import { pairHistoryService } from '@/domain/services/pairHistory.service';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import {
  SYSTEM_ACTIVITY_TEMPLATES,
} from '@/domain/services/pairActivityDecision.service';
import { notificationService } from '@/domain/services/notification.service';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import {
  currentWeekKey,
  toPairWeeklyCheckInPairDTO,
  weeklyCheckInService,
} from '@/domain/services/weeklyCheckIn.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { toPairActivityDTO } from '@/lib/dto/activity.dto';
import { EventLog } from '@/models/EventLog';
import { Insight } from '@/models/Insight';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import {
  Notification,
  type NotificationType,
} from '@/models/Notification';
import { Pair } from '@/models/Pair';
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
import { VectorSnapshot } from '@/models/VectorSnapshot';
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
const privateNoteA = `weekly-private-a-${runId}`;
const privateNoteB = `weekly-private-b-${runId}`;
const timingsMs: Record<string, number> = {};

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
  canonical: {
    weekKey: string;
    dataStatus: 'ENOUGH';
    snapshotRevision: number;
    snapshotCount: number;
  };
  recommendation: {
    templateId: string;
    decisionVersion: 'recommendation-decision-v1';
    provenanceVersion: 'recommendation-provenance-v1';
  };
  activity: {
    status: 'completed_success';
    feedbackRoles: number;
    feedbackAnswers: number;
    effectSnapshots: number;
  };
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

const cleanupRunScope = async (): Promise<void> => {
  const pairs = await Pair.find({ key: pairKey }).select({ _id: 1 });
  const pairIds = pairs.map((pair) => pair._id);
  const pairIdStrings = pairIds.map(String);
  const mixedPairIds: Array<Types.ObjectId | string> = [
    ...pairIds,
    ...pairIdStrings,
  ];

  await Promise.all([
    EventLog.deleteMany({
      $or: [
        { 'actor.userId': { $in: memberIds } },
        { 'context.pairId': { $in: pairIdStrings } },
      ],
    }),
    Notification.deleteMany({ userId: { $in: memberIds } }),
    RecommendationDecision.deleteMany({ pairId: { $in: pairIds } }),
    PairActivity.deleteMany({ pairId: { $in: pairIds } }),
    VectorSnapshot.deleteMany({
      $or: [
        { userId: { $in: memberIds } },
        { pairId: { $in: mixedPairIds } },
      ],
    }),
    Insight.deleteMany({
      $or: [
        { userId: { $in: memberIds } },
        { pairId: { $in: mixedPairIds } },
      ],
    }),
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
    RecommendationDecision.countDocuments({ pairId: { $in: pairIds } }),
    PairActivity.countDocuments({ pairId: { $in: pairIds } }),
    VectorSnapshot.countDocuments({
      $or: [
        { userId: { $in: memberIds } },
        { pairId: { $in: mixedPairIds } },
      ],
    }),
    Insight.countDocuments({
      $or: [
        { userId: { $in: memberIds } },
        { pairId: { $in: mixedPairIds } },
      ],
    }),
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
    Pair.createIndexes(),
    PairInvite.createIndexes(),
    PairMembershipClaim.createIndexes(),
    WeeklyCheckIn.createIndexes(),
    WeeklyCycle.createIndexes(),
    PairStateSnapshot.createIndexes(),
    RecommendationDecision.createIndexes(),
    Notification.createIndexes(),
  ]);
};

const runAcceptance = async (
  replicaSet: string
): Promise<AcceptanceEvidence> => {
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

    const concurrentAttempts = 4;
    const outcomes = await Promise.all(
      Array.from({ length: concurrentAttempts }, async (): Promise<ConcurrentAcceptOutcome> => {
        try {
          const result = await pairInviteService.accept({
            currentUserId: memberB,
            token: issued.token,
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

    const retry = await pairInviteService.accept({
      currentUserId: memberB,
      token: issued.token,
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

    const safePairProjection = toPairWeeklyCheckInPairDTO(internalPairSummary);
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
    assert.deepEqual(
      [...latestSnapshot.input.evidenceRevisionIds].sort(),
      [ownerA.id, ownerB.id].sort()
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
    const accepted = await recommendationWorkflowService.accept({
      pairId: inviteEvidence.pairId,
      decisionId: recommendationEvidence.decision.id,
      currentUserId: memberA,
      auditRequest,
    });
    const acceptedRetry = await recommendationWorkflowService.accept({
      pairId: inviteEvidence.pairId,
      decisionId: recommendationEvidence.decision.id,
      currentUserId: memberA,
      auditRequest,
    });
    assert.equal(accepted.status, 'ACCEPTED');
    assert.equal(acceptedRetry.status, 'ACCEPTED');

    const activityId = recommendationEvidence.decision.activity.id;
    await activitiesService.startActivity({
      activityId,
      currentUserId: memberA,
      auditRequest,
    });
    const started = await PairActivity.findById(activityId).lean();
    assert.ok(started?.startedAt, 'explicit START did not persist startedAt');
    assert.equal(started.status, 'in_progress');
    const firstStartedAt = started.startedAt.getTime();
    await activitiesService.startActivity({
      activityId,
      currentUserId: memberA,
      auditRequest,
    });
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

    const partial = await activitiesService.checkinActivity({
      activityId,
      currentUserId: memberA,
      answers: positiveFeedback,
      auditRequest,
    });
    assert.equal(partial.dataStatus, 'PARTIAL');
    assert.equal(partial.bothSubmitted, false);
    const partialRetry = await activitiesService.checkinActivity({
      activityId,
      currentUserId: memberA,
      answers: positiveFeedback,
      auditRequest,
    });
    assert.equal(partialRetry.dataStatus, 'PARTIAL');
    const afterARetry = await PairActivity.findById(activityId).lean();
    assert.ok(afterARetry);
    assert.equal(
      afterARetry.answers?.length,
      positiveFeedback.length,
      'same-role feedback retry appended duplicate answers'
    );

    const enough = await activitiesService.checkinActivity({
      activityId,
      currentUserId: memberB,
      answers: positiveFeedback,
      auditRequest,
    });
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

    const pairBeforeCompletion = await Pair.findById(inviteEvidence.pairId).lean();
    assert.ok(pairBeforeCompletion);
    const completedBefore = pairBeforeCompletion.progress?.completed ?? 0;
    const completed = await activitiesService.completeActivity({
      activityId,
      currentUserId: memberA,
      auditRequest,
    });
    assert.equal(completed.status, 'completed_success');
    assert.equal(completed.resultSummary.dataStatus, 'ENOUGH');
    const effectsAfterCompletion = await VectorSnapshot.find({
      'reason.source': 'activity_completion',
      'reason.activityId': activityId,
    }).lean();
    assert.ok(
      effectsAfterCompletion.length > 0,
      'activity completion did not persist effects'
    );

    const completionRetry = await activitiesService.completeActivity({
      activityId,
      currentUserId: memberA,
      auditRequest,
    });
    assert.equal(completionRetry.status, 'completed_success');
    const [finalActivity, finalPair, effectsAfterRetry, duplicateEffects] =
      await Promise.all([
        PairActivity.findById(activityId).lean(),
        Pair.findById(inviteEvidence.pairId).lean(),
        VectorSnapshot.find({
          'reason.source': 'activity_completion',
          'reason.activityId': activityId,
        }).lean(),
        VectorSnapshot.aggregate<{ count: number }>([
          {
            $match: {
              'reason.source': 'activity_completion',
              'reason.activityId': activityId,
            },
          },
          {
            $group: {
              _id: {
                userId: '$userId',
                axis: '$axis',
                layer: '$layer',
              },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ]),
      ]);
    assert.ok(finalActivity);
    assert.ok(finalPair);
    assert.equal(finalActivity.status, 'completed_success');
    assert.equal(finalActivity.resultSummary?.effectApplied, true);
    assert.equal(
      effectsAfterRetry.length,
      effectsAfterCompletion.length,
      'completion retry reapplied vector effects'
    );
    assert.equal(duplicateEffects.length, 0, 'activity effects duplicated');
    assert.equal(
      finalPair.progress?.completed,
      completedBefore + 1,
      'completion retry incremented pair progress twice'
    );
    assert.equal(
      await RecommendationDecision.countDocuments({
        pairId: finalPair._id,
        cycleKey: weeklyEvidence.weekKey,
      }),
      1
    );
    assert.equal(await PairActivity.countDocuments({ pairId: finalPair._id }), 1);

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
      ],
      'activity DTO'
    );

    return {
      activityId,
      activityDto,
      finalPair,
      feedbackAnswers: feedbackAnswers.length,
      effectSnapshots: effectsAfterRetry.length,
    };
  });

  const assertHistoryPrivacy = async (): Promise<void> => {
    await timed('historyPrivacy', async () => {
      const pair = await Pair.findById(inviteEvidence.pairId);
      assert.ok(pair, 'pair was not reloadable for history');
      const roleA = pair.members[0] === memberA ? 'A' : 'B';
      const roleB = roleA === 'A' ? 'B' : 'A';
      const [historyA, historyB, storedActivity, users] = await Promise.all([
        pairHistoryService.list({ pair, role: roleA, limit: 20 }),
        pairHistoryService.list({ pair, role: roleB, limit: 20 }),
        PairActivity.findById(activityEvidence.activityId).lean(),
        User.find({ id: { $in: memberIds } }).select({ _id: 1 }).lean(),
      ]);
      assert.ok(storedActivity);
      const assignedValue = storedActivity.stateMeta?.assignedMemberIds;
      const assignedMemberIds = Array.isArray(assignedValue)
        ? assignedValue.filter(
            (value): value is string => typeof value === 'string'
          )
        : [];
      const internalUserObjectIds = users.map((user) => String(user._id));
      const assignedInternalIdsInsteadOfExternalIds =
        assignedMemberIds.length === 2 &&
        assignedMemberIds.every((id) => internalUserObjectIds.includes(id)) &&
        assignedMemberIds.every((id) => !memberIds.includes(id));
      for (const [surface, history] of [
        ['pair history A', historyA] as const,
        ['pair history B', historyB] as const,
      ]) {
        const includesCompletedActivity = history.items.some(
          (item) =>
            item.kind === 'activity' && item.id === activityEvidence.activityId
        );
        if (
          !includesCompletedActivity &&
          assignedInternalIdsInsteadOfExternalIds
        ) {
          assert.fail(
            'SERVICE_CONTRACT_BLOCKER: pair history filters external Pair.members IDs, but the recommendation stored stateMeta.assignedMemberIds as internal User ObjectId strings'
          );
        }
        assert.ok(
          includesCompletedActivity,
          `${surface} omitted the completed activity`
        );
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
        assertOmitsSecrets(history, [privateNoteA, privateNoteB], surface);
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
        sourceKey: `invite:${inviteEvidence.inviteId}`,
      },
      {
        userIds: memberIds,
        pairId: inviteEvidence.pairId,
        type: 'CYCLE_AVAILABLE',
        sourceKey: `cycle:${String(weeklyEvidence.cycle._id)}`,
      },
      {
        userIds: memberIds,
        pairId: inviteEvidence.pairId,
        type: 'SUMMARY_READY',
        sourceKey: `snapshot:${String(weeklyEvidence.latestSnapshot._id)}`,
      },
      {
        userIds: memberIds,
        pairId: inviteEvidence.pairId,
        type: 'ACTION_AVAILABLE',
        sourceKey: `decision:${recommendationEvidence.decision.id}`,
      },
      {
        userIds: [memberB],
        pairId: inviteEvidence.pairId,
        type: 'FEEDBACK_REQUESTED',
        sourceKey: `activity:${activityEvidence.activityId}`,
      },
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
    assert.deepEqual(
      pageA.items.map((item) => item.type).sort(),
      ['ACTION_AVAILABLE', 'CYCLE_AVAILABLE', 'PAIR_JOINED', 'SUMMARY_READY']
    );
    assert.deepEqual(
      pageB.items.map((item) => item.type).sort(),
      [
        'ACTION_AVAILABLE',
        'CYCLE_AVAILABLE',
        'FEEDBACK_REQUESTED',
        'PAIR_JOINED',
        'SUMMARY_READY',
      ]
    );
    assert.equal(pageA.unreadCount, 4);
    assert.equal(pageB.unreadCount, 5);
    assert.equal(count, 9, 'notification types or dedupe count drifted');
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
    [privateNoteA, privateNoteB, inviteEvidence.token],
    'audit events'
  );
  await assertHistoryPrivacy();

  return {
    replicaSet,
    invite: {
      concurrentAttempts: inviteEvidence.concurrentAttempts,
      concurrentSuccesses: inviteEvidence.concurrentSuccesses,
      retryableConflicts: inviteEvidence.retryableConflicts,
      retryAlreadyAccepted: inviteEvidence.retryAlreadyAccepted,
    },
    canonical: {
      weekKey: weeklyEvidence.weekKey,
      dataStatus: 'ENOUGH',
      snapshotRevision: weeklyEvidence.latestSnapshot.revision,
      snapshotCount: weeklyEvidence.snapshotCount,
    },
    recommendation: {
      templateId: recommendationEvidence.templateId,
      decisionVersion: recommendationEvidence.decision.decisionVersion,
      provenanceVersion: 'recommendation-provenance-v1',
    },
    activity: {
      status: 'completed_success',
      feedbackRoles: 2,
      feedbackAnswers: activityEvidence.feedbackAnswers,
      effectSnapshots: activityEvidence.effectSnapshots,
    },
    counts: {
      pairs: 1,
      membershipClaims: 2,
      weeklySubmissions: 2,
      weeklyCycles: 1,
      recommendationDecisions: 1,
      activities: 1,
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
    evidence = await runAcceptance(String(hello.setName));
  } finally {
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
