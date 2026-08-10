import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  acquireIdempotencyRecord,
  completeIdempotencyRecord,
  failIdempotencyRecord,
  findIdempotencyRecord,
} from '@/lib/idempotency/store';
import {
  persistClaimedIdempotencyOutcome,
  resolveDuplicateReplay,
} from '@/lib/idempotency/withIdempotency';
import { weeklyCheckInService } from '@/domain/services/weeklyCheckIn.service';
import { cycleEntitlementService } from '@/domain/services/cycleEntitlement.service';
import { pairHistoryService } from '@/domain/services/pairHistory.service';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import {
  PAIR_STATE_ALGORITHM_VERSION,
  WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT,
  WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
  WEEKLY_CYCLE_TIME_ZONE,
  weeklyCycleService,
  weeklyCycleWindow,
} from '@/domain/services/weeklyCycle.service';
import { DomainError } from '@/domain/errors';
import { IdempotencyRecord } from '@/models/IdempotencyRecord';
import { Insight } from '@/models/Insight';
import { Pair } from '@/models/Pair';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { User } from '@/models/User';
import { VectorSnapshot } from '@/models/VectorSnapshot';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import {
  WeeklyCycle,
  WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX,
} from '@/models/WeeklyCycle';
import { EventLog } from '@/models/EventLog';
import { Notification } from '@/models/Notification';
import { PairActivity } from '@/models/PairActivity';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { EntitlementQuotaUsage } from '@/models/EntitlementQuotaUsage';
import {
  assertRecommendationOfferAccess,
  buildRecommendationQuotaClaimKey,
} from '@/lib/entitlements';

type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string };
};

const mongodbUri = process.env.MONGODB_URI?.trim() ?? '';
assert.match(
  mongodbUri,
  /^mongodb:\/\/127\.0\.0\.1:27018\/foreverapp_rc\?/,
  'selfcheck is restricted to the local synthetic foreverapp_rc replica set'
);

mongoose.set('autoIndex', false);

const runId = `reliability-${randomUUID()}`;
const userIds = [`${runId}-a`, `${runId}-b`] as const;
const idemUserId = `${runId}-idempotency`;
let pairId: mongoose.Types.ObjectId | null = null;

const responseErrorCode = async (response: Response): Promise<string> => {
  const body = (await response.json()) as ErrorEnvelope;
  return body.error.code;
};

const cleanup = async (): Promise<void> => {
  await IdempotencyRecord.deleteMany({ userId: idemUserId });
  await EventLog.deleteMany({ 'actor.userId': { $in: [...userIds] } });
  await Insight.deleteMany({
    $or: [
      { userId: { $in: [...userIds] } },
      ...(pairId ? [{ pairId: { $in: [pairId, String(pairId)] } }] : []),
    ],
  });
  await VectorSnapshot.deleteMany({ userId: { $in: [...userIds] } });
  await WeeklyCheckIn.deleteMany({ userId: { $in: [...userIds] } });
  await EntitlementQuotaUsage.deleteMany({ subjectId: { $in: [...userIds] } });
  if (pairId) {
    await Notification.deleteMany({
      $or: [{ pairId }, { userId: { $in: [...userIds] } }],
    });
    await RecommendationDecision.deleteMany({ pairId });
    await PairActivity.deleteMany({ pairId });
    await PairStateSnapshot.deleteMany({ pairId });
    await WeeklyCycle.deleteMany({ pairId });
    await Pair.deleteOne({ _id: pairId });
  } else {
    await Notification.deleteMany({ userId: { $in: [...userIds] } });
  }
  await User.deleteMany({ id: { $in: [...userIds] } });
};

