import { randomUUID } from 'crypto';
import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import { DomainError } from '@/domain/errors';
import type { PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import {
  WeeklyCheckIn,
  WEEKLY_CHECK_IN_FINALIZATION_VERSION,
  type WeeklyCheckInAnswers,
  type WeeklyCheckInType,
} from '@/models/WeeklyCheckIn';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { processWeeklyFactorCheckIn } from '@/domain/services/factorEngineRuntime.service';
import {
  weeklyCycleKeyForDate,
  weeklyCycleService,
} from '@/domain/services/weeklyCycle.service';
import {
  runWeeklyCheckInFinalization,
  type WeeklyCheckInFinalizationPhase,
} from '@/domain/services/weeklyCheckInFinalization.service';

export type WeeklyCheckInSubmitInput = {
  currentUserId: string;
  pairId?: string;
  weekKey?: string;
  answers: WeeklyCheckInAnswers;
  auditRequest?: AuditRequestContext;
};

export type WeeklyCheckInDTO = {
  id: string;
  userId: string;
  pairId: string;
  weekKey: string;
  answers: WeeklyCheckInAnswers;
  createdAt: Date;
  updatedAt: Date;
};

export type WeeklyCheckInReliabilityTestHooks = {
  beforePrimaryCommitLifecycleGuard?: () => Promise<void>;
  afterPrimaryCommit?: () => Promise<void>;
  beforeFinalizationCompletion?: () => Promise<void>;
};

export type PairWeeklyCheckInDataStatus =
  | 'NOT_READY'
  | 'PARTIAL'
  | 'ENOUGH'
  | 'INSUFFICIENT';

export type PairWeeklyCheckInSignalKey =
  | 'connection'
  | 'tension'
  | 'recovery'
  | 'resource';

export type PairWeeklyCheckInSignalStatus =
  | 'LOW'
  | 'STEADY'
  | 'HIGH'
  | 'MIXED';

export type PairWeeklyCheckInPairDTO = {
  pairId: string;
  weekKey: string;
  currentUser: { submitted: boolean };
  peer: {
    submitted: boolean;
    username?: string;
    avatar?: string;
    avatarUrl?: string | null;
  };
  pair: {
    bothSubmitted: boolean;
    dataStatus: PairWeeklyCheckInDataStatus;
    reasonCodes: Array<
      | 'WAITING_FOR_RESPONSES'
      | 'WAITING_FOR_PEER'
      | 'PAIR_SIGNALS_READY'
      | 'PAIR_DATA_INSUFFICIENT'
    >;
    signals: Array<{
      key: PairWeeklyCheckInSignalKey;
      status: PairWeeklyCheckInSignalStatus;
      dataStatus: 'ENOUGH';
      reasonCode:
        | 'PAIR_LEVEL_LOW'
        | 'PAIR_LEVEL_STEADY'
        | 'PAIR_LEVEL_HIGH'
        | 'DIFFERENT_EXPERIENCE';
      nextStepHint:
        | 'CHECK_IN_TOGETHER'
        | 'CHOOSE_LOW_EFFORT'
        | 'MAKE_ROOM_FOR_RECOVERY'
        | 'KEEP_CURRENT_RHYTHM';
    }>;
  };
};

type PairGuardData = {
  pair: HydratedDocument<PairType>;
  by: 'A' | 'B';
};

type StoredWeeklyCheckIn = WeeklyCheckInType & { _id: Types.ObjectId };

type PairWeeklyMember = Pick<UserType, 'id' | 'username' | 'avatar'>;

type DuplicateKeyError = { code: number };

const isDuplicateKeyError = (error: object): error is DuplicateKeyError => {
  if (!('code' in error)) return false;
  return (error as { code: number }).code === 11000;
};

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const assertRange = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `${field} must be between 0 and 1`,
    });
  }
};

export const currentWeekKey = weeklyCycleKeyForDate;

