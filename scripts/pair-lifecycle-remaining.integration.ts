import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { createEvidenceEvent, MVP_FACTOR_REGISTRY } from '@/domain/model';
import { DomainError } from '@/domain/errors';
import {
  ActivityFactorRuntimeError,
  readActivityRecommendationInputs,
} from '@/domain/services/activityFactorRuntime.service';
import {
  seedDefinitionRegistryRelease,
  upsertEvidenceEvent,
} from '@/domain/services/factorEnginePersistence.service';
import {
  pairEventService,
} from '@/domain/services/pairEvent.service';
import {
  generatePairInviteToken,
  hashPairInviteToken,
  pairInviteService,
} from '@/domain/services/pairInvite.service';
import { pairsService } from '@/domain/services/pairs.service';
import { ensurePublicPairingId } from '@/domain/services/userPublicIdentity.service';
import { setOwnerSafetyGate } from '@/domain/services/safetyGate.service';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import { buildRecommendationProvenance } from '@/domain/services/recommendationProvenance.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { EventLog } from '@/models/EventLog';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { Notification } from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
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
const inviteMemberA = `lifecycle-invite-a-${runId}`;
const inviteMemberB = `lifecycle-invite-b-${runId}`;
const raceMemberA = `lifecycle-race-a-${runId}`;
const raceMemberB = `lifecycle-race-b-${runId}`;
const memberIds = [inviteMemberA, inviteMemberB, raceMemberA, raceMemberB];
const auditRequest = {
  route: '/integration/pair-lifecycle-remaining',
  method: 'TEST',
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
  contentRevision: `lifecycle-${runId}`,
  policyVersion: 'lifecycle-integration-v1',
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

const waitForGuard = async (
  guard: Promise<void>,
  operation: Promise<unknown>,
  label: string
): Promise<void> => {
  await Promise.race([
    guard,
    operation.then(
      () => {
        throw new Error(`${label} settled before its lifecycle guard`);
      },
      (error: unknown) => {
        throw new Error(`${label} failed before its lifecycle guard`, {
          cause: error,
        });
      }
    ),
  ]);
};

const ensureIndexes = async (): Promise<void> => {
  for (const model of [
    User,
    MvpOnboardingSession,
    Pair,
    PairInvite,
    PairMembershipClaim,
    WeeklyCycle,
    PairStateSnapshot,
    PairActivity,
    RecommendationDecision,
    PairEvent,
    SafetyGate,
    Notification,
    EventLog,
    DefinitionRegistryRelease,
    EvidenceEvent,
    IndividualFactorSnapshot,
    PairFactorSnapshot,
    PairFactorEvaluationSnapshot,
  ]) {
    await model.createIndexes();
  }
};

const makeActivity = (input: {
  pairId: Types.ObjectId;
  memberObjectIds: [Types.ObjectId, Types.ObjectId];
  templateIndex: number;
  now: Date;
}): PairActivityType => {
  const template = SYSTEM_ACTIVITY_TEMPLATES[input.templateIndex];
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
    why: { ru: template.why.ru, en: template.why.en },
    mode: template.mode,
    sync: template.sync,
    difficulty: template.difficulty,
    intensity: template.intensity,
    timeEstimateMin: template.timeEstimateMin,
    location: template.location,
    materials: [...(template.materials ?? [])],
    offeredAt: input.now,
    dueAt: new Date(input.now.getTime() + 3 * 24 * 60 * 60 * 1000),
    cooldownDays: template.cooldownDays,
    requiresConsent: template.requiresConsent,
    visibility: template.visibility,
    status: 'offered',
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

const exerciseInviteCleanup = async (now: Date): Promise<string> => {
  const inviteFromA = await pairInviteService.create({
    currentUserId: inviteMemberA,
    now,
  });
  const inviteFromB = await pairInviteService.create({
    currentUserId: inviteMemberB,
    now: new Date(now.getTime() + 1),
  });

  const claimed = await pairInviteService.accept({
    currentUserId: inviteMemberB,
    token: inviteFromA.token,
    auditRequest,
    now: new Date(now.getTime() + 2),
  });
  assert.equal(claimed.status, 'AWAITING_PARTNER_CONFIRMATION');
  assert.equal(await Pair.countDocuments({ members: inviteMemberA, status: 'active' }), 0);
  const accepted = await pairInviteService.confirm({
    currentUserId: inviteMemberA,
    inviteId: inviteFromA.invite.id,
    partnerPublicId: await ensurePublicPairingId(inviteMemberB),
    auditRequest,
    now: new Date(now.getTime() + 2),
  });
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.alreadyAccepted, false);

  const [creatorInvite, acceptorInvite] = await Promise.all([
    PairInvite.findById(inviteFromA.invite.id).lean(),
    PairInvite.findById(inviteFromB.invite.id).lean(),
  ]);
  assert.equal(creatorInvite?.status, 'ACCEPTED');
  assert.equal(
    acceptorInvite?.status,
    'CANCELLED',
    'acceptor pre-existing invite remained ACTIVE after pair creation'
  );

  const defensiveInviteIds = [new Types.ObjectId(), new Types.ObjectId()];
  await PairInvite.create([
    {
      _id: defensiveInviteIds[0],
      creatorUserId: inviteMemberA,
      tokenHash: hashPairInviteToken(generatePairInviteToken()),
      status: 'ACTIVE',
      expiresAt: new Date(now.getTime() + 60_000),
    },
    {
      _id: defensiveInviteIds[1],
      creatorUserId: inviteMemberB,
      tokenHash: hashPairInviteToken(generatePairInviteToken()),
      status: 'ACTIVE',
      expiresAt: new Date(now.getTime() + 60_000),
    },
  ]);

  await pairsService.endPair({
    pairId: accepted.pairId,
    currentUserId: inviteMemberA,
    auditRequest,
  });
  assert.equal(
    await PairInvite.countDocuments({
      _id: { $in: defensiveInviteIds },
      status: 'ACTIVE',
    }),
    0,
    'pair end left a member-created invite ACTIVE'
  );
  assert.equal(
    await PairInvite.countDocuments({
      _id: { $in: defensiveInviteIds },
      status: 'CANCELLED',
    }),
    2
  );

  const reconnectInvite = await pairInviteService.create({
    currentUserId: inviteMemberA,
    now: new Date(now.getTime() + 3),
  });
  const createGuardReached = deferred();
  const releaseCreateGuard = deferred();
  const staleCreate = pairInviteService.create(
    {
      currentUserId: inviteMemberB,
      now: new Date(now.getTime() + 4),
    },
    {
      beforeCreateMembershipFence: async () => {
        createGuardReached.resolve();
        await releaseCreateGuard.promise;
      },
    }
  );
  await waitForGuard(
    createGuardReached.promise,
    staleCreate,
    'pair invite create'
  );
  let reconnected: Awaited<ReturnType<typeof pairInviteService.confirm>>;
  try {
    await pairInviteService.accept({
      currentUserId: inviteMemberB,
      token: reconnectInvite.token,
      auditRequest,
      now: new Date(now.getTime() + 5),
    });
    reconnected = await pairInviteService.confirm({
      currentUserId: inviteMemberA,
      inviteId: reconnectInvite.invite.id,
      partnerPublicId: await ensurePublicPairingId(inviteMemberB),
      auditRequest,
      now: new Date(now.getTime() + 5),
    });
  } finally {
    releaseCreateGuard.resolve();
  }
  await assert.rejects(
    staleCreate,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'PAIR_ALREADY_ACTIVE' &&
      error.status === 409
  );
  assert.equal(
    await PairInvite.countDocuments({
      creatorUserId: inviteMemberB,
      status: 'ACTIVE',
    }),
    0,
    'invite create/accept race left an ACTIVE invite for a paired user'
  );
  await pairsService.endPair({
    pairId: reconnected.pairId,
    currentUserId: inviteMemberA,
    auditRequest,
  });
  return reconnected.pairId;
};

const exerciseEndWinsRaces = async (now: Date): Promise<string> => {
  const users = await User.find({ id: { $in: [raceMemberA, raceMemberB] } })
    .sort({ id: 1 })
    .lean<Array<{ _id: Types.ObjectId; id: string }>>();
  assert.equal(users.length, 2);
  const userObjectIdById = new Map(users.map((user) => [user.id, user._id]));
  const memberObjectIds = [
    userObjectIdById.get(raceMemberA),
    userObjectIdById.get(raceMemberB),
  ];
  assert.ok(memberObjectIds[0]);
  assert.ok(memberObjectIds[1]);

  const pair = await Pair.create({
    members: [raceMemberA, raceMemberB],
    key: [raceMemberA, raceMemberB].sort().join('|'),
    status: 'active',
    contextVersion: 'pair-context-v1',
  });
  const pairId = pair._id as Types.ObjectId;
  await weeklyCycleService.skipCurrent({
    pair,
    currentUserId: raceMemberA,
    now,
  });
  await weeklyCycleService.skipCurrent({
    pair,
    currentUserId: raceMemberB,
    now,
  });
  const recommendationContext =
    await recommendationDecisionService.requireCurrentPublishableSummary({
      pairId: String(pairId),
      currentUserId: raceMemberA,
    });

  const firstActivityInput = makeActivity({
    pairId,
    memberObjectIds: [memberObjectIds[0], memberObjectIds[1]],
    templateIndex: 0,
    now,
  });
  const firstActivity = await PairActivity.create({
    ...firstActivityInput,
    recommendationProvenance: buildRecommendationProvenance({
      context: recommendationContext,
      activity: firstActivityInput,
    }),
  });
  const firstDecision = await recommendationDecisionService.openForActivity({
    pairId: String(pairId),
    activityId: String(firstActivity._id),
    currentUserId: raceMemberA,
    recommendationContext,
  });
  const prepared = await recommendationDecisionService.prepareReplacement({
    pairId: String(pairId),
    decisionId: firstDecision.id,
    currentUserId: raceMemberA,
  });
  assert.equal(prepared.kind, 'prepared');
  if (prepared.kind !== 'prepared') {
    throw new Error('Replacement fixture did not enter prepared state');
  }

  const replacementActivityInput = makeActivity({
    pairId,
    memberObjectIds: [memberObjectIds[0], memberObjectIds[1]],
    templateIndex: 1,
    now: new Date(now.getTime() + 10),
  });
  const replacementActivity = await PairActivity.create({
    ...replacementActivityInput,
    recommendationProvenance: buildRecommendationProvenance({
      context: recommendationContext,
      activity: replacementActivityInput,
    }),
  });

  const decisionGuardReached = deferred();
  const eventGuardReached = deferred();
  const releaseGuards = deferred();
  let eventCandidateCount = 0;
  const replacementAttempt = recommendationDecisionService.openForActivity(
    {
      pairId: String(pairId),
      activityId: String(replacementActivity._id),
      currentUserId: raceMemberA,
      previousDecisionId: prepared.decisionId,
      successorDecisionId: prepared.successorDecisionId,
      recommendationContext,
    },
    {
      beforeTransactionalPairGuard: async () => {
        decisionGuardReached.resolve();
        await releaseGuards.promise;
      },
    }
  );
  const refreshAttempt = pairEventService.refreshPairEvents(
    {
      pairId: String(pairId),
      currentUserId: raceMemberB,
      include: 'all',
      now,
    },
    {
      beforeTransactionalPairGuard: async (candidateCount) => {
        eventCandidateCount = candidateCount;
        eventGuardReached.resolve();
        await releaseGuards.promise;
      },
    }
  );

  await Promise.all([
    waitForGuard(decisionGuardReached.promise, replacementAttempt, 'replacement'),
    waitForGuard(eventGuardReached.promise, refreshAttempt, 'pair-event refresh'),
  ]);
  assert.ok(eventCandidateCount > 0, 'pair-event race fixture produced no candidates');

  try {
    await pairsService.endPair({
      pairId: String(pairId),
      currentUserId: raceMemberA,
      auditRequest,
    });
  } finally {
    releaseGuards.resolve();
  }

  await assert.rejects(
    replacementAttempt,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'RECOMMENDATION_UNAVAILABLE' &&
      error.status === 409
  );
  assert.deepEqual(await refreshAttempt, []);
  assert.equal(
    await RecommendationDecision.countDocuments({
      pairId,
      status: { $in: ['OFFERED', 'ACCEPTED'] },
    }),
    0,
    'replacement race left an active recommendation after pair end'
  );
  assert.equal(
    await PairEvent.countDocuments({
      pairId,
      status: { $nin: ['completed', 'declined', 'expired'] },
    }),
    0,
    'refresh race left a nonterminal pair event after pair end'
  );
  const endedPair = await Pair.findById(pairId)
    .select({ status: 1, lifecycleRevision: 1 })
    .lean<{ status: string; lifecycleRevision?: number } | null>();
  assert.equal(endedPair?.status, 'ended');
  assert.ok(
    (endedPair?.lifecycleRevision ?? 0) >= 2,
    'transactional lifecycle guards did not acquire a persisted write fence'
  );
  return String(pairId);
};

const createLifecycleRacePair = async (
  status: 'active' | 'paused'
): Promise<InstanceType<typeof Pair>> =>
  Pair.create({
    members: [raceMemberA, raceMemberB],
    key: [raceMemberA, raceMemberB].sort().join('|'),
    status,
    contextVersion: 'pair-context-v1',
  });

const exercisePairStateEndRaces = async (): Promise<{
  pausePairId: string;
  resumePairId: string;
}> => {
  const runRace = async (kind: 'pause' | 'resume'): Promise<string> => {
    const pair = await createLifecycleRacePair(
      kind === 'pause' ? 'active' : 'paused'
    );
    const guardReached = deferred();
    const releaseGuard = deferred();
    const operation =
      kind === 'pause'
        ? pairsService.pausePair(
            {
              pairId: String(pair._id),
              currentUserId: raceMemberA,
              auditRequest,
            },
            {
              beforeStateCas: async () => {
                guardReached.resolve();
                await releaseGuard.promise;
              },
            }
          )
        : pairsService.resumePair(
            {
              pairId: String(pair._id),
              currentUserId: raceMemberA,
              auditRequest,
            },
            {
              beforeStateCas: async () => {
                guardReached.resolve();
                await releaseGuard.promise;
              },
            }
          );

    await waitForGuard(guardReached.promise, operation, `${kind} pair`);
    try {
      await pairsService.endPair({
        pairId: String(pair._id),
        currentUserId: raceMemberB,
        auditRequest,
      });
    } finally {
      releaseGuard.resolve();
    }
    await assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'STATE_CONFLICT' &&
        error.status === 409
    );
    assert.equal((await Pair.findById(pair._id).lean())?.status, 'ended');
    return String(pair._id);
  };

  return {
    pausePairId: await runRace('pause'),
    resumePairId: await runRace('resume'),
  };
};