const testIdempotencyLeaseLifecycle = async (): Promise<void> => {
  const identity = {
    key: `${runId}-same-key`,
    route: `/selfcheck/${runId}/same-key`,
    userId: idemUserId,
    requestHash: 'hash-a',
  };
  const first = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'owner-a',
  });
  assert.equal(first.kind, 'acquired');
  if (first.kind !== 'acquired') return;
  assert.equal(first.takeover, false);
  assert.equal(first.record.attemptCount, 1);

  const concurrent = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'owner-b',
  });
  assert.equal(concurrent.kind, 'existing');
  if (concurrent.kind !== 'existing') return;
  const inProgress = resolveDuplicateReplay({
    requestHash: identity.requestHash,
    existing: concurrent.record,
  });
  assert.equal(inProgress.status, 409);
  assert.equal(await responseErrorCode(inProgress), 'IDEMPOTENCY_IN_PROGRESS');

  assert.equal(
    await failIdempotencyRecord({
      ...identity,
      leaseOwner: 'owner-a',
      failureCode: 'INJECTED_PRIMARY_FAILURE',
    }),
    true
  );
  const retry = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'owner-b',
  });
  assert.equal(retry.kind, 'acquired');
  if (retry.kind !== 'acquired') return;
  assert.equal(retry.takeover, true);
  assert.equal(retry.record.attemptCount, 2);

  await completeIdempotencyRecord({
    ...identity,
    leaseOwner: 'owner-b',
    status: 200,
    responseEnvelope: { ok: true, data: { repaired: true } },
  });
  const completed = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'owner-c',
  });
  assert.equal(completed.kind, 'existing');
  if (completed.kind !== 'existing') return;
  const replay = resolveDuplicateReplay({
    requestHash: identity.requestHash,
    existing: completed.record,
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, data: { repaired: true } });

  const hashConflict = await acquireIdempotencyRecord({
    ...identity,
    requestHash: 'hash-b',
    leaseOwner: 'owner-d',
  });
  assert.equal(hashConflict.kind, 'existing');
  if (hashConflict.kind !== 'existing') return;
  const conflict = resolveDuplicateReplay({
    requestHash: 'hash-b',
    existing: hashConflict.record,
  });
  assert.equal(conflict.status, 409);
  assert.equal(
    await responseErrorCode(conflict),
    'IDEMPOTENCY_KEY_REUSE_CONFLICT'
  );
};

const testExpiredLeaseTakeover = async (): Promise<void> => {
  const identity = {
    key: `${runId}-expired-lease`,
    route: `/selfcheck/${runId}/expired-lease`,
    userId: idemUserId,
    requestHash: 'lease-hash',
  };
  const stale = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'stale-owner',
    now: new Date('2020-01-01T00:00:00.000Z'),
    leaseMs: 1_000,
  });
  assert.equal(stale.kind, 'acquired');

  const takenOver = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'fresh-owner',
    now: new Date('2026-08-07T12:00:00.000Z'),
  });
  assert.equal(takenOver.kind, 'acquired');
  if (takenOver.kind !== 'acquired') return;
  assert.equal(takenOver.takeover, true);
  assert.equal(takenOver.record.leaseOwner, 'fresh-owner');
  assert.equal(takenOver.record.attemptCount, 2);
};

const testCompletionWriteFailure = async (): Promise<void> => {
  const identity = {
    key: `${runId}-completion-failure`,
    route: `/selfcheck/${runId}/completion-failure`,
    userId: idemUserId,
    requestHash: 'completion-hash',
  };
  const acquired = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'completion-owner-a',
  });
  assert.equal(acquired.kind, 'acquired');

  const persisted = await persistClaimedIdempotencyOutcome({
    persistence: {
      complete: async () => {
        throw new Error('injected completion write failure');
      },
      fail: (failureCode) =>
        failIdempotencyRecord({
          ...identity,
          leaseOwner: 'completion-owner-a',
          failureCode,
        }),
    },
    failureCode: 'INJECTED_COMPLETION_WRITE_FAILURE',
  });
  assert.equal(persisted, false);
  const failed = await findIdempotencyRecord(identity);
  assert.equal(failed?.state, 'failed');
  assert.equal(failed?.lastFailureCode, 'INJECTED_COMPLETION_WRITE_FAILURE');

  const retry = await acquireIdempotencyRecord({
    ...identity,
    leaseOwner: 'completion-owner-b',
  });
  assert.equal(retry.kind, 'acquired');
  await assert.rejects(
    completeIdempotencyRecord({
      ...identity,
      leaseOwner: 'wrong-owner',
      status: 201,
      responseEnvelope: { ok: true, data: { completed: true } },
    }),
    /lease was lost/
  );
  await completeIdempotencyRecord({
    ...identity,
    leaseOwner: 'completion-owner-b',
    status: 201,
    responseEnvelope: { ok: true, data: { completed: true } },
  });
  await completeIdempotencyRecord({
    ...identity,
    leaseOwner: 'ambiguous-ack-owner',
    status: 201,
    responseEnvelope: { ok: true, data: { completed: true } },
  });
  await assert.rejects(
    completeIdempotencyRecord({
      ...identity,
      leaseOwner: 'mismatched-owner',
      status: 201,
      responseEnvelope: { ok: true, data: { completed: false } },
    }),
    /lease was lost/
  );
};