export const validateWeeklyAnswers = (answers: WeeklyCheckInAnswers): WeeklyCheckInAnswers => {
  assertRange(answers.closeness, 'closeness');
  assertRange(answers.fatigue, 'fatigue');
  assertRange(answers.irritation, 'irritation');
  assertRange(answers.readiness, 'readiness');
  if (typeof answers.unresolvedTopic !== 'boolean') {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'unresolvedTopic must be boolean',
    });
  }
  const note = answers.note?.trim();
  if (note && note.length > 500) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'note must be 500 characters or less',
    });
  }
  return {
    closeness: clamp01(answers.closeness),
    fatigue: clamp01(answers.fatigue),
    irritation: clamp01(answers.irritation),
    readiness: clamp01(answers.readiness),
    unresolvedTopic: answers.unresolvedTopic,
    ...(note ? { note } : {}),
  };
};

const resolvePair = async (
  pairId: string | undefined,
  currentUserId: string
): Promise<PairGuardData | null> => {
  if (!pairId) return null;
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) {
    throw new DomainError({
      code: guard.response.status === 403 ? 'ACCESS_DENIED' : 'NOT_FOUND',
      status: guard.response.status,
      message: guard.response.status === 403 ? 'forbidden' : 'pair not found',
    });
  }
  return guard.data;
};

const assertPairAcceptsCheckIn = (pair: PairType): void => {
  if (pair.status !== 'active') {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Weekly check-in is unavailable unless the pair is active',
    });
  }
};

const pairIdVariants = (pairId: string): Array<string | Types.ObjectId> =>
  Types.ObjectId.isValid(pairId) ? [pairId, new Types.ObjectId(pairId)] : [pairId];

const pairIdentityFilter = (input: {
  userId: string;
  pairId: string;
  weekKey: string;
}) => ({
  userId: input.userId,
  pairId: { $in: pairIdVariants(input.pairId) },
  weekKey: input.weekKey,
});

const toDTO = (input: {
  checkIn: StoredWeeklyCheckIn;
}): WeeklyCheckInDTO => ({
  id: String(input.checkIn._id),
  userId: input.checkIn.userId,
  pairId: String(input.checkIn.pairId),
  weekKey: input.checkIn.weekKey,
  answers: input.checkIn.answers,
  createdAt: input.checkIn.createdAt,
  updatedAt: input.checkIn.updatedAt,
});

const toStoredWeeklyCheckInDTO = async (
  checkIn: StoredWeeklyCheckIn
): Promise<WeeklyCheckInDTO> => toDTO({ checkIn });

const WEEKLY_CHECK_IN_FINALIZATION_LEASE_MS = 120_000;

type WeeklyCheckInFinalizationClaim =
  | { kind: 'legacy'; checkIn: StoredWeeklyCheckIn }
  | { kind: 'completed'; checkIn: StoredWeeklyCheckIn }
  | {
      kind: 'acquired';
      checkIn: StoredWeeklyCheckIn;
      leaseOwner: string;
      phase: Exclude<WeeklyCheckInFinalizationPhase, 'completed'>;
    };

