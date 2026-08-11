import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { activityOfferService } from '@/domain/services/activityOffer.service';
import { notificationService } from '@/domain/services/notification.service';
import { pairActivityReadService } from '@/domain/services/pairActivityRead.service';
import { buildPairDashboardSummary } from '@/domain/services/pairDashboardSummary.service';
import { pairEventService } from '@/domain/services/pairEvent.service';
import { pairHistoryService } from '@/domain/services/pairHistory.service';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { buildRecommendationProvenance } from '@/domain/services/recommendationProvenance.service';
import { setOwnerSafetyGate } from '@/domain/services/safetyGate.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { toPairDTO } from '@/lib/dto';
import { EventLog } from '@/models/EventLog';
import { Notification } from '@/models/Notification';
import { Pair, type PairType } from '@/models/Pair';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { PairEvent } from '@/models/PairEvent';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { SafetyGate } from '@/models/SafetyGate';
import { User } from '@/models/User';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import { WeeklyCycle } from '@/models/WeeklyCycle';

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

const runId = randomUUID();
const memberA = `safety-nondisclosure-a-${runId}`;
const memberB = `safety-nondisclosure-b-${runId}`;
const memberIds = [memberA, memberB];
const now = new Date('2026-08-11T12:00:00.000Z');
const auditRequest = {
  route: '/integration/safety-gate-nondisclosure',
  method: 'TEST',
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

const templateById = (templateId: string) => {
  const found = SYSTEM_ACTIVITY_TEMPLATES.find(
    (template) => String(template._id) === templateId
  );
  assert.ok(found, `canonical activity template ${templateId} is missing`);
  return found;
};

const activityFixture = (input: {
  pairId: Types.ObjectId;
  memberObjectIds: [Types.ObjectId, Types.ObjectId];
  templateId: string;
  status: PairActivityType['status'];
  offeredAt: Date;
  legacySafetyMeta?: boolean;
}): PairActivityType => {
  const template = templateById(input.templateId);
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
    why: input.legacySafetyMeta
      ? {
          ru: 'SafetyGate включён: показан специальный безопасный формат.',
          en: 'SafetyGate enabled: special safety fallback selected.',
        }
      : { ru: template.why.ru, en: template.why.en },
    mode: template.mode,
    sync: template.sync,
    difficulty: template.difficulty,
    intensity: template.intensity,
    timeEstimateMin: template.timeEstimateMin,
    location: template.location,
    materials: [...(template.materials ?? [])],
    offeredAt: input.offeredAt,
    dueAt: new Date(input.offeredAt.getTime() + 3 * 24 * 60 * 60 * 1000),
    cooldownDays: template.cooldownDays,
    requiresConsent: template.requiresConsent,
    visibility: template.visibility,
    status: input.status,
    lifecycleVersion: 'activity-lifecycle-v3',
    feedbackSchemaVersion: 'activity-feedback-v2',
    stateMeta: input.legacySafetyMeta
      ? {
          templateId: input.templateId,
          source: 'safety_gate',
          primaryReason: 'safety_fallback',
          assignedMemberIds: input.memberObjectIds.map(String),
        }
      : {
          templateId: input.templateId,
          primaryReason:
            input.templateId === 'system-resource-relief'
              ? 'neutral_fallback'
              : 'factor_signal',
          decisionVersion: 'activity-decision-v2',
          assignedMemberIds: input.memberObjectIds.map(String),
        },
    checkIns: template.checkIns.map((checkIn) => ({
      ...checkIn,
      map: [...checkIn.map],
      text: { ...checkIn.text },
    })),
    createdBy: 'system',
  };
};

const ensureIndexes = async (): Promise<void> => {
  for (const model of [
    User,
    Pair,
    WeeklyCycle,
    PairStateSnapshot,
    PairActivity,
    RecommendationDecision,
    PairEvent,
    SafetyGate,
    Notification,
    EventLog,
  ]) {
    await model.createIndexes();
  }
};

const pairDocument = async (pairId: Types.ObjectId) => {
  const pair = await Pair.findById(pairId);
  assert.ok(pair, 'pair fixture disappeared');
  return pair;
};

const pairObservableDto = async (pairId: Types.ObjectId) =>
  toPairDTO((await pairDocument(pairId)).toObject() as PairType & {
    _id: Types.ObjectId;
  });

const dashboardForB = async (pairId: Types.ObjectId) =>
  buildPairDashboardSummary({
    pair: await pairDocument(pairId),
    currentUserId: memberB,
  });