const testWeeklyRepair = async (): Promise<void> => {
  await User.create(
    userIds.map((id, index) => ({
      id,
      username: `Reliability ${index}`,
      avatar: 'synthetic-avatar',
      personal: {
        gender: index === 0 ? 'female' : 'male',
        age: 30,
        city: 'Synthetic',
        relationshipStatus: 'in_relationship',
      },
      preferences: {
        desiredAgeRange: { min: 25, max: 40 },
        maxDistanceKm: 10,
      },
      profile: {
        onboarding: {
          seeking: { valuedQualities: ['kind', 'calm', 'honest'] },
        },
        matchCard: {
          requirements: ['kind', 'calm', 'honest'],
          give: ['care', 'time', 'support'],
          questions: ['What matters?', 'How to recover?'],
          isActive: false,
        },
      },
    }))
  );
  const pair = await Pair.create({
    members: [userIds[0], userIds[1]],
    key: `${userIds[0]}|${userIds[1]}`,
    status: 'active',
  });
  pairId = pair._id;

  const firstInput = {
    currentUserId: userIds[0],
    pairId: String(pair._id),
    answers: {
      closeness: 0.65,
      fatigue: 0.8,
      irritation: 0.7,
      readiness: 0.35,
      unresolvedTopic: true,
    },
  };
  const futureWeekKey = '2099-W01';
  await assert.rejects(
    weeklyCheckInService.submit({
      ...firstInput,
      weekKey: futureWeekKey,
    }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'WEEKLY_CYCLE_NOT_STARTED' &&
      /\S/.test(error.message)
  );
  assert.equal(
    await WeeklyCheckIn.countDocuments({
      pairId: String(pair._id),
      weekKey: futureWeekKey,
    }),
    0,
    'future weekly submission must not create a check-in'
  );
  assert.equal(
    await WeeklyCycle.countDocuments({ pairId: pair._id, cycleKey: futureWeekKey }),
    0,
    'future weekly submission must not materialize a cycle'
  );
  await assert.rejects(
    weeklyCheckInService.submit(firstInput, {
      afterPrimaryCommit: async () => {
        throw new Error('injected failure after primary commit');
      },
    }),
    /injected failure after primary commit/
  );

  const primaryOnly = await WeeklyCheckIn.findOne({
    userId: userIds[0],
    pairId: String(pair._id),
  }).lean();
  assert.equal(primaryOnly?.finalization?.state, 'pending');
  assert.equal(
    await VectorSnapshot.countDocuments({
      userId: userIds[0],
      'reason.source': 'weekly_checkin',
    }),
    0
  );

  const repaired = await weeklyCheckInService.submit(firstInput);
  assert.equal(repaired.userId, userIds[0]);
  const firstSnapshots = await VectorSnapshot.countDocuments({
    userId: userIds[0],
    'reason.source': 'weekly_checkin',
  });
  assert.equal(firstSnapshots, 2);
  const firstFinalized = await WeeklyCheckIn.findById(repaired.id).lean();
  assert.equal(firstFinalized?.finalization?.state, 'completed');
  assert.equal(firstFinalized?.finalization?.attemptCount, 1);
  const cycleAfterRepair = await WeeklyCycle.findOne({
    pairId: pair._id,
    cycleKey: repaired.weekKey,
  }).lean();
  assert.equal(cycleAfterRepair?.submissionCount, 1);
  assert.equal(
    cycleAfterRepair?.memberCompletion.find(
      (member) => member.userId === userIds[0]
    )?.status,
    'SUBMITTED'
  );
  const pairSnapshotsAfterRepair = await PairStateSnapshot.countDocuments({
    pairId: pair._id,
    cycleKey: repaired.weekKey,
  });
  const userAfterRepair = await User.findOne({ id: userIds[0] }).lean();
  const evidenceAfterRepair =
    userAfterRepair?.vectors?.psyche?.state?.evidenceCount;

  await weeklyCheckInService.submit(firstInput);
  assert.equal(
    await VectorSnapshot.countDocuments({
      userId: userIds[0],
      'reason.source': 'weekly_checkin',
    }),
    firstSnapshots
  );
  assert.equal(
    await PairStateSnapshot.countDocuments({
      pairId: pair._id,
      cycleKey: repaired.weekKey,
    }),
    pairSnapshotsAfterRepair
  );
  const userAfterReplay = await User.findOne({ id: userIds[0] }).lean();
  assert.equal(
    userAfterReplay?.vectors?.psyche?.state?.evidenceCount,
    evidenceAfterRepair
  );

  const legacyWeekKey = '2020-W01';
  const legacyCheckInId = new mongoose.Types.ObjectId();
  const legacyNow = new Date('2020-01-03T12:00:00.000Z');
  await WeeklyCheckIn.collection.insertOne({
    _id: legacyCheckInId,
    userId: userIds[0],
    weekKey: legacyWeekKey,
    answers: {
      closeness: 0.5,
      fatigue: 0.5,
      irritation: 0.2,
      readiness: 0.5,
      unresolvedTopic: false,
    },
    computed: { userStateDelta: {}, generatedInsightIds: [] },
    createdAt: legacyNow,
    updatedAt: legacyNow,
  });
  const snapshotsBeforeLegacyReplay = await VectorSnapshot.countDocuments({
    userId: userIds[0],
    'reason.source': 'weekly_checkin',
  });
  const legacyReplay = await weeklyCheckInService.submit({
    currentUserId: userIds[0],
    weekKey: legacyWeekKey,
    answers: {
      closeness: 0.9,
      fatigue: 0.9,
      irritation: 0.9,
      readiness: 0.1,
      unresolvedTopic: true,
    },
  });
  assert.equal(legacyReplay.id, String(legacyCheckInId));
  assert.equal(
    await VectorSnapshot.countDocuments({
      userId: userIds[0],
      'reason.source': 'weekly_checkin',
    }),
    snapshotsBeforeLegacyReplay,
    'legacy rows must not replay side effects without a durable marker'
  );

  const secondInput = {
    currentUserId: userIds[1],
    pairId: String(pair._id),
    weekKey: repaired.weekKey,
    answers: {
      closeness: 0.75,
      fatigue: 0.4,
      irritation: 0.2,
      readiness: 0.7,
      unresolvedTopic: false,
    },
  };
  await assert.rejects(
    weeklyCheckInService.submit(secondInput, {
      beforeFinalizationCompletion: async () => {
        throw new Error('injected finalization completion write failure');
      },
    }),
    /injected finalization completion write failure/
  );
  const effectsApplied = await WeeklyCheckIn.findOne({
    userId: userIds[1],
    pairId: String(pair._id),
    weekKey: repaired.weekKey,
  }).lean();
  assert.equal(effectsApplied?.finalization?.state, 'effects_applied');
  const secondSnapshotsBeforeRetry = await VectorSnapshot.countDocuments({
    userId: userIds[1],
    'reason.source': 'weekly_checkin',
  });
  const pairSnapshotsBeforeRetry = await PairStateSnapshot.countDocuments({
    pairId: pair._id,
    cycleKey: repaired.weekKey,
  });

  const secondRepaired = await weeklyCheckInService.submit(secondInput);
  assert.equal(secondRepaired.userId, userIds[1]);
  assert.equal(
    await VectorSnapshot.countDocuments({
      userId: userIds[1],
      'reason.source': 'weekly_checkin',
    }),
    secondSnapshotsBeforeRetry
  );
  assert.equal(
    await PairStateSnapshot.countDocuments({
      pairId: pair._id,
      cycleKey: repaired.weekKey,
    }),
    pairSnapshotsBeforeRetry
  );
  const secondFinalized = await WeeklyCheckIn.findById(secondRepaired.id).lean();
  assert.equal(secondFinalized?.finalization?.state, 'completed');
  assert.equal(secondFinalized?.finalization?.attemptCount, 2);
  const completedCycle = await WeeklyCycle.findOne({
    pairId: pair._id,
    cycleKey: repaired.weekKey,
  }).lean();
  assert.equal(completedCycle?.submissionCount, 2);
  assert.equal(completedCycle?.pairReadiness, 'ENOUGH');

  const priorValueCycleId = new mongoose.Types.ObjectId();
  await WeeklyCycle.collection.insertOne({
    _id: priorValueCycleId,
    pairId: pair._id,
    cycleKey: `${runId}-prior-value-cycle`,
    pairReadiness: 'ENOUGH',
    latestSnapshotId: new mongoose.Types.ObjectId(),
  });
  const previousBillingMode = process.env.BILLING_MODE;
  process.env.BILLING_MODE = 'sandbox';
  try {
    const entitlementIndependentReplay =
      await weeklyCheckInService.submit(secondInput);
    assert.equal(
      entitlementIndependentReplay.id,
      secondRepaired.id,
      'an existing immutable check-in must replay after entitlement expiry'
    );
  } finally {
    if (previousBillingMode === undefined) {
      delete process.env.BILLING_MODE;
    } else {
      process.env.BILLING_MODE = previousBillingMode;
    }
    await WeeklyCycle.deleteOne({ _id: priorValueCycleId });
  }

  await assert.rejects(
    cycleEntitlementService.assertCanOpen({
      pairId: String(pair._id),
      currentUserId: userIds[0],
      cycleKey: '2000-W01',
      billingMode: 'sandbox',
    }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'ENTITLEMENT_REQUIRED' &&
      error.status === 402
  );

  const quotaContext =
    await recommendationDecisionService.requireCurrentPublishableSummary({
      pairId: String(pair._id),
      currentUserId: userIds[0],
    });
  const primaryQuotaClaim = buildRecommendationQuotaClaimKey({
    pairId: String(pair._id),
    cycleKey: quotaContext.cycleKey,
    kind: 'primary',
  });
  const quotaRequest = new Request(
    `https://app.example/api/pairs/${String(pair._id)}/recommendations`,
    { method: 'POST' }
  );
  await Promise.all(
    Array.from({ length: 12 }, () =>
      assertRecommendationOfferAccess({
        req: quotaRequest,
        route: `/api/pairs/${String(pair._id)}/recommendations`,
        pairId: String(pair._id),
        currentUserId: userIds[0],
        quotaClaimKey: primaryQuotaClaim,
      })
    )
  );
  const primaryQuotaUsage = await EntitlementQuotaUsage.findOne({
    subjectId: userIds[0],
    quotaKey: 'activities.suggestions.per_day',
  }).lean();
  assert.equal(primaryQuotaUsage?.count, 1);
  assert.deepEqual(primaryQuotaUsage?.claimKeys, [primaryQuotaClaim]);

  for (let index = 0; index < 5; index += 1) {
    await assertRecommendationOfferAccess({
      req: quotaRequest,
      route: `/api/pairs/${String(pair._id)}/recommendations`,
      pairId: String(pair._id),
      currentUserId: userIds[0],
      quotaClaimKey: buildRecommendationQuotaClaimKey({
        pairId: String(pair._id),
        cycleKey: quotaContext.cycleKey,
        kind: 'replacement',
        decisionId: `quota-fixture-${index}`,
      }),
    });
  }
  await assert.rejects(
    assertRecommendationOfferAccess({
      req: quotaRequest,
      route: `/api/pairs/${String(pair._id)}/recommendations`,
      pairId: String(pair._id),
      currentUserId: userIds[0],
      quotaClaimKey: buildRecommendationQuotaClaimKey({
        pairId: String(pair._id),
        cycleKey: quotaContext.cycleKey,
        kind: 'replacement',
        decisionId: 'quota-fixture-denied',
      }),
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'QUOTA_EXCEEDED'
  );
  await assertRecommendationOfferAccess({
    req: quotaRequest,
    route: `/api/pairs/${String(pair._id)}/recommendations`,
    pairId: String(pair._id),
    currentUserId: userIds[0],
    quotaClaimKey: primaryQuotaClaim,
  });
  assert.equal(
    (
      await EntitlementQuotaUsage.findOne({
        subjectId: userIds[0],
        quotaKey: 'activities.suggestions.per_day',
      }).lean()
    )?.count,
    6,
    'an accepted claim must remain replayable after the quota becomes full'
  );

  const templateRecoveryInput = {
    pairId: String(pair._id),
    currentUserId: userIds[0],
    templateId: 'system-resource-relief',
  };
  await assert.rejects(
    recommendationWorkflowService.fromTemplateCompatibility(
      templateRecoveryInput,
      {
        afterActivityPrepared: async () => {
          throw new Error('injected crash after direct-template activity preparation');
        },
      }
    ),
    /injected crash after direct-template activity preparation/
  );
  const preparedTemplateActivity = await PairActivity.findOne({
    pairId: pair._id,
    status: 'offered',
    'stateMeta.templateId': templateRecoveryInput.templateId,
  }).lean();
  assert.ok(preparedTemplateActivity);
  assert.equal(
    await RecommendationDecision.countDocuments({
      activityId: preparedTemplateActivity._id,
    }),
    0,
    'failure injection must leave only the recoverable prepared activity'
  );
  const recoveredTemplateOffer =
    await recommendationWorkflowService.fromTemplateCompatibility(
      templateRecoveryInput
    );
  assert.equal(recoveredTemplateOffer.id, String(preparedTemplateActivity._id));
  assert.equal(
    await PairActivity.countDocuments({
      pairId: pair._id,
      status: 'offered',
      'stateMeta.templateId': templateRecoveryInput.templateId,
    }),
    1,
    'direct-template retry must reuse the prepared offer'
  );
  assert.equal(
    await RecommendationDecision.countDocuments({
      activityId: preparedTemplateActivity._id,
      status: 'OFFERED',
    }),
    1,
    'direct-template retry must attach exactly one canonical decision'
  );

  const originalRecommendation = await recommendationWorkflowService.offer({
    pairId: String(pair._id),
    currentUserId: userIds[0],
  });
  assert.equal(originalRecommendation.canReplace, true);
  const originalNotificationKeys = userIds.map((userId) =>
    createHash('sha256')
      .update(
        userId +
          '|' +
          String(pair._id) +
          '|ACTION_AVAILABLE|decision:' +
          originalRecommendation.id
      )
      .digest('hex')
  );
  await Notification.deleteMany({
    userId: { $in: [...userIds] },
    dedupeKey: { $in: originalNotificationKeys },
  });
  await recommendationWorkflowService.offer({
    pairId: String(pair._id),
    currentUserId: userIds[1],
  });
  assert.equal(
    await Notification.countDocuments({
      userId: { $in: [...userIds] },
      dedupeKey: { $in: originalNotificationKeys },
    }),
    2,
    'reading an existing current decision must recover both action notifications'
  );
  const replacementInput = {
    pairId: String(pair._id),
    decisionId: originalRecommendation.id,
    currentUserId: userIds[0],
  };
  await assert.rejects(
    recommendationWorkflowService.replace(replacementInput, {
      afterReplacementPrepared: async () => {
        throw new Error('injected crash after replacement preparation');
      },
    }),
    /injected crash after replacement preparation/
  );
  const interruptedDecision = await RecommendationDecision.findById(
    originalRecommendation.id
  ).lean();
  assert.equal(interruptedDecision?.status, 'REPLACED');
  assert.ok(interruptedDecision?.successorDecisionId);
  assert.equal(
    await RecommendationDecision.countDocuments({
      previousDecisionId: originalRecommendation.id,
    }),
    0,
    'failure injection must stop before successor persistence'
  );
  assert.equal(
    (await PairActivity.findById(originalRecommendation.activity.id).lean())?.status,
    'cancelled'
  );

  const [replacementA, replacementB] = await Promise.all([
    recommendationWorkflowService.replace(replacementInput),
    recommendationWorkflowService.replace({
      ...replacementInput,
      currentUserId: userIds[1],
    }),
  ]);
  assert.equal(replacementA.id, replacementB.id);
  assert.equal(replacementA.previousDecisionId, originalRecommendation.id);
  assert.equal(replacementA.canReplace, false);
  assert.equal(
    await RecommendationDecision.countDocuments({
      previousDecisionId: originalRecommendation.id,
    }),
    1,
    'concurrent recovery must persist exactly one successor'
  );
  const linkedOriginal = await RecommendationDecision.findById(
    originalRecommendation.id
  ).lean();
  assert.equal(String(linkedOriginal?.successorDecisionId), replacementA.id);

  const replacementNotificationKeys = userIds.map((userId) =>
    createHash('sha256')
      .update(
        userId +
          '|' +
          String(pair._id) +
          '|ACTION_AVAILABLE|decision:' +
          replacementA.id
      )
      .digest('hex')
  );
  await Notification.deleteMany({
    userId: { $in: [...userIds] },
    dedupeKey: { $in: replacementNotificationKeys },
  });
  assert.equal(
    await Notification.countDocuments({
      userId: { $in: [...userIds] },
      dedupeKey: { $in: replacementNotificationKeys },
    }),
    0
  );
  const recoveredExistingReplacement =
    await recommendationWorkflowService.replace(replacementInput);
  assert.equal(recoveredExistingReplacement.id, replacementA.id);
  assert.equal(
    await Notification.countDocuments({
      userId: { $in: [...userIds] },
      dedupeKey: { $in: replacementNotificationKeys },
    }),
    2,
    'existing successor recovery must reconcile the deduped action notification'
  );

  await assert.rejects(
    recommendationWorkflowService.replace({
      pairId: String(pair._id),
      decisionId: replacementA.id,
      currentUserId: userIds[0],
    }),
    (error: Error) =>
      error instanceof DomainError &&
      error.code === 'RECOMMENDATION_REPLACEMENT_UNAVAILABLE' &&
      error.status === 409
  );

  await RecommendationDecision.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(replacementA.id) },
    { $set: { 'provenance.inputHash': runId + '-stale-successor' } }
  );
  await assert.rejects(
    recommendationWorkflowService.replace(replacementInput),
    (error: Error) =>
      error instanceof DomainError &&
      error.code === 'RECOMMENDATION_UNAVAILABLE'
  );
  assert.equal(
    (
      await RecommendationDecision.findById(replacementA.id)
        .select({ status: 1 })
        .lean()
    )?.status,
    'EXPIRED',
    'existing successor recovery must expire a non-canonical offer'
  );

  const reconciliationNow = new Date();
  const poisonCycleKey = 'invalid-expired-reconciliation-cycle';
  const alreadyFinalizedKeys = ['2023-W01', '2023-W02', '2023-W03'];
  const reconciliationKeys = Array.from(
    { length: WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT + 3 },
    (_, index) => `2024-W${String(index + 1).padStart(2, '0')}`
  );
  const crashLikeCycleKey = reconciliationKeys[0];
  const allReconciliationKeys = [
    ...alreadyFinalizedKeys,
    ...reconciliationKeys,
  ];
  await WeeklyCycle.create({
    pairId: pair._id,
    cycleKey: poisonCycleKey,
    startsAt: new Date('2022-01-03T00:00:00.000Z'),
    endsAt: new Date('2022-01-10T00:00:00.000Z'),
    expiresAt: new Date('2022-01-10T00:00:00.000Z'),
    timeZone: WEEKLY_CYCLE_TIME_ZONE,
    status: 'OPEN',
    memberIds: [...userIds],
    memberCompletion: userIds.map((userId) => ({
      userId,
      status: 'PENDING' as const,
    })),
    pairReadiness: 'NOT_READY',
    submissionCount: 0,
    submissionClaims: [],
    inputDefinitionVersion: WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
    algorithmVersion: PAIR_STATE_ALGORITHM_VERSION,
  });
  await WeeklyCycle.insertMany(
    allReconciliationKeys.map((cycleKey) => ({
      pairId: pair._id,
      cycleKey,
      ...weeklyCycleWindow(cycleKey),
      timeZone: WEEKLY_CYCLE_TIME_ZONE,
      status: cycleKey === crashLikeCycleKey ? 'EXPIRED' : 'OPEN',
      memberIds: [...userIds],
      memberCompletion: userIds.map((userId) => ({
        userId,
        status: 'PENDING' as const,
      })),
      pairReadiness:
        cycleKey === crashLikeCycleKey ? 'EXPIRED' : 'NOT_READY',
      submissionCount: 0,
      submissionClaims: [],
      inputDefinitionVersion: WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
      algorithmVersion: PAIR_STATE_ALGORITHM_VERSION,
    }))
  );
  for (const cycleKey of alreadyFinalizedKeys) {
    await weeklyCycleService.syncAfterCheckIn({
      pair,
      cycleKey,
      now: reconciliationNow,
    });
  }
  assert.equal(
    await PairStateSnapshot.countDocuments({
      pairId: pair._id,
      cycleKey: { $in: alreadyFinalizedKeys },
      'input.cycleStatus': 'EXPIRED',
    }),
    alreadyFinalizedKeys.length,
    'legacy canonical cycles must start without the additive reconciliation marker'
  );
  assert.equal(
    await WeeklyCycle.countDocuments({
      pairId: pair._id,
      cycleKey: { $in: allReconciliationKeys },
      expiredReconciliationCompletedAt: { $type: 'date' },
    }),
    0
  );

  const pendingExplain = await WeeklyCycle.collection
    .find(
      {
        pairId: pair._id,
        endsAt: { $lte: reconciliationNow },
        expiredReconciliationCompletedAt: null,
      },
      { projection: { _id: 1, cycleKey: 1 } }
    )
    .sort({ endsAt: 1, cycleKey: 1 })
    .limit(WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT)
    .hint(WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX)
    .explain('executionStats');
  const pendingExecutionStats = pendingExplain.executionStats as
    | {
        nReturned: number;
        totalDocsExamined: number;
        totalKeysExamined: number;
      }
    | undefined;
  assert.ok(pendingExecutionStats);
  assert.equal(
    pendingExecutionStats.nReturned,
    WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT
  );
  assert.ok(
    pendingExecutionStats.totalDocsExamined <=
      WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT
  );
  assert.ok(
    pendingExecutionStats.totalKeysExamined <=
      WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT
  );
  assert.match(
    JSON.stringify(pendingExplain.queryPlanner),
    new RegExp(WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX)
  );

  const finalizedReconciliationCount = (): Promise<number> =>
    PairStateSnapshot.countDocuments({
      pairId: pair._id,
      cycleKey: { $in: reconciliationKeys },
      'input.cycleStatus': 'EXPIRED',
    });
  const completedReconciliationCount = (): Promise<number> =>
    WeeklyCycle.countDocuments({
      pairId: pair._id,
      cycleKey: { $in: allReconciliationKeys },
      expiredReconciliationCompletedAt: { $type: 'date' },
    });
  await pairHistoryService.list({
    pair,
    role: 'A',
    now: reconciliationNow,
    limit: 1,
  });
  assert.equal(
    await completedReconciliationCount(),
    WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT - 1,
    'a failed candidate must stay pending while the rest of the fixed batch progresses'
  );
  assert.equal(
    await finalizedReconciliationCount(),
    WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT -
      alreadyFinalizedKeys.length -
      1,
    'a poison row and already-finalized rows must not block later repairs'
  );
  assert.equal(
    (
      await PairStateSnapshot.findOne({
        pairId: pair._id,
        cycleKey: crashLikeCycleKey,
        'input.cycleStatus': 'EXPIRED',
      }).lean()
    )?.input.cycleStatus,
    'EXPIRED',
    'an EXPIRED cycle with no canonical snapshot must remain repairable'
  );
  await pairHistoryService.list({
    pair,
    role: 'A',
    now: reconciliationNow,
    limit: 1,
  });
  assert.equal(
    await finalizedReconciliationCount(),
    reconciliationKeys.length,
    'later history reads must progressively finish the backlog'
  );
  assert.equal(
    await completedReconciliationCount(),
    allReconciliationKeys.length,
    'later history reads must rotate past every already-finalized row'
  );
  const poisonCycle = await WeeklyCycle.findOne({
    pairId: pair._id,
    cycleKey: poisonCycleKey,
  }).lean();
  assert.equal(
    poisonCycle?.expiredReconciliationCompletedAt,
    undefined,
    'failed reconciliation candidates must remain pending for a later retry'
  );
  assert.equal(
    await PairStateSnapshot.countDocuments({
      pairId: pair._id,
      cycleKey: poisonCycleKey,
    }),
    0
  );
};

const main = async (): Promise<void> => {
  await connectToDatabase();
  await IdempotencyRecord.collection.createIndex(
    { userId: 1, route: 1, key: 1 },
    { unique: true }
  );
  await WeeklyCycle.createIndexes();
  assert.equal(
    await WeeklyCycle.collection.indexExists(
      WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX
    ),
    true
  );

  try {
    await cleanup();
    await testIdempotencyLeaseLifecycle();
    await testExpiredLeaseTakeover();
    await testCompletionWriteFailure();
    await testWeeklyRepair();
    console.log('reliability reconciliation selfcheck passed');
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
};

void main();