const claimWeeklyCheckInFinalization = async (
  checkInId: Types.ObjectId
): Promise<WeeklyCheckInFinalizationClaim> => {
  const now = new Date();
  const leaseOwner = randomUUID();
  const leaseExpiresAt = new Date(
    now.getTime() + WEEKLY_CHECK_IN_FINALIZATION_LEASE_MS
  );
  const availableLease = [
    { 'finalization.leaseOwner': { $exists: false } },
    { 'finalization.leaseExpiresAt': { $lte: now } },
  ];

  const effectsApplied = await WeeklyCheckIn.findOneAndUpdate(
    {
      _id: checkInId,
      'finalization.version': WEEKLY_CHECK_IN_FINALIZATION_VERSION,
      'finalization.state': 'effects_applied',
      $or: availableLease,
    },
    {
      $set: {
        'finalization.leaseOwner': leaseOwner,
        'finalization.leaseExpiresAt': leaseExpiresAt,
      },
      $unset: { 'finalization.lastFailureCode': 1 },
      $inc: { 'finalization.attemptCount': 1 },
    },
    { new: true }
  ).lean<StoredWeeklyCheckIn | null>();
  if (effectsApplied) {
    return {
      kind: 'acquired',
      checkIn: effectsApplied,
      leaseOwner,
      phase: 'effects_applied',
    };
  }

  const processing = await WeeklyCheckIn.findOneAndUpdate(
    {
      _id: checkInId,
      'finalization.version': WEEKLY_CHECK_IN_FINALIZATION_VERSION,
      'finalization.state': { $in: ['pending', 'processing', 'failed'] },
      $or: [
        { 'finalization.state': 'pending' },
        { 'finalization.state': 'failed' },
        ...availableLease,
      ],
    },
    {
      $set: {
        'finalization.state': 'processing',
        'finalization.leaseOwner': leaseOwner,
        'finalization.leaseExpiresAt': leaseExpiresAt,
      },
      $unset: {
        'finalization.lastFailureCode': 1,
        'finalization.completedAt': 1,
      },
      $inc: { 'finalization.attemptCount': 1 },
    },
    { new: true }
  ).lean<StoredWeeklyCheckIn | null>();
  if (processing) {
    return {
      kind: 'acquired',
      checkIn: processing,
      leaseOwner,
      phase: 'processing',
    };
  }

  const current = await WeeklyCheckIn.findById(checkInId).lean<
    StoredWeeklyCheckIn | null
  >();
  if (!current) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Weekly check-in not found',
    });
  }
  if (!current.finalization) return { kind: 'legacy', checkIn: current };
  if (current.finalization.state === 'completed') {
    return current.computed.factorEngine?.status === 'MATERIALIZED'
      ? { kind: 'completed', checkIn: current }
      : { kind: 'legacy', checkIn: current };
  }

  throw new DomainError({
    code: 'IDEMPOTENCY_IN_PROGRESS',
    status: 503,
    message: 'Weekly check-in finalization is already in progress; retry shortly',
  });
};

const applyWeeklyCheckInEffects = async (input: {
  checkInId: Types.ObjectId;
  currentUserId: string;
  pairId: string;
  memberIds: readonly [string, string];
  leaseOwner: string;
}): Promise<void> => {
  const checkIn = await WeeklyCheckIn.findOne({
    _id: input.checkInId,
    pairId: new Types.ObjectId(input.pairId),
    'finalization.version': WEEKLY_CHECK_IN_FINALIZATION_VERSION,
    'finalization.state': 'processing',
    'finalization.leaseOwner': input.leaseOwner,
  }).lean<StoredWeeklyCheckIn | null>();
  if (!checkIn) {
    throw new DomainError({
      code: 'IDEMPOTENCY_IN_PROGRESS',
      status: 503,
      message: 'Weekly check-in finalization lease was lost',
    });
  }

  const materialized = await processWeeklyFactorCheckIn({
    pairId: input.pairId,
    memberIds: input.memberIds,
    actorId: input.currentUserId,
    checkInId: String(checkIn._id),
    closeness: checkIn.answers.closeness,
    irritation: checkIn.answers.irritation,
    fatigue: checkIn.answers.fatigue,
    readiness: checkIn.answers.readiness,
    observedAt: checkIn.createdAt,
  });
  const now = new Date();
  const computed: WeeklyCheckInType['computed'] = {
    factorEngine: {
      status: 'MATERIALIZED',
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      evidenceEventIds: materialized.evidence.map((event) => event.eventId),
      individualSnapshotIds: materialized.individualSnapshots.map(
        (snapshot) => snapshot.snapshotId
      ),
      pairEvaluationSnapshotIds: materialized.pairEvaluations.map(
        (snapshot) => snapshot.snapshotId
      ),
    },
  };
  const marked = await WeeklyCheckIn.updateOne(
    {
      _id: checkIn._id,
      pairId: new Types.ObjectId(input.pairId),
      'finalization.version': WEEKLY_CHECK_IN_FINALIZATION_VERSION,
      'finalization.state': 'processing',
      'finalization.leaseOwner': input.leaseOwner,
    },
    {
      $set: {
        computed,
        'finalization.state': 'effects_applied',
        'finalization.leaseExpiresAt': new Date(
          now.getTime() + WEEKLY_CHECK_IN_FINALIZATION_LEASE_MS
        ),
      },
    }
  );
  if (marked.modifiedCount !== 1) {
    const current = await WeeklyCheckIn.findById(input.checkInId)
      .select({ computed: 1, finalization: 1 })
      .lean<Pick<StoredWeeklyCheckIn, 'computed' | 'finalization'> | null>();
    if (
      current?.finalization?.state === 'effects_applied' &&
      current.finalization.leaseOwner === input.leaseOwner &&
      current.computed.factorEngine.status === 'MATERIALIZED'
    ) {
      return;
    }
    throw new DomainError({
      code: 'IDEMPOTENCY_IN_PROGRESS',
      status: 503,
      message: 'Weekly check-in finalization lease was lost',
    });
  }
};