const activityList = async (
  pairId: Types.ObjectId,
  currentUserId: string,
  role: 'A' | 'B',
  status?: 'suggested' | 'current' | 'history'
) =>
  pairActivityReadService.list({
    pairId,
    currentUserId,
    role,
    ...(status ? { status } : {}),
  });

const historyForB = async (pairId: Types.ObjectId) =>
  pairHistoryService.list({
    pair: await pairDocument(pairId),
    role: 'B',
    limit: 20,
    now,
  });

const assertNoLegacySafetyDisclosure = (value: unknown, label: string): void => {
  const projection = JSON.stringify(value);
  assert.doesNotMatch(
    projection,
    /safety[_ -]?gate|safety[_ -]?fallback|special safety fallback/i,
    `${label} disclosed legacy SafetyGate provenance or copy`
  );
};

const cleanupRunScope = async (): Promise<void> => {
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
    Notification.deleteMany({
      $or: [
        { userId: { $in: memberIds } },
        { pairId: { $in: pairIdStrings } },
      ],
    }),
    SafetyGate.deleteMany({ pairId: { $in: pairIds } }),
    PairEvent.deleteMany({ pairId: { $in: pairIds } }),
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
  await Promise.all([
    Pair.deleteMany({ _id: { $in: pairIds } }),
    User.deleteMany({ id: { $in: memberIds } }),
  ]);
};