const exercisePairEventAcceptEndRace = async (now: Date): Promise<string> => {
  const pair = await createLifecycleRacePair('active');
  const events = await pairEventService.refreshPairEvents({
    pairId: String(pair._id),
    currentUserId: raceMemberA,
    now,
  });
  const event = events.find((candidate) => candidate.canAccept);
  assert.ok(event, 'pair-event accept race fixture produced no acceptable event');

  const guardReached = deferred();
  const releaseGuard = deferred();
  const operation = pairEventService.acceptEvent(
    {
      pairId: String(pair._id),
      eventId: event.id,
      currentUserId: raceMemberA,
      now,
    },
    {
      beforeMutationTransactionalPairGuard: async () => {
        guardReached.resolve();
        await releaseGuard.promise;
      },
    }
  );
  await waitForGuard(guardReached.promise, operation, 'pair-event accept');
  try {
    await pairsService.endPair({
      pairId: String(pair._id),
      currentUserId: raceMemberB,
      auditRequest,
    });
  } finally {
    releaseGuard.resolve();
  }
  await assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'STATE_CONFLICT' &&
      error.status === 409
  );
  assert.equal(
    await PairActivity.countDocuments({
      pairId: pair._id,
      'stateMeta.sourceMeta.eventId': event.id,
    }),
    0,
    'event accept race created an activity after pair end'
  );
  assert.equal(
    await PairEvent.countDocuments({
      pairId: pair._id,
      status: { $nin: ['completed', 'declined', 'expired'] },
    }),
    0,
    'event accept race left a nonterminal event after pair end'
  );
  return String(pair._id);
};