const completeWeeklyCheckInFinalization = async (input: {
  checkInId: Types.ObjectId;
  leaseOwner: string;
}): Promise<void> => {
  const completedAt = new Date();
  const completed = await WeeklyCheckIn.updateOne(
    {
      _id: input.checkInId,
      'finalization.version': WEEKLY_CHECK_IN_FINALIZATION_VERSION,
      'finalization.state': 'effects_applied',
      'finalization.leaseOwner': input.leaseOwner,
    },
    {
      $set: {
        'finalization.state': 'completed',
        'finalization.completedAt': completedAt,
      },
      $unset: {
        'finalization.leaseOwner': 1,
        'finalization.leaseExpiresAt': 1,
        'finalization.lastFailureCode': 1,
      },
    }
  );
  if (completed.modifiedCount === 1) return;

  const current = await WeeklyCheckIn.findById(input.checkInId)
    .select({ finalization: 1 })
    .lean<Pick<StoredWeeklyCheckIn, 'finalization'> | null>();
  if (current?.finalization?.state === 'completed') return;
  throw new Error('Weekly check-in finalization completion lease was lost');
};

const releaseWeeklyCheckInFinalization = async (input: {
  checkInId: Types.ObjectId;
  leaseOwner: string;
  effectsApplied: boolean;
  failureCode: string;
}): Promise<void> => {
  const identity = {
    _id: input.checkInId,
    'finalization.leaseOwner': input.leaseOwner,
  };
  if (input.effectsApplied) {
    await WeeklyCheckIn.updateOne(
      { ...identity, 'finalization.state': 'effects_applied' },
      {
        $set: {
          'finalization.lastFailureCode': input.failureCode.slice(0, 100),
        },
        $unset: {
          'finalization.leaseOwner': 1,
          'finalization.leaseExpiresAt': 1,
        },
      }
    );
    return;
  }

  await WeeklyCheckIn.updateOne(
    { ...identity, 'finalization.state': 'processing' },
    {
      $set: {
        'finalization.state': 'failed',
        'finalization.lastFailureCode': input.failureCode.slice(0, 100),
      },
      $unset: {
        'finalization.leaseOwner': 1,
        'finalization.leaseExpiresAt': 1,
      },
    }
  );
};