const main = async (): Promise<void> => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 12,
  });
  try {
    const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
    assert.equal(hello?.setName, expectedReplicaSet);
    await ensureIndexes();

    const [userA, userB] = await User.create([
      userFixture(memberA, 'safety-nondisclosure-a'),
      userFixture(memberB, 'safety-nondisclosure-b'),
    ]);
    const pair = await Pair.create({
      members: [memberA, memberB],
      key: [memberA, memberB].sort().join('|'),
      status: 'active',
      contextVersion: 'pair-context-v1',
    });
    const pairId = pair._id as Types.ObjectId;
    const memberObjectIds: [Types.ObjectId, Types.ObjectId] = [
      userA._id as Types.ObjectId,
      userB._id as Types.ObjectId,
    ];

    assert.equal(
      await SafetyGate.countDocuments({ pairId }),
      0,
      'generic fallback fixture unexpectedly started with a SafetyGate row'
    );
    const genericFallback = await activityOfferService.createFromTemplate({
      pairId: String(pairId),
      templateId: 'system-resource-relief',
      currentUserId: memberB,
      recommendationContext: {
        cycleId: new Types.ObjectId(),
        cycleKey: '2026-W32',
        snapshotId: new Types.ObjectId(),
        snapshotRevision: 1,
        inputHash: 'a'.repeat(64),
        inputDefinitionVersion: 'weekly-checkin-v1',
        pairStateAlgorithmVersion: 'pair-state-v1',
      },
    });
    const genericFallbackRow = await PairActivity.findById(genericFallback.id)
      .select({ stateMeta: 1 })
      .lean<{ stateMeta?: Record<string, unknown> } | null>();
    assert.equal(genericFallbackRow?.stateMeta?.templateId, 'system-resource-relief');
    assert.equal(genericFallbackRow?.stateMeta?.primaryReason, 'neutral_fallback');
    assertNoLegacySafetyDisclosure(genericFallback, 'generic fallback DTO');
    await PairActivity.deleteOne({ _id: genericFallback.id });

    const weeklyPair = await pairDocument(pairId);
    await weeklyCycleService.skipCurrent({
      pair: weeklyPair,
      currentUserId: memberA,
      now,
    });
    await weeklyCycleService.skipCurrent({
      pair: weeklyPair,
      currentUserId: memberB,
      now,
    });
    const recommendationContext =
      await recommendationDecisionService.requireCurrentPublishableSummary({
        pairId: String(pairId),
        currentUserId: memberB,
      });
    const notificationOfferInput = activityFixture({
      pairId,
      memberObjectIds,
      templateId: 'system-communication-rules',
      status: 'offered',
      offeredAt: new Date(now.getTime() - 500),
    });
    notificationOfferInput.recommendationProvenance = buildRecommendationProvenance({
      context: recommendationContext,
      activity: notificationOfferInput,
    });
    const notificationOffer = await PairActivity.create(notificationOfferInput);
    await notificationService.create({
      userIds: [memberB],
      pairId: String(pairId),
      type: 'PAIR_JOINED',
      sourceKey: `safety-nondisclosure-baseline:${runId}`,
      now,
    });
    const bNotificationsBeforeGate = await notificationService.list({
      currentUserId: memberB,
      limit: 50,
    });
    await setOwnerSafetyGate({
      pairId: String(pairId),
      ownerUserId: memberA,
      enabled: true,
      auditRequest,
    });
    const bNotificationsAfterGate = await notificationService.list({
      currentUserId: memberB,
      limit: 50,
    });
    assert.deepEqual(
      bNotificationsAfterGate,
      bNotificationsBeforeGate,
      'A SafetyGate toggle changed B notification response or stored state'
    );
    await recommendationDecisionService.openForActivity({
      pairId: String(pairId),
      activityId: String(notificationOffer._id),
      currentUserId: memberB,
      recommendationContext,
    });
    assert.equal(
      await Notification.countDocuments({
        pairId,
        userId: memberA,
        type: 'ACTION_AVAILABLE',
      }),
      0,
      'notification reconciliation created an inaccessible normal-offer notification for A'
    );
    assert.equal(
      await Notification.countDocuments({
        pairId,
        userId: memberB,
        type: 'ACTION_AVAILABLE',
      }),
      1,
      'eligible partner B did not receive the normal-offer notification'
    );
    await Promise.all([
      RecommendationDecision.deleteMany({ pairId }),
      PairActivity.deleteOne({ _id: notificationOffer._id }),
      Notification.deleteMany({ pairId }),
    ]);
    await setOwnerSafetyGate({
      pairId: String(pairId),
      ownerUserId: memberA,
      enabled: false,
      auditRequest,
    });

    const [normalOffer, fallbackOffer, currentActivity, historyActivity, legacyHistory] =
      await PairActivity.create([
        activityFixture({
          pairId,
          memberObjectIds,
          templateId: 'system-communication-rules',
          status: 'offered',
          offeredAt: new Date(now.getTime() - 1_000),
        }),
        activityFixture({
          pairId,
          memberObjectIds,
          templateId: 'system-resource-relief',
          status: 'offered',
          offeredAt: new Date(now.getTime() - 2_000),
        }),
        activityFixture({
          pairId,
          memberObjectIds,
          templateId: 'system-maintenance-week',
          status: 'accepted',
          offeredAt: new Date(now.getTime() - 3_000),
        }),
        activityFixture({
          pairId,
          memberObjectIds,
          templateId: 'system-domestic-load-map',
          status: 'completed_success',
          offeredAt: new Date(now.getTime() - 4_000),
        }),
        activityFixture({
          pairId,
          memberObjectIds,
          templateId: 'system-resource-relief',
          status: 'completed_partial',
          offeredAt: new Date(now.getTime() - 5_000),
          legacySafetyMeta: true,
        }),
      ]);
    assert.ok(currentActivity && historyActivity && legacyHistory);

    await RecommendationDecision.create([
      {
        pairId,
        cycleKey: '2026-W31',
        activityId: normalOffer._id,
        templateId: 'system-communication-rules',
        status: 'OFFERED',
        reasonCode: 'CURRENT_CYCLE_SUPPORT',
        decisionVersion: 'recommendation-decision-v1',
        replacementDepth: 0,
      },
      {
        pairId,
        cycleKey: '2026-W32',
        activityId: fallbackOffer._id,
        templateId: 'system-resource-relief',
        status: 'OFFERED',
        reasonCode: 'CURRENT_CYCLE_SUPPORT',
        decisionVersion: 'recommendation-decision-v1',
        replacementDepth: 0,
      },
    ]);

    await PairEvent.create({
      pairId,
      key: `${pairId}:integration:event-shape`,
      category: 'calendar_event',
      type: 'new_year',
      title: { ru: 'Нейтральное событие', en: 'Neutral event' },
      description: { ru: 'Описание события', en: 'Event description' },
      why: { ru: 'Общий повод для пары', en: 'A shared occasion' },
      windowStart: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      windowEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      status: 'offered',
      priority: 2,
      factorRegistryVersion: normalOffer.actionDefinition.registryVersion,
      targetFactorKeys: ['communication.weekly.connection'],
      source: { kind: 'calendar_rule', date: now },
      actionPolicy: {
        canAccept: true,
        canDecline: true,
        canSnooze: true,
        maxGeneratedActivities: 1,
      },
      generatedActivityIds: [],
    });

    const eventsBefore = await pairEventService.refreshPairEvents({
      pairId: String(pairId),
      currentUserId: memberB,
      include: 'all',
      now,
    });
    assert.ok(eventsBefore.length > 0, 'event parity fixture produced no events');

    const [
      dashboardBefore,
      bActivitiesBefore,
      bCurrentBefore,
      bHistoryBefore,
      bHistoryPageBefore,
      aSuggestedBefore,
      bSuggestedBefore,
    ] = await Promise.all([
      dashboardForB(pairId),
      activityList(pairId, memberB, 'B'),
      activityList(pairId, memberB, 'B', 'current'),
      activityList(pairId, memberB, 'B', 'history'),
      historyForB(pairId),
      activityList(pairId, memberA, 'A', 'suggested'),
      activityList(pairId, memberB, 'B', 'suggested'),
    ]);
    assertNoLegacySafetyDisclosure(bHistoryBefore, 'partner activity history');
    assertNoLegacySafetyDisclosure(bHistoryPageBefore, 'partner canonical history');

    const pairDtoBefore = await pairObservableDto(pairId);
    await setOwnerSafetyGate({
      pairId: String(pairId),
      ownerUserId: memberA,
      enabled: true,
      auditRequest,
    });
    const pairDtoAfterGate = await pairObservableDto(pairId);
    assert.deepEqual(
      pairDtoAfterGate,
      pairDtoBefore,
      'owner SafetyGate mutation changed pair-visible state or timestamps'
    );

    const [
      dashboardAfter,
      bActivitiesAfter,
      bCurrentAfter,
      bHistoryAfter,
      bHistoryPageAfter,
      aSuggestedAfter,
      bSuggestedAfter,
    ] = await Promise.all([
      dashboardForB(pairId),
      activityList(pairId, memberB, 'B'),
      activityList(pairId, memberB, 'B', 'current'),
      activityList(pairId, memberB, 'B', 'history'),
      historyForB(pairId),
      activityList(pairId, memberA, 'A', 'suggested'),
      activityList(pairId, memberB, 'B', 'suggested'),
    ]);
    const eventsAfter = await pairEventService.refreshPairEvents({
      pairId: String(pairId),
      currentUserId: memberB,
      include: 'all',
      now,
    });

    assert.deepEqual(dashboardAfter, dashboardBefore);
    assert.deepEqual(bActivitiesAfter, bActivitiesBefore);
    assert.deepEqual(bCurrentAfter, bCurrentBefore);
    assert.deepEqual(bHistoryAfter, bHistoryBefore);
    assert.deepEqual(bHistoryPageAfter, bHistoryPageBefore);
    assert.deepEqual(bSuggestedAfter, bSuggestedBefore);
    assert.deepEqual(eventsAfter, eventsBefore);
    assertNoLegacySafetyDisclosure(bHistoryAfter, 'partner activity history after gate');
    assertNoLegacySafetyDisclosure(eventsAfter, 'partner event list');

    const normalOfferId = String(normalOffer._id);
    const fallbackOfferId = String(fallbackOffer._id);
    assert.deepEqual(
      new Set(aSuggestedBefore.map((activity) => activity.id)),
      new Set([normalOfferId, fallbackOfferId]),
      'owner should see both canonical offers before enabling SafetyGate'
    );
    assert.deepEqual(
      aSuggestedAfter.map((activity) => activity.id),
      [fallbackOfferId],
      'owner SafetyGate should remove only the non-fallback offered activity'
    );
    assert.ok(
      bSuggestedBefore.some((activity) => activity.id === fallbackOfferId),
      'neutral fallback must remain available without a SafetyGate'
    );

    await setOwnerSafetyGate({
      pairId: String(pairId),
      ownerUserId: memberA,
      enabled: false,
      auditRequest,
    });
    const aSuggestedRestored = await activityList(
      pairId,
      memberA,
      'A',
      'suggested'
    );
    assert.deepEqual(
      new Set(aSuggestedRestored.map((activity) => activity.id)),
      new Set([normalOfferId, fallbackOfferId]),
      'disabling the owner gate should restore normal offer eligibility'
    );

    console.log(
      JSON.stringify({
        ok: true,
        replicaSet: expectedReplicaSet,
        partnerDashboardParity: true,
        partnerActivityParity: true,
        partnerHistoryParity: true,
        partnerEventParity: true,
        pairDtoTimestampParity: true,
        partnerNotificationParity: true,
        recipientScopedActionNotification: true,
        ownerOfferEligibilityScoped: true,
        genericNeutralFallback: true,
        legacySafetyRowsSanitized: true,
      })
    );
  } finally {
    await cleanupRunScope();
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'SafetyGate nondisclosure integration failed'
  );
  process.exitCode = 1;
});
