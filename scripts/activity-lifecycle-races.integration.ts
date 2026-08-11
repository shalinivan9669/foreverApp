import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { activitiesService } from '@/domain/services/activities.service';
import { pairsService } from '@/domain/services/pairs.service';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { buildRecommendationProvenance } from '@/domain/services/recommendationProvenance.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { EventLog } from '@/models/EventLog';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { Notification } from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { User } from '@/models/User';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import { WeeklyCycle } from '@/models/WeeklyCycle';

type Deferred = { promise: Promise<void>; resolve: () => void };

const deferred = (): Deferred => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');
const parsedMongoUri = new URL(mongodbUri);
const databaseName = decodeURIComponent(parsedMongoUri.pathname.replace(/^\//, ''));
const replicaSet = parsedMongoUri.searchParams.get('replicaSet');
if (
  parsedMongoUri.protocol !== 'mongodb:' ||
  !new Set(['127.0.0.1', 'localhost', '[::1]', '::1']).has(
    parsedMongoUri.hostname
  ) ||
  !databaseName.endsWith('_test') ||
  !replicaSet
) {
  throw new Error(
    'Integration requires an explicit local replica-set Mongo URI and a database ending in _test'
  );
}

const runId = randomUUID();
const memberA = `activity-race-a-${runId}`;
const memberB = `activity-race-b-${runId}`;
const memberIds = [memberA, memberB];
const auditRequest = {
  route: '/integration/activity-lifecycle-races',
  method: 'TEST',
};

const userFixture = (id: string) => ({
  id,
  username: id,
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

const makeActivity = (input: {
  pairId: Types.ObjectId;
  memberObjectIds: [Types.ObjectId, Types.ObjectId];
  status: PairActivityType['status'];
  now: Date;
}): PairActivityType => {
  const template = SYSTEM_ACTIVITY_TEMPLATES[0];
  if (!template) throw new Error('Canonical activity template fixture is missing');
  return {
    pairId: input.pairId,
    members: input.memberObjectIds,
    intent: template.intent,
    archetype: template.archetype,
    actionDefinition: { ...template.actionDefinition },
    targetFactorKeys: [...template.targetFactorKeys],
    title: { ru: template.title.ru, en: template.title.en },
    description: template.description
      ? { ru: template.description.ru, en: template.description.en }
      : undefined,
    why: { ...template.why },
    mode: template.mode,
    sync: template.sync,
    difficulty: template.difficulty,
    intensity: template.intensity,
    timeEstimateMin: template.timeEstimateMin,
    location: template.location,
    materials: [...(template.materials ?? [])],
    offeredAt: input.now,
    acceptedAt: input.status === 'accepted' ? input.now : undefined,
    startedAt: input.status === 'in_progress' ? input.now : undefined,
    dueAt: new Date(input.now.getTime() + 3 * 24 * 60 * 60 * 1000),
    cooldownDays: template.cooldownDays,
    requiresConsent: template.requiresConsent,
    visibility: template.visibility,
    status: input.status,
    lifecycleVersion: 'activity-lifecycle-v3',
    feedbackSchemaVersion: 'activity-feedback-v2',
    stateMeta: { templateId: String(template._id) },
    checkIns: template.checkIns.map((checkIn) => ({
      ...checkIn,
      map: [...checkIn.map],
      text: { ...checkIn.text },
    })),
    createdBy: 'system',
  };
};

const waitForGuard = async (
  reached: Promise<void>,
  operation: Promise<unknown>,
  label: string
): Promise<void> => {
  await Promise.race([
    reached,
    operation.then(
      () => {
        throw new Error(`${label} settled before its Pair lifecycle fence`);
      },
      (error: unknown) => {
        throw new Error(`${label} failed before its Pair lifecycle fence`, {
          cause: error,
        });
      }
    ),
  ]);
};

const expectUnavailable = (error: unknown): boolean =>
  error instanceof DomainError &&
  error.code === 'ACTIVITY_UNAVAILABLE' &&
  error.status === 409;

const pairFactorCounts = async (pairId: Types.ObjectId) => ({
  evidence: await EvidenceEvent.countDocuments({ pairId: String(pairId) }),
  individual: await IndividualFactorSnapshot.countDocuments({
    contextPairId: String(pairId),
  }),
  pair: await PairFactorSnapshot.countDocuments({ pairId: String(pairId) }),
  evaluation: await PairFactorEvaluationSnapshot.countDocuments({
    pairId: String(pairId),
  }),
  notifications: await Notification.countDocuments({ pairId }),
});

const ensureIndexes = async (): Promise<void> => {
  for (const model of [
    User,
    Pair,
    PairActivity,
    Notification,
    DefinitionRegistryRelease,
    EvidenceEvent,
    IndividualFactorSnapshot,
    PairFactorSnapshot,
    PairFactorEvaluationSnapshot,
    WeeklyCycle,
    PairStateSnapshot,
    WeeklyCheckIn,
    RecommendationDecision,
    EventLog,
  ]) {
    await model.createIndexes();
  }
};

const createPair = async () =>
  Pair.create({
    members: [memberA, memberB],
    key: [memberA, memberB].sort().join('|'),
    status: 'active',
    contextVersion: 'pair-context-v1',
  });

const exerciseStartVsPause = async (
  memberObjectIds: [Types.ObjectId, Types.ObjectId],
  now: Date
): Promise<string> => {
  const pair = await createPair();
  const activity = await PairActivity.create(
    makeActivity({
      pairId: pair._id as Types.ObjectId,
      memberObjectIds,
      status: 'accepted',
      now,
    })
  );
  const guardReached = deferred();
  const releaseGuard = deferred();
  const operation = activitiesService.startActivity(
    {
      activityId: String(activity._id),
      currentUserId: memberA,
      auditRequest,
    },
    {
      beforeTransactionalPairGuard: async () => {
        guardReached.resolve();
        await releaseGuard.promise;
      },
    }
  );
  await waitForGuard(guardReached.promise, operation, 'activity start');
  try {
    await pairsService.pausePair({
      pairId: String(pair._id),
      currentUserId: memberB,
      auditRequest,
    });
  } finally {
    releaseGuard.resolve();
  }
  await assert.rejects(operation, expectUnavailable);
  assert.equal((await PairActivity.findById(activity._id).lean())?.status, 'accepted');
  await pairsService.endPair({
    pairId: String(pair._id),
    currentUserId: memberA,
    auditRequest,
  });
  return String(pair._id);
};

const exercisePartialFeedbackVsEnd = async (
  memberObjectIds: [Types.ObjectId, Types.ObjectId],
  now: Date
): Promise<string> => {
  const pair = await createPair();
  const pairId = pair._id as Types.ObjectId;
  const activity = await PairActivity.create(
    makeActivity({
      pairId,
      memberObjectIds,
      status: 'in_progress',
      now,
    })
  );
  const feedback = activity.checkIns.map((checkIn) => ({
    checkInId: checkIn.id,
    ui: checkIn.map.length,
  }));
  const partial = await activitiesService.checkinActivity({
    activityId: String(activity._id),
    currentUserId: memberA,
    answers: feedback,
    allowPairModelUse: true,
    auditRequest,
  });
  assert.equal(partial.dataStatus, 'PARTIAL');
  const completed = await activitiesService.completeActivity({
    activityId: String(activity._id),
    currentUserId: memberA,
    auditRequest,
  });
  assert.equal(completed.status, 'completed_partial');
  const beforeRace = await PairActivity.findById(activity._id).lean();
  assert.ok(beforeRace);

  const guardReached = deferred();
  const releaseGuard = deferred();
  const operation = activitiesService.checkinActivity(
    {
      activityId: String(activity._id),
      currentUserId: memberB,
      answers: feedback,
      allowPairModelUse: true,
      auditRequest,
    },
    {
      beforeTransactionalPairGuard: async () => {
        guardReached.resolve();
        await releaseGuard.promise;
      },
    }
  );
  await waitForGuard(guardReached.promise, operation, 'late activity feedback');
  await pairsService.endPair({
    pairId: String(pairId),
    currentUserId: memberA,
    auditRequest,
  });
  const countsAfterEnd = await pairFactorCounts(pairId);
  releaseGuard.resolve();
  await assert.rejects(operation, expectUnavailable);

  const afterRace = await PairActivity.findById(activity._id).lean();
  assert.ok(afterRace);
  assert.deepEqual(afterRace.answers, beforeRace.answers);
  assert.deepEqual(afterRace.resultSummary, beforeRace.resultSummary);
  assert.deepEqual(await pairFactorCounts(pairId), countsAfterEnd);
  return String(pairId);
};

const exerciseActionNotificationVsEnd = async (
  memberObjectIds: [Types.ObjectId, Types.ObjectId],
  now: Date
): Promise<string> => {
  const pair = await createPair();
  const pairId = pair._id as Types.ObjectId;
  await weeklyCycleService.skipCurrent({
    pair,
    currentUserId: memberA,
    now,
  });
  await weeklyCycleService.skipCurrent({
    pair,
    currentUserId: memberB,
    now,
  });
  const context =
    await recommendationDecisionService.requireCurrentPublishableSummary({
      pairId: String(pairId),
      currentUserId: memberA,
    });
  const activityInput = makeActivity({
    pairId,
    memberObjectIds,
    status: 'offered',
    now,
  });
  const activity = await PairActivity.create({
    ...activityInput,
    recommendationProvenance: buildRecommendationProvenance({
      context,
      activity: activityInput,
    }),
  });
  const guardReached = deferred();
  const releaseGuard = deferred();
  const operation = recommendationDecisionService.openForActivity(
    {
      pairId: String(pairId),
      activityId: String(activity._id),
      currentUserId: memberA,
      recommendationContext: context,
    },
    {
      beforeActionNotificationPairGuard: async () => {
        guardReached.resolve();
        await releaseGuard.promise;
      },
    }
  );
  await waitForGuard(
    guardReached.promise,
    operation,
    'recommendation action notification'
  );
  try {
    await pairsService.endPair({
      pairId: String(pairId),
      currentUserId: memberB,
      auditRequest,
    });
  } finally {
    releaseGuard.resolve();
  }
  const decision = await operation;
  assert.equal(decision.activity.id, String(activity._id));
  assert.equal(
    await Notification.countDocuments({
      pairId,
      type: 'ACTION_AVAILABLE',
    }),
    0,
    'late recommendation notification survived Pair end'
  );
  assert.equal(
    await RecommendationDecision.countDocuments({
      pairId,
      status: { $in: ['OFFERED', 'ACCEPTED'] },
    }),
    0,
    'recommendation stayed actionable after Pair end'
  );
  return String(pairId);
};

const cleanup = async (): Promise<void> => {
  const pairs = await Pair.find({ members: { $in: memberIds } }).select({ _id: 1 });
  const pairIds = pairs.map((pair) => pair._id);
  const pairIdStrings = pairIds.map(String);
  await Promise.all([
    EventLog.deleteMany({
      $or: [
        { 'actor.userId': { $in: memberIds } },
        { 'context.pairId': { $in: pairIdStrings } },
      ],
    }),
    EvidenceEvent.deleteMany({ pairId: { $in: pairIdStrings } }),
    IndividualFactorSnapshot.deleteMany({ contextPairId: { $in: pairIdStrings } }),
    PairFactorSnapshot.deleteMany({ pairId: { $in: pairIdStrings } }),
    PairFactorEvaluationSnapshot.deleteMany({ pairId: { $in: pairIdStrings } }),
    Notification.deleteMany({ pairId: { $in: pairIds } }),
    RecommendationDecision.deleteMany({ pairId: { $in: pairIds } }),
    PairActivity.deleteMany({ pairId: { $in: pairIds } }),
    PairStateSnapshot.deleteMany({ pairId: { $in: pairIds } }),
    WeeklyCheckIn.deleteMany({
      $or: [
        { pairId: { $in: pairIds } },
        { pairId: { $in: pairIdStrings } },
        { userId: { $in: memberIds } },
      ],
    }),
    WeeklyCycle.deleteMany({ pairId: { $in: pairIds } }),
  ]);
  await Pair.deleteMany({ _id: { $in: pairIds } });
  await User.deleteMany({ id: { $in: memberIds } });
};

const main = async (): Promise<void> => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 12,
  });
  try {
    const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
    assert.equal(hello?.setName, replicaSet);
    await ensureIndexes();
    const users = await User.create([userFixture(memberA), userFixture(memberB)]);
    const memberObjectIds: [Types.ObjectId, Types.ObjectId] = [
      users[0]._id as Types.ObjectId,
      users[1]._id as Types.ObjectId,
    ];
    const now = new Date();
    const startPausePairId = await exerciseStartVsPause(memberObjectIds, now);
    const feedbackEndPairId = await exercisePartialFeedbackVsEnd(
      memberObjectIds,
      new Date(now.getTime() + 1_000)
    );
    const actionNotificationEndPairId = await exerciseActionNotificationVsEnd(
      memberObjectIds,
      new Date(now.getTime() + 2_000)
    );
    console.log(
      JSON.stringify({
        ok: true,
        replicaSet,
        startPausePairId,
        feedbackEndPairId,
        actionNotificationEndPairId,
        startVsPause: 'pause_wins',
        feedbackVsEnd: 'end_wins',
        actionNotificationVsEnd: 'end_wins',
      })
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'activity lifecycle race failed');
  process.exitCode = 1;
});