const reconcileWeeklyCheckIn = async (input: {
  checkIn: StoredWeeklyCheckIn;
  currentUserId: string;
  pairData: PairGuardData;
  hooks: WeeklyCheckInReliabilityTestHooks;
  auditRequest?: AuditRequestContext;
}): Promise<WeeklyCheckInDTO> => {
  const claim = await claimWeeklyCheckInFinalization(input.checkIn._id);
  if (claim.kind === 'legacy') {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Weekly check-in requires Factor Engine raw-source replay',
    });
  }
  if (claim.kind === 'completed') {
    return toStoredWeeklyCheckInDTO(claim.checkIn);
  }

  const pairId = String(input.pairData.pair._id);
  const memberIds: readonly [string, string] = [
    input.pairData.pair.members[0],
    input.pairData.pair.members[1],
  ];
  await runWeeklyCheckInFinalization({
    phase: claim.phase,
    applyEffects: () =>
      applyWeeklyCheckInEffects({
        checkInId: claim.checkIn._id,
        currentUserId: input.currentUserId,
        pairId,
        memberIds,
        leaseOwner: claim.leaseOwner,
      }),
    syncMaterializedCycle: async () => {
      await weeklyCycleService.syncAfterCheckIn({
        pair: input.pairData.pair,
        cycleKey: claim.checkIn.weekKey,
        now: new Date(),
      });
    },
    beforeComplete: input.hooks.beforeFinalizationCompletion,
    complete: () =>
      completeWeeklyCheckInFinalization({
        checkInId: claim.checkIn._id,
        leaseOwner: claim.leaseOwner,
      }),
    releaseAfterFailure: (failure) =>
      releaseWeeklyCheckInFinalization({
        checkInId: claim.checkIn._id,
        leaseOwner: claim.leaseOwner,
        ...failure,
      }),
  });

  const finalized = await WeeklyCheckIn.findById(claim.checkIn._id).lean<
    StoredWeeklyCheckIn | null
  >();
  if (!finalized || finalized.finalization?.state !== 'completed') {
    throw new DomainError({
      code: 'IDEMPOTENCY_IN_PROGRESS',
      status: 503,
      message: 'Weekly check-in finalization is incomplete; retry shortly',
    });
  }

  await emitEvent({
    event: 'WEEKLY_CHECKIN_SUBMITTED',
    actor: { userId: input.currentUserId },
    request: input.auditRequest ?? {
      route: '/api/checkins/weekly',
      method: 'POST',
    },
    context: { pairId },
    target: { type: 'user', id: input.currentUserId },
    metadata: {
      pairId,
      weekKey: finalized.weekKey,
      factorEngineStatus: 'MATERIALIZED',
      pairStateUpdated:
        finalized.computed.factorEngine.pairEvaluationSnapshotIds.length > 0,
    },
  });
  recordProductAnalyticsEvent({
    name: 'checkin_submitted',
    technicalScope: 'weekly_cycle',
  });
  return toDTO({ checkIn: finalized });
};