const exerciseSafetyGateEndRace = async (): Promise<string> => {
  const pair = await createLifecycleRacePair('active');
  const guardReached = deferred();
  const releaseGuard = deferred();
  const operation = setOwnerSafetyGate(
    {
      pairId: String(pair._id),
      ownerUserId: raceMemberA,
      enabled: true,
      auditRequest,
    },
    {
      beforeTransactionalPairGuard: async () => {
        guardReached.resolve();
        await releaseGuard.promise;
      },
    }
  );
  await waitForGuard(guardReached.promise, operation, 'safety gate');
  try {
    await pairsService.endPair({
      pairId: String(pair._id),
      currentUserId: raceMemberB,
      auditRequest,
      reason: 'MEMBER_REQUEST',
    });
  } finally {
    releaseGuard.resolve();
  }
  await assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'STATE_CONFLICT' &&
      error.status === 409
  );
  assert.equal(
    await SafetyGate.countDocuments({ pairId: pair._id, enabled: true }),
    0,
    'safety gate race re-enabled a gate after pair end'
  );
  return String(pair._id);
};

const exerciseActivityFactorReadEndRace = async (observedAt: Date): Promise<string> => {
  const pair = await createLifecycleRacePair('active');
  const pairId = String(pair._id);
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === 'communication.conflict.repairSkill'
  );
  const individualMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === 'activity.repairSkill.outcome'
  );
  const pairMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === 'pairActivity.repairSkill.outcome'
  );
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === 'activityReflection.mvp'
  );
  assert.ok(factor && individualMeasurement && pairMeasurement && instrument);
  await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, observedAt);

  const common = {
    pairId,
    factorKey: factor.key,
    instrumentKey: instrument.key,
    context: 'COMMITTED_RELATIONSHIP' as const,
    purpose: 'PAIR_MODEL' as const,
    privacyClass: factor.privacyClass,
    captureMode: 'PAIR_MODEL_ONLY' as const,
    policyVersion: 'activity-factor-lifecycle-test-v1',
    consentRevision: 'activity-factor-lifecycle-consent-v1',
    retentionClass: 'PAIR_CONTEXT' as const,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
  };
  const individualEvents = [raceMemberA, raceMemberB].flatMap((memberId) =>
    [0, 1].map((revision) =>
      createEvidenceEvent(
        {
          ...common,
          eventId: `activity-factor-lifecycle-${memberId}-${revision}-${runId}`,
          idempotencyKey: `activity-factor-lifecycle-${memberId}-${revision}-${runId}`,
          actorId: memberId,
          subjectKind: 'INDIVIDUAL',
          subjectId: memberId,
          observationScope: 'SELF',
          measurementKey: individualMeasurement.key,
          sourceType: individualMeasurement.sourceType,
          sourceRef: `activity-factor-lifecycle:${pairId}:${memberId}`,
          sourceRevision: `member-r${revision}`,
          submittedValue: {
            kind: 'MASTERY',
            score01: 0.6 + revision * 0.05,
            level: 'INTERMEDIATE',
          },
          reliabilityMultiplier: 1,
          observedAt: new Date(observedAt.getTime() + revision * 1_000),
          recordedAt: new Date(observedAt.getTime() + revision * 1_000),
        },
        factor,
        individualMeasurement,
        instrument
      )
    )
  );
  const pairEvents = [0, 1].map((revision) =>
    createEvidenceEvent(
      {
        ...common,
        eventId: `activity-factor-lifecycle-pair-${revision}-${runId}`,
        idempotencyKey: `activity-factor-lifecycle-pair-${revision}-${runId}`,
        actorId: raceMemberA,
        subjectKind: 'PAIR',
        subjectId: pairId,
        observationScope: 'PAIR_DYAD',
        measurementKey: pairMeasurement.key,
        sourceType: pairMeasurement.sourceType,
        sourceRef: `activity-factor-lifecycle:${pairId}:pair`,
        sourceRevision: `pair-r${revision}`,
        submittedValue: {
          kind: 'MASTERY',
          score01: 0.65 + revision * 0.05,
          level: 'INTERMEDIATE',
        },
        reliabilityMultiplier: 1,
        observedAt: new Date(observedAt.getTime() + revision * 1_000),
        recordedAt: new Date(observedAt.getTime() + revision * 1_000),
      },
      factor,
      pairMeasurement,
      instrument
    )
  );
  assert.deepEqual(
    [...individualEvents, ...pairEvents].flatMap((event) =>
      event.status === 'REJECTED' ? [event.rejectionCode] : []
    ),
    [],
    'activity Factor lifecycle evidence fixture must be canonical'
  );
  for (const event of [...individualEvents, ...pairEvents]) {
    await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY);
  }

  await readActivityRecommendationInputs({ pairId, effectiveAt: observedAt });
  const revisionCountsBeforeEnd = {
    individual: await IndividualFactorSnapshot.countDocuments({
      contextPairId: pairId,
      projectionPurpose: 'PAIR_MODEL',
    }),
    pair: await PairFactorSnapshot.countDocuments({ pairId }),
    evaluation: await PairFactorEvaluationSnapshot.countDocuments({ pairId }),
  };
  assert.ok(revisionCountsBeforeEnd.individual > 0);
  assert.ok(revisionCountsBeforeEnd.pair > 0);
  assert.ok(revisionCountsBeforeEnd.evaluation > 0);

  let lifecycleHookCount = 0;
  await assert.rejects(
    readActivityRecommendationInputs(
      {
        pairId,
        effectiveAt: new Date(observedAt.getTime() + 29 * 60 * 60 * 1_000),
      },
      {
        beforeTransactionalPairLifecycleFence: async () => {
          lifecycleHookCount += 1;
          await pairsService.endPair({
            pairId,
            currentUserId: raceMemberA,
            auditRequest,
          });
        },
      }
    ),
    (error: unknown) =>
      error instanceof ActivityFactorRuntimeError &&
      error.reasonCode === 'PAIR_NOT_AVAILABLE'
  );
  assert.equal(lifecycleHookCount, 1, 'lifecycle hook must be deterministic');
  assert.deepEqual(
    {
      individual: await IndividualFactorSnapshot.countDocuments({
        contextPairId: pairId,
        projectionPurpose: 'PAIR_MODEL',
      }),
      pair: await PairFactorSnapshot.countDocuments({ pairId }),
      evaluation: await PairFactorEvaluationSnapshot.countDocuments({ pairId }),
    },
    revisionCountsBeforeEnd,
    'ended Pair must not receive lazy Factor snapshot/evaluation revisions'
  );
  assert.equal((await Pair.findById(pair._id).lean())?.status, 'ended');
  return pairId;
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
    Notification.deleteMany({ userId: { $in: memberIds } }),
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
        { userId: { $in: memberIds } },
      ],
    }),
    WeeklyCycle.deleteMany({ pairId: { $in: pairIds } }),
    PairMembershipClaim.deleteMany({ userId: { $in: memberIds } }),
    PairInvite.deleteMany({
      $or: [
        { creatorUserId: { $in: memberIds } },
        { acceptedByUserId: { $in: memberIds } },
      ],
    }),
    MvpOnboardingSession.deleteMany({ userId: { $in: memberIds } }),
    EvidenceEvent.deleteMany({
      $or: [
        { pairId: { $in: pairIdStrings } },
        { actorId: { $in: memberIds } },
        { subjectId: { $in: memberIds } },
      ],
    }),
    IndividualFactorSnapshot.deleteMany({
      $or: [
        { contextPairId: { $in: pairIdStrings } },
        { subjectId: { $in: memberIds } },
      ],
    }),
    PairFactorSnapshot.deleteMany({ pairId: { $in: pairIdStrings } }),
    PairFactorEvaluationSnapshot.deleteMany({ pairId: { $in: pairIdStrings } }),
  ]);
  await Promise.all([
    Pair.deleteMany({ members: { $in: memberIds } }),
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
    const now = new Date();
    await User.create([
      userFixture(inviteMemberA, 'lifecycle-invite-a'),
      userFixture(inviteMemberB, 'lifecycle-invite-b'),
      userFixture(raceMemberA, 'lifecycle-race-a'),
      userFixture(raceMemberB, 'lifecycle-race-b'),
    ]);
    await MvpOnboardingSession.create([
      onboardingFixture(inviteMemberA, now),
      onboardingFixture(inviteMemberB, now),
    ]);

    const invitePairId = await exerciseInviteCleanup(now);
    const racePairId = await exerciseEndWinsRaces(new Date(now.getTime() + 100));
    const pairStateRaces = await exercisePairStateEndRaces();
    const eventAcceptRacePairId = await exercisePairEventAcceptEndRace(
      new Date(now.getTime() + 200)
    );
    const safetyGateRacePairId = await exerciseSafetyGateEndRace();
    const activityFactorRacePairId = await exerciseActivityFactorReadEndRace(
      new Date(now.getTime() + 300)
    );
    console.log(
      JSON.stringify({
        ok: true,
        replicaSet: expectedReplicaSet,
        invitePairId,
        racePairId,
        acceptorInviteCancelled: true,
        endInviteCleanup: true,
        recommendationEndRace: 'end_wins',
        pairEventEndRace: 'end_wins',
        pauseEndRace: 'end_wins',
        resumeEndRace: 'end_wins',
        pairEventAcceptEndRace: 'end_wins',
        safetyGateEndRace: 'end_wins',
        activityFactorReadEndRace: 'end_wins_without_new_revisions',
        pairStateRaces,
        eventAcceptRacePairId,
        safetyGateRacePairId,
        activityFactorRacePairId,
      })
    );
  } finally {
    await cleanupRunScope();
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'lifecycle integration failed');
  process.exitCode = 1;
});