export const weeklyCheckInService = {
  async submit(
    input: WeeklyCheckInSubmitInput,
    hooks: WeeklyCheckInReliabilityTestHooks = {}
  ): Promise<WeeklyCheckInDTO> {
    await connectToDatabase();
    const answers = validateWeeklyAnswers(input.answers);
    const weekKey = input.weekKey?.trim() || currentWeekKey();
    const pairData = await resolvePair(input.pairId, input.currentUserId);
    if (!pairData) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'An active pair is required for a weekly check-in',
      });
    }
    assertPairAcceptsCheckIn(pairData.pair);

    const userExists = await User.exists({ id: input.currentUserId });
    if (!userExists) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const pairId = String(pairData.pair._id);
    const identityFilter = pairIdentityFilter({
      userId: input.currentUserId,
      pairId,
      weekKey,
    });
    const existingCheckIn = await WeeklyCheckIn.findOne(identityFilter).lean<
      StoredWeeklyCheckIn | null
    >();
    if (existingCheckIn) {
      return reconcileWeeklyCheckIn({
        checkIn: existingCheckIn,
        currentUserId: input.currentUserId,
        pairData,
        hooks,
        auditRequest: input.auditRequest,
      });
    }

    const now = new Date();
    const preliminaryComputed: WeeklyCheckInType['computed'] = {
      factorEngine: {
        status: 'PENDING',
        evidenceEventIds: [],
        individualSnapshotIds: [],
        pairEvaluationSnapshotIds: [],
      },
    };

    let checkIn: StoredWeeklyCheckIn;
    const claim = await weeklyCycleService.claimSubmission({
      pair: pairData.pair,
      currentUserId: input.currentUserId,
      cycleKey: weekKey,
      now,
    });
    const submissionClaimToken = claim.token;
    try {
      checkIn = await weeklyCycleService.commitClaimedSubmission({
        pair: pairData.pair,
        currentUserId: input.currentUserId,
        cycleKey: weekKey,
        token: submissionClaimToken,
        answers,
        computed: preliminaryComputed,
        beforePairLifecycleGuard: hooks.beforePrimaryCommitLifecycleGuard,
      });
    } catch (error) {
      if (error instanceof Error && isDuplicateKeyError(error as object)) {
        const concurrent = await WeeklyCheckIn.findOne(identityFilter).lean<
          StoredWeeklyCheckIn | null
        >();
        if (concurrent) {
          await weeklyCycleService.releaseSubmissionClaim({
            pair: pairData.pair,
            currentUserId: input.currentUserId,
            cycleKey: weekKey,
            token: submissionClaimToken,
          });
          return reconcileWeeklyCheckIn({
            checkIn: concurrent,
            currentUserId: input.currentUserId,
            pairData,
            hooks,
            auditRequest: input.auditRequest,
          });
        }
      }
      await weeklyCycleService.releaseSubmissionClaim({
        pair: pairData.pair,
        currentUserId: input.currentUserId,
        cycleKey: weekKey,
        token: submissionClaimToken,
      });
      throw error;
    }

    await hooks.afterPrimaryCommit?.();
    return reconcileWeeklyCheckIn({
      checkIn,
      currentUserId: input.currentUserId,
      pairData,
      hooks,
      auditRequest: input.auditRequest,
    });
  },

  async current(input: {
    currentUserId: string;
    pairId?: string;
    weekKey?: string;
  }): Promise<WeeklyCheckInDTO | null> {
    await connectToDatabase();
    const pairData = await resolvePair(input.pairId, input.currentUserId);
    if (!pairData) return null;
    const weekKey = input.weekKey?.trim() || currentWeekKey();
    const pairId = String(pairData.pair._id);
    const checkIn = await WeeklyCheckIn.findOne(
      pairIdentityFilter({ userId: input.currentUserId, pairId, weekKey })
    )
      .sort({ updatedAt: -1 })
      .lean<StoredWeeklyCheckIn | null>();
    if (!checkIn) return null;
    return toDTO({ checkIn });
  },

  async pairCurrent(input: {
    currentUserId: string;
    pairId: string;
    weekKey?: string;
  }): Promise<PairWeeklyCheckInPairDTO> {
    await connectToDatabase();
    const pairData = await resolvePair(input.pairId, input.currentUserId);
    if (!pairData) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'pair not found',
      });
    }
    const requestedWeekKey = input.weekKey?.trim();
    if (requestedWeekKey && requestedWeekKey !== currentWeekKey()) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Only the current weekly Pair Summary is available here',
      });
    }
    const cycle = await weeklyCycleService.current({
      pair: pairData.pair,
      currentUserId: input.currentUserId,
    });
    const peerId = pairData.pair.members.find(
      (memberId) => memberId !== input.currentUserId
    );
    const peer = peerId
      ? await User.findOne({ id: peerId })
          .select({ id: 1, username: 1, avatar: 1 })
          .lean<PairWeeklyMember | null>()
      : null;
    const reasonCodes: PairWeeklyCheckInPairDTO['pair']['reasonCodes'] =
      cycle.pair.dataStatus === 'NOT_READY'
        ? ['WAITING_FOR_RESPONSES']
        : cycle.pair.dataStatus === 'PARTIAL'
          ? ['WAITING_FOR_PEER']
          : cycle.pair.dataStatus === 'ENOUGH'
            ? ['PAIR_SIGNALS_READY']
            : ['PAIR_DATA_INSUFFICIENT'];
    return {
      pairId: cycle.pairId,
      weekKey: cycle.cycleKey,
      currentUser: {
        submitted: cycle.currentUser.completionStatus === 'SUBMITTED',
      },
      peer: {
        submitted: cycle.peer.completionStatus === 'SUBMITTED',
        ...(peer
          ? {
              username: peer.username,
              avatar: peer.avatar,
              avatarUrl: toDiscordAvatarUrl(peer.id, peer.avatar),
            }
          : {}),
      },
      pair: {
        bothSubmitted: cycle.pair.bothSubmitted,
        dataStatus:
          cycle.pair.dataStatus === 'EXPIRED'
            ? 'INSUFFICIENT'
            : cycle.pair.dataStatus,
        reasonCodes,
        signals: cycle.pair.signals.map((signal) => ({
          ...signal,
          dataStatus: 'ENOUGH' as const,
        })),
      },
    };
  },
};
