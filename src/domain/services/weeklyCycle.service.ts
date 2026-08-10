import { createHash, randomUUID } from 'node:crypto';
import mongoose, { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import type { PairType } from '@/models/Pair';
import {
  PairStateSnapshot,
  type PairStateReasonCode,
  type PairStateSignal,
  type PairStateSignalKey,
  type PairStateSignalStatus,
  type PairStateSnapshotType,
} from '@/models/PairStateSnapshot';
import {
  WeeklyCycle,
  WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX,
  type WeeklyCycleMemberCompletion,
  type WeeklyCycleMemberStatus,
  type WeeklyCyclePairReadiness,
  type WeeklyCycleType,
} from '@/models/WeeklyCycle';
import {
  WeeklyCheckIn,
  type WeeklyCheckInAnswers,
  type WeeklyCheckInType,
} from '@/models/WeeklyCheckIn';
import { notificationService } from '@/domain/services/notification.service';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';

export const WEEKLY_CYCLE_INPUT_DEFINITION_VERSION = 'weekly-checkin-v1';
export const PAIR_STATE_ALGORITHM_VERSION = 'pair-state-v1';
export const PAIR_STATE_DISPLAY_VERSION = 'pair-state-display-v1';
export const PAIR_STATE_DIVERGENCE_THRESHOLD = 0.3;
export const WEEKLY_CYCLE_TIME_ZONE = 'UTC';
export const WEEKLY_CYCLE_SUBMISSION_CLAIM_TTL_MS = 2 * 60 * 1000;
export const WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT = 8;
const WEEKLY_CYCLE_CANONICAL_READ_RETRY_LIMIT = 3;

type PairStateMetrics = {
  closeness: number;
  fatigue: number;
  irritation: number;
  readiness: number;
};

export type PairStateCheckInInput = {
  _id: Types.ObjectId;
  userId: string;
  createdAt: Date;
  answers?: Partial<PairStateMetrics>;
};

export type PairStateProjection = {
  memberCompletion: WeeklyCycleMemberCompletion[];
  submissionCount: number;
  cycleStatus: 'OPEN' | 'EXPIRED';
  dataStatus: WeeklyCyclePairReadiness;
  reasonCodes: PairStateReasonCode[];
  signals: PairStateSignal[];
  evidenceRevisionIds: string[];
  inputHash: string;
};

export type CurrentWeeklyCycleDTO = {
  pairId: string;
  cycleId: string;
  cycleKey: string;
  window: {
    startsAt: string;
    endsAt: string;
    status: 'OPEN' | 'EXPIRED';
    timeZone: typeof WEEKLY_CYCLE_TIME_ZONE;
  };
  currentUser: { completionStatus: WeeklyCycleMemberStatus };
  peer: { completionStatus: WeeklyCycleMemberStatus };
  pair: {
    bothSubmitted: boolean;
    dataStatus: WeeklyCyclePairReadiness;
    reasonCodes: PairStateReasonCode[];
    signals: PairStateSignal[];
  };
  snapshot: {
    revision: number;
    generatedAt: string;
    inputDefinitionVersion: string;
    algorithmVersion: string;
    displayVersion: string;
  };
};

type StoredWeeklyCycle = WeeklyCycleType & { _id: Types.ObjectId };
type StoredPairStateSnapshot = PairStateSnapshotType & { _id: Types.ObjectId };
type StoredWeeklyCheckIn = WeeklyCheckInType & { _id: Types.ObjectId };
type PairDocument = HydratedDocument<PairType>;

type DuplicateKeyError = Error & { code: number };

const isDuplicateKeyError = (error: Error): error is DuplicateKeyError =>
  'code' in error && (error as Error & { code?: number }).code === 11000;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const sortedMembers = (members: [string, string]): [string, string] =>
  members[0].localeCompare(members[1]) <= 0
    ? [members[0], members[1]]
    : [members[1], members[0]];

export const weeklyCycleKeyForDate = (date = new Date()): string => {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export const weeklyCycleWindow = (
  cycleKey: string
): { startsAt: Date; endsAt: Date; expiresAt: Date } => {
  const match = /^(\d{4})-W(\d{2})$/.exec(cycleKey);
  if (!match) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'cycleKey must use YYYY-Www format',
    });
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'cycleKey must identify a valid ISO week',
    });
  }
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const firstMonday = new Date(januaryFourth);
  firstMonday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1);
  const startsAt = new Date(firstMonday);
  startsAt.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(startsAt.getUTCDate() + 7);
  const cycleThursday = new Date(startsAt);
  cycleThursday.setUTCDate(startsAt.getUTCDate() + 3);
  if (weeklyCycleKeyForDate(cycleThursday) !== cycleKey) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'cycleKey must identify a valid ISO week',
    });
  }

  return { startsAt, endsAt, expiresAt: new Date(endsAt) };
};

export const buildPairStateInputHash = (input: {
  cycleKey: string;
  evidenceRevisionIds: string[];
  memberCompletion?: WeeklyCycleMemberCompletion[];
  definitionVersion?: string;
  cycleStatus?: 'OPEN' | 'EXPIRED';
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        cycleKey: input.cycleKey,
        definitionVersion:
          input.definitionVersion ?? WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
        cycleStatus: input.cycleStatus ?? 'OPEN',
        timeZone: WEEKLY_CYCLE_TIME_ZONE,
        evidenceRevisionIds: [...input.evidenceRevisionIds].sort(),
        memberCompletion: [...(input.memberCompletion ?? [])]
          .sort((left, right) => left.userId.localeCompare(right.userId))
          .map(({ userId, status }) => ({ userId, status })),
      })
    )
    .digest('hex');

const metricsFrom = (row: PairStateCheckInInput): PairStateMetrics | null => {
  const values = row.answers;
  if (!values) return null;
  const metrics = [
    values.closeness,
    values.fatigue,
    values.irritation,
    values.readiness,
  ];
  if (
    !metrics.every(
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1
    )
  ) {
    return null;
  }
  return {
    closeness: values.closeness as number,
    fatigue: values.fatigue as number,
    irritation: values.irritation as number,
    readiness: values.readiness as number,
  };
};

const signalFor = (input: {
  key: PairStateSignalKey;
  value: number;
  divergence: number;
}): PairStateSignal => {
  const status: PairStateSignalStatus =
    input.divergence >= PAIR_STATE_DIVERGENCE_THRESHOLD
      ? 'MIXED'
      : input.value <= 0.33
        ? 'LOW'
        : input.value >= 0.67
          ? 'HIGH'
          : 'STEADY';
  const reasonCode =
    status === 'MIXED'
      ? 'DIFFERENT_EXPERIENCE'
      : status === 'LOW'
        ? 'PAIR_LEVEL_LOW'
        : status === 'HIGH'
          ? 'PAIR_LEVEL_HIGH'
          : 'PAIR_LEVEL_STEADY';
  const nextStepHint =
    input.key === 'recovery' && status !== 'HIGH'
      ? 'MAKE_ROOM_FOR_RECOVERY'
      : (input.key === 'tension' && status !== 'LOW') || status === 'MIXED'
        ? 'CHOOSE_LOW_EFFORT'
        : status === 'LOW'
          ? 'CHECK_IN_TOGETHER'
          : 'KEEP_CURRENT_RHYTHM';

  return { key: input.key, status, reasonCode, nextStepHint };
};

export const buildPairStateProjection = (input: {
  cycleKey: string;
  members: [string, string];
  checkIns: PairStateCheckInInput[];
  previousMemberCompletion?: WeeklyCycleMemberCompletion[];
  endsAt: Date;
  now: Date;
}): PairStateProjection => {
  const members = sortedMembers(input.members);
  const latestByMember = new Map<string, PairStateCheckInInput>();
  for (const row of input.checkIns) {
    if (!members.includes(row.userId)) continue;
    const existing = latestByMember.get(row.userId);
    if (!existing || existing.createdAt.getTime() < row.createdAt.getTime()) {
      latestByMember.set(row.userId, row);
    }
  }

  const expired = input.now.getTime() >= input.endsAt.getTime();
  const previousStatus = new Map(
    (input.previousMemberCompletion ?? []).map((member) => [member.userId, member.status])
  );
  const memberCompletion: WeeklyCycleMemberCompletion[] = members.map((userId) => ({
    userId,
    status:
      previousStatus.get(userId) === 'SKIPPED'
        ? 'SKIPPED'
        : previousStatus.get(userId) === 'EXPIRED'
          ? 'EXPIRED'
          : latestByMember.has(userId)
            ? 'SUBMITTED'
            : expired
              ? 'EXPIRED'
              : 'PENDING',
  }));
  const completionStatus = new Map(
    memberCompletion.map((member) => [member.userId, member.status])
  );
  const submittedRows = members
    .filter((memberId) => completionStatus.get(memberId) === 'SUBMITTED')
    .map((memberId) => latestByMember.get(memberId))
    .filter((row): row is PairStateCheckInInput => Boolean(row));
  const evidenceRevisionIds = submittedRows.map((row) => String(row._id));
  const submissionCount = submittedRows.length;
  const cycleStatus = expired ? 'EXPIRED' : 'OPEN';
  const completeMetrics = submittedRows.map(metricsFrom);
  const hasEnoughMetrics =
    submissionCount === 2 && completeMetrics.every((metrics) => metrics !== null);

  const allResolved = memberCompletion.every((member) => member.status !== 'PENDING');
  const dataStatus: WeeklyCyclePairReadiness =
    submissionCount === 2
      ? hasEnoughMetrics
        ? 'ENOUGH'
        : 'INSUFFICIENT'
      : expired || allResolved
        ? 'INSUFFICIENT'
        : submissionCount === 0
          ? 'NOT_READY'
          : 'PARTIAL';
  const reasonCodes: PairStateReasonCode[] =
    dataStatus === 'NOT_READY'
      ? ['NO_MEMBER_SUBMISSIONS']
      : dataStatus === 'PARTIAL'
        ? ['PAIR_INPUT_PARTIAL']
        : dataStatus === 'ENOUGH'
          ? ['PAIR_SIGNALS_READY']
          : expired && submissionCount < 2
            ? ['CYCLE_EXPIRED']
            : ['PAIR_INPUT_INSUFFICIENT'];

  let signals: PairStateSignal[] = [];
  if (dataStatus === 'ENOUGH') {
    const left = completeMetrics[0] as PairStateMetrics;
    const right = completeMetrics[1] as PairStateMetrics;
    signals = [
      signalFor({
        key: 'connection',
        value: clamp01((left.closeness + right.closeness) / 2),
        divergence: Math.abs(left.closeness - right.closeness),
      }),
      signalFor({
        key: 'tension',
        value: clamp01((left.irritation + right.irritation) / 2),
        divergence: Math.abs(left.irritation - right.irritation),
      }),
      signalFor({
        key: 'recovery',
        value: clamp01(1 - (left.fatigue + right.fatigue) / 2),
        divergence: Math.abs(left.fatigue - right.fatigue),
      }),
      signalFor({
        key: 'resource',
        value: clamp01((left.readiness + right.readiness) / 2),
        divergence: Math.abs(left.readiness - right.readiness),
      }),
    ];
  }

  return {
    memberCompletion,
    submissionCount,
    cycleStatus,
    dataStatus,
    reasonCodes,
    signals,
    evidenceRevisionIds,
    inputHash: buildPairStateInputHash({
      cycleKey: input.cycleKey,
      evidenceRevisionIds,
      memberCompletion,
      cycleStatus,
    }),
  };
};

const getOrCreateWeeklyCycle = async (input: {
  pairId: Types.ObjectId;
  members: [string, string];
  cycleKey: string;
  now: Date;
}): Promise<{ cycle: StoredWeeklyCycle; created: boolean }> => {
  const window = weeklyCycleWindow(input.cycleKey);
  const memberIds = sortedMembers(input.members);
  const initialStatus = input.now.getTime() >= window.endsAt.getTime() ? 'EXPIRED' : 'OPEN';
  const filter = { pairId: input.pairId, cycleKey: input.cycleKey };

  try {
    const result = await WeeklyCycle.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          pairId: input.pairId,
          cycleKey: input.cycleKey,
          ...window,
          timeZone: WEEKLY_CYCLE_TIME_ZONE,
          status: initialStatus,
          memberIds,
          memberCompletion: memberIds.map((userId) => ({
            userId,
            status: 'PENDING',
          })),
          pairReadiness: initialStatus === 'EXPIRED' ? 'EXPIRED' : 'NOT_READY',
          submissionCount: 0,
          submissionClaims: [],
          inputDefinitionVersion: WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
          algorithmVersion: PAIR_STATE_ALGORITHM_VERSION,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        includeResultMetadata: true,
      }
    );
    const cycle = result.value;
    if (cycle) {
      return {
        cycle: cycle.toObject<StoredWeeklyCycle>(),
        created: result.lastErrorObject?.updatedExisting === false,
      };
    }
  } catch (error) {
    if (!(error instanceof Error) || !isDuplicateKeyError(error)) throw error;
    const concurrent = await WeeklyCycle.findOne(filter).lean<StoredWeeklyCycle | null>();
    if (concurrent) return { cycle: concurrent, created: false };
  }

  throw new DomainError({
    code: 'INTERNAL',
    status: 500,
    message: 'Weekly cycle was not materialized',
  });
};

const createSnapshotRevision = async (input: {
  pairId: Types.ObjectId;
  cycle: StoredWeeklyCycle;
  projection: PairStateProjection;
  generatedAt: Date;
}): Promise<{ snapshot: StoredPairStateSnapshot; created: boolean }> => {
  const canonicalFilter = {
    cycleId: input.cycle._id,
    'input.hash': input.projection.inputHash,
    'algorithm.version': PAIR_STATE_ALGORITHM_VERSION,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await PairStateSnapshot.findOne(canonicalFilter).lean<
      StoredPairStateSnapshot | null
    >();
    if (existing) return { snapshot: existing, created: false };

    const latest = await PairStateSnapshot.findOne({ cycleId: input.cycle._id })
      .sort({ revision: -1 })
      .select({ revision: 1 })
      .lean<Pick<StoredPairStateSnapshot, 'revision'> | null>();
    const revision = (latest?.revision ?? -1) + 1;

    try {
      const created = await PairStateSnapshot.create({
        pairId: input.pairId,
        cycleId: input.cycle._id,
        cycleKey: input.cycle.cycleKey,
        revision,
        memberCompletion: input.projection.memberCompletion,
        dataStatus: input.projection.dataStatus,
        reasonCodes: input.projection.reasonCodes,
        signals: input.projection.signals,
        input: {
          definitionVersion: WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
          evidenceRevisionIds: input.projection.evidenceRevisionIds,
          hash: input.projection.inputHash,
          cycleStatus: input.projection.cycleStatus,
          timeZone: WEEKLY_CYCLE_TIME_ZONE,
        },
        algorithm: { version: PAIR_STATE_ALGORITHM_VERSION },
        displayVersion: PAIR_STATE_DISPLAY_VERSION,
        generatedAt: input.generatedAt,
      });
      return {
        snapshot: created.toObject<StoredPairStateSnapshot>(),
        created: true,
      };
    } catch (error) {
      if (!(error instanceof Error) || !isDuplicateKeyError(error)) throw error;
      const concurrent = await PairStateSnapshot.findOne(canonicalFilter).lean<
        StoredPairStateSnapshot | null
      >();
      if (concurrent) return { snapshot: concurrent, created: false };
    }
  }

  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Pair state revision could not be allocated',
  });
};

const ensureCycleNotifications = async (input: {
  pairId: string;
  members: [string, string];
  cycle: StoredWeeklyCycle;
  snapshot: StoredPairStateSnapshot;
  now: Date;
}): Promise<void> => {
  const writes: Promise<void>[] = [];
  if (input.cycle.status === 'OPEN') {
    writes.push(
      notificationService.create({
        userIds: input.members,
        pairId: input.pairId,
        type: 'CYCLE_AVAILABLE',
        sourceKey: `cycle:${String(input.cycle._id)}`,
        now: input.now,
      })
    );
  }
  if (input.snapshot.dataStatus === 'ENOUGH') {
    writes.push(
      notificationService.create({
        userIds: input.members,
        pairId: input.pairId,
        type: 'SUMMARY_READY',
        sourceKey: `snapshot:${String(input.snapshot._id)}`,
        now: input.now,
      })
    );
  }
  if (writes.length === 0) return;

  try {
    await Promise.all(writes);
  } catch {
    recordOperationalEvent({
      name: 'request_completed',
      routeGroup: 'notification',
      outcome: 'error',
      code: 'WRITE_FAILED',
    });
  }
};

const projectionFromSnapshot = (
  snapshot: StoredPairStateSnapshot
): PairStateProjection => ({
  memberCompletion: snapshot.memberCompletion,
  submissionCount: snapshot.memberCompletion.filter(
    (member) => member.status === 'SUBMITTED'
  ).length,
  cycleStatus: snapshot.input.cycleStatus,
  dataStatus: snapshot.dataStatus,
  reasonCodes: snapshot.reasonCodes,
  signals: snapshot.signals,
  evidenceRevisionIds: snapshot.input.evidenceRevisionIds,
  inputHash: snapshot.input.hash,
});

const materializePairCycle = async (input: {
  pair: PairDocument;
  cycleKey: string;
  now?: Date;
  allowEndedPair?: boolean;
  canonicalReadAttempt?: number;
}): Promise<{
  cycle: StoredWeeklyCycle;
  snapshot: StoredPairStateSnapshot;
  projection: PairStateProjection;
}> => {
  await connectToDatabase();
  if (input.pair.status === 'ended' && !input.allowEndedPair) {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Weekly cycle is unavailable for an ended pair',
    });
  }

  const now = input.now ?? new Date();
  const pairId = new Types.ObjectId(String(input.pair._id));
  if (
    input.pair.members.length !== 2 ||
    !input.pair.members[0] ||
    !input.pair.members[1] ||
    input.pair.members[0] === input.pair.members[1]
  ) {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Weekly cycle requires two different pair members',
    });
  }
  const members: [string, string] = [input.pair.members[0], input.pair.members[1]];
  const materializedCycle = await getOrCreateWeeklyCycle({
    pairId,
    members,
    cycleKey: input.cycleKey,
    now,
  });
  const cycle = materializedCycle.cycle;
  if (materializedCycle.created) {
    const hasPreviousCycle = Boolean(
      await WeeklyCycle.exists({ pairId, _id: { $ne: cycle._id } })
    );
    if (hasPreviousCycle) {
      recordProductAnalyticsEvent({
        name: 'next_cycle_started',
        technicalScope: 'weekly_cycle',
        at: now,
      });
    } else {
      recordProductAnalyticsEvent({
        name: 'cycle_started',
        technicalScope: 'weekly_cycle',
        at: now,
      });
    }
  }
  const checkIns = await WeeklyCheckIn.find({
    pairId: { $in: [String(pairId), pairId] },
    weekKey: input.cycleKey,
    userId: { $in: members },
  })
    .select({
      _id: 1,
      userId: 1,
      createdAt: 1,
      'answers.closeness': 1,
      'answers.fatigue': 1,
      'answers.irritation': 1,
      'answers.readiness': 1,
    })
    .sort({ createdAt: -1 })
    .lean<PairStateCheckInInput[]>();
  const submittedUserIds = members.filter((memberId) =>
    checkIns.some((checkIn) => checkIn.userId === memberId)
  );
  await Promise.all(
    submittedUserIds.map((userId) =>
      WeeklyCycle.updateOne(
        {
          _id: cycle._id,
          memberCompletion: {
            $elemMatch: { userId, status: 'PENDING' },
          },
        },
        { $set: { 'memberCompletion.$.status': 'SUBMITTED' } }
      )
    )
  );
  if (now.getTime() >= cycle.endsAt.getTime()) {
    await WeeklyCycle.updateOne(
      { _id: cycle._id },
      { $set: { 'memberCompletion.$[member].status': 'EXPIRED' } },
      { arrayFilters: [{ 'member.status': 'PENDING' }] }
    );
  }
  const refreshedCycle =
    (await WeeklyCycle.findById(cycle._id).lean<StoredWeeklyCycle | null>()) ?? cycle;
  const projection = buildPairStateProjection({
    cycleKey: input.cycleKey,
    members,
    checkIns,
    previousMemberCompletion: refreshedCycle.memberCompletion,
    endsAt: refreshedCycle.endsAt,
    now,
  });

  await WeeklyCycle.updateOne(
    {
      _id: refreshedCycle._id,
      submissionCount: { $lte: projection.submissionCount },
      memberCompletion: projection.memberCompletion,
      ...(projection.cycleStatus === 'OPEN' ? { status: 'OPEN' } : {}),
    },
    {
      $set: {
        pairReadiness: projection.dataStatus,
        submissionCount: projection.submissionCount,
        status: projection.cycleStatus,
        timeZone: WEEKLY_CYCLE_TIME_ZONE,
        inputDefinitionVersion: WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
        algorithmVersion: PAIR_STATE_ALGORITHM_VERSION,
      },
    }
  );

  await WeeklyCycle.updateOne(
    { _id: refreshedCycle._id },
    {
      $pull: {
        submissionClaims: {
          $or: [
            { userId: { $in: submittedUserIds } },
            { expiresAt: { $lte: now } },
          ],
        },
      },
    }
  );

  const snapshotResult = await createSnapshotRevision({
    pairId,
    cycle: refreshedCycle,
    projection,
    generatedAt: now,
  });
  const snapshot = snapshotResult.snapshot;
  await WeeklyCycle.updateOne(
    {
      _id: refreshedCycle._id,
      submissionCount: projection.submissionCount,
      memberCompletion: projection.memberCompletion,
      status: projection.cycleStatus,
      pairReadiness: projection.dataStatus,
      $or: [
        { latestSnapshotRevision: { $exists: false } },
        { latestSnapshotRevision: { $lte: snapshot.revision } },
      ],
    },
    {
      $set: {
        latestSnapshotId: snapshot._id,
        latestSnapshotRevision: snapshot.revision,
      },
    }
  );

  const canonicalCycle = await WeeklyCycle.findById(refreshedCycle._id).lean<
    StoredWeeklyCycle | null
  >();
  const canonicalSnapshotId = canonicalCycle?.latestSnapshotId;
  const canonicalSnapshot = canonicalSnapshotId
    ? String(canonicalSnapshotId) === String(snapshot._id)
      ? snapshot
      : await PairStateSnapshot.findOne({
          _id: canonicalSnapshotId,
          cycleId: refreshedCycle._id,
          pairId,
        }).lean<StoredPairStateSnapshot | null>()
    : null;

  if (!canonicalCycle || !canonicalSnapshot) {
    const canonicalReadAttempt = input.canonicalReadAttempt ?? 0;
    if (canonicalReadAttempt < WEEKLY_CYCLE_CANONICAL_READ_RETRY_LIMIT) {
      return materializePairCycle({
        ...input,
        canonicalReadAttempt: canonicalReadAttempt + 1,
      });
    }
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Canonical weekly cycle snapshot is unavailable',
    });
  }

  if (snapshotResult.created && canonicalSnapshot.dataStatus === 'ENOUGH') {
    recordOperationalEvent({
      name: 'cycle_completed',
      routeGroup: 'weekly_cycle',
      outcome: 'ok',
    });
  }

  await ensureCycleNotifications({
    pairId: String(pairId),
    members,
    cycle: canonicalCycle,
    snapshot: canonicalSnapshot,
    now,
  });

  return {
    cycle: canonicalCycle,
    snapshot: canonicalSnapshot,
    projection: projectionFromSnapshot(canonicalSnapshot),
  };
};

const toCurrentWeeklyCycleDTO = (input: {
  pair: PairDocument;
  currentUserId: string;
  cycle: StoredWeeklyCycle;
  snapshot: StoredPairStateSnapshot;
}): CurrentWeeklyCycleDTO => {
  const peerId = input.pair.members.find(
    (memberId) => memberId !== input.currentUserId
  );
  const completionFor = (userId: string | undefined): WeeklyCycleMemberStatus =>
    input.snapshot.memberCompletion.find((member) => member.userId === userId)
      ?.status ?? 'PENDING';

  return {
    pairId: String(input.pair._id),
    cycleId: String(input.cycle._id),
    cycleKey: input.cycle.cycleKey,
    window: {
      startsAt: input.cycle.startsAt.toISOString(),
      endsAt: input.cycle.endsAt.toISOString(),
      status: input.snapshot.input.cycleStatus,
      timeZone: WEEKLY_CYCLE_TIME_ZONE,
    },
    currentUser: { completionStatus: completionFor(input.currentUserId) },
    peer: { completionStatus: completionFor(peerId) },
    pair: {
      bothSubmitted: input.snapshot.memberCompletion.every(
        (member) => member.status === 'SUBMITTED'
      ),
      dataStatus: input.snapshot.dataStatus,
      reasonCodes: input.snapshot.reasonCodes,
      signals: input.snapshot.signals,
    },
    snapshot: {
      revision: input.snapshot.revision,
      generatedAt: input.snapshot.generatedAt.toISOString(),
      inputDefinitionVersion: input.snapshot.input.definitionVersion,
      algorithmVersion: input.snapshot.algorithm.version,
      displayVersion: input.snapshot.displayVersion,
    },
  };
};

const throwSubmissionClaimConflict = async (input: {
  cycleId: Types.ObjectId;
  currentUserId: string;
  token: string;
  now: Date;
  session: ClientSession;
}): Promise<never> => {
  const latest = await WeeklyCycle.findById(input.cycleId)
    .select({
      status: 1,
      endsAt: 1,
      memberCompletion: 1,
      submissionClaims: 1,
    })
    .session(input.session)
    .lean<
      Pick<
        StoredWeeklyCycle,
        'status' | 'endsAt' | 'memberCompletion' | 'submissionClaims'
      > | null
    >();
  const status = latest?.memberCompletion.find(
    (member) => member.userId === input.currentUserId
  )?.status;

  if (
    !latest ||
    latest.status === 'EXPIRED' ||
    latest.endsAt.getTime() <= input.now.getTime() ||
    status === 'EXPIRED'
  ) {
    throw new DomainError({
      code: 'WEEKLY_CYCLE_EXPIRED',
      status: 409,
      message: 'This weekly cycle has expired',
    });
  }
  if (status === 'SKIPPED') {
    throw new DomainError({
      code: 'WEEKLY_CYCLE_ALREADY_SKIPPED',
      status: 409,
      message: 'This weekly cycle was skipped',
    });
  }
  if (status === 'SUBMITTED') {
    throw new DomainError({
      code: 'WEEKLY_CYCLE_ALREADY_SUBMITTED',
      status: 409,
      message: 'This weekly cycle already has a submitted check-in',
    });
  }

  const activeClaim = (latest.submissionClaims ?? []).some(
    (claim) =>
      claim.userId === input.currentUserId &&
      claim.token !== input.token &&
      claim.expiresAt.getTime() > input.now.getTime()
  );
  throw new DomainError({
    code: activeClaim
      ? 'WEEKLY_CYCLE_SUBMISSION_IN_PROGRESS'
      : 'STATE_CONFLICT',
    status: 409,
    message: activeClaim
      ? 'A weekly check-in submission is already in progress'
      : 'Weekly cycle submission lease is no longer valid',
  });
};

type ExpiredCycleCandidate = {
  _id: Types.ObjectId;
  cycleKey: string;
};

const findUnfinalizedExpiredCycles = async (input: {
  pairId: Types.ObjectId;
  now: Date;
}): Promise<ExpiredCycleCandidate[]> =>
  WeeklyCycle.find({
    pairId: input.pairId,
    endsAt: { $lte: input.now },
    expiredReconciliationCompletedAt: null,
  })
    .sort({ endsAt: 1, cycleKey: 1 })
    .limit(WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT)
    .hint(WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX)
    .select({ _id: 1, cycleKey: 1 })
    .lean<ExpiredCycleCandidate[]>();

const finalizeExpiredPairCycles = async (input: {
  pair: PairDocument;
  now?: Date;
}): Promise<void> => {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const pairId = new Types.ObjectId(String(input.pair._id));
  const candidates = await findUnfinalizedExpiredCycles({ pairId, now });
  for (const candidate of candidates) {
    try {
      const materialized = await materializePairCycle({
        pair: input.pair,
        cycleKey: candidate.cycleKey,
        now,
        allowEndedPair: true,
      });
      if (materialized.snapshot.input.cycleStatus !== 'EXPIRED') continue;
      await WeeklyCycle.updateOne(
        {
          _id: candidate._id,
          pairId,
          endsAt: { $lte: now },
          status: 'EXPIRED',
          latestSnapshotId: materialized.snapshot._id,
          latestSnapshotRevision: materialized.snapshot.revision,
          expiredReconciliationCompletedAt: null,
        },
        { $set: { expiredReconciliationCompletedAt: now } }
      );
    } catch {
      recordOperationalEvent({
        name: 'reconciliation_failed',
        routeGroup: 'weekly_cycle',
        outcome: 'error',
        code: 'EXPIRED_RECONCILIATION_FAILED',
      });
    }
  }
};

export const weeklyCycleService = {
  async claimSubmission(input: {
    pair: PairDocument;
    currentUserId: string;
    cycleKey: string;
    now?: Date;
  }): Promise<{ token: string }> {
    if (!input.pair.members.includes(input.currentUserId)) {
      throw new DomainError({ code: 'ACCESS_DENIED', status: 403, message: 'forbidden' });
    }
    if (input.pair.status === 'ended') {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Weekly cycle is unavailable for an ended pair',
      });
    }
    const now = input.now ?? new Date();
    const window = weeklyCycleWindow(input.cycleKey);
    if (now.getTime() < window.startsAt.getTime()) {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_NOT_STARTED',
        status: 409,
        message: 'Этот недельный цикл ещё не начался.',
      });
    }
    if (now.getTime() >= window.endsAt.getTime()) {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_EXPIRED',
        status: 409,
        message: 'This weekly cycle has expired',
      });
    }
    const current = await materializePairCycle({
      pair: input.pair,
      cycleKey: input.cycleKey,
      now,
    });
    const currentStatus = current.snapshot.memberCompletion.find(
      (member) => member.userId === input.currentUserId
    )?.status;
    if (currentStatus === 'SKIPPED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_ALREADY_SKIPPED',
        status: 409,
        message: 'This weekly cycle was skipped',
      });
    }
    if (currentStatus === 'EXPIRED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_EXPIRED',
        status: 409,
        message: 'This weekly cycle has expired',
      });
    }
    if (currentStatus === 'SUBMITTED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_ALREADY_SUBMITTED',
        status: 409,
        message: 'This weekly cycle already has a submitted check-in',
      });
    }
    if (currentStatus !== 'PENDING') {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Weekly cycle is unavailable',
      });
    }

    await WeeklyCycle.updateOne(
      { _id: current.cycle._id },
      {
        $pull: {
          submissionClaims: {
            userId: input.currentUserId,
            expiresAt: { $lte: now },
          },
        },
      }
    );
    const token = randomUUID();
    const expiresAt = new Date(
      Math.min(
        now.getTime() + WEEKLY_CYCLE_SUBMISSION_CLAIM_TTL_MS,
        current.cycle.endsAt.getTime()
      )
    );

    const claimed = await WeeklyCycle.updateOne(
      {
        _id: current.cycle._id,
        memberCompletion: {
          $elemMatch: { userId: input.currentUserId, status: 'PENDING' },
        },
        submissionClaims: {
          $not: {
            $elemMatch: {
              userId: input.currentUserId,
              expiresAt: { $gt: now },
            },
          },
        },
      },
      {
        $push: {
          submissionClaims: {
            userId: input.currentUserId,
            token,
            expiresAt,
          },
        },
      }
    );
    if (claimed.modifiedCount > 0) return { token };

    const latest = await WeeklyCycle.findById(current.cycle._id)
      .select({ memberCompletion: 1, submissionClaims: 1 })
      .lean<
        Pick<StoredWeeklyCycle, 'memberCompletion' | 'submissionClaims'> | null
      >();
    const latestStatus = latest?.memberCompletion.find(
      (member) => member.userId === input.currentUserId
    )?.status;
    if (latestStatus === 'SKIPPED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_ALREADY_SKIPPED',
        status: 409,
        message: 'This weekly cycle was skipped',
      });
    }
    if (latestStatus === 'EXPIRED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_EXPIRED',
        status: 409,
        message: 'This weekly cycle has expired',
      });
    }
    if (latestStatus === 'SUBMITTED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_ALREADY_SUBMITTED',
        status: 409,
        message: 'This weekly cycle already has a submitted check-in',
      });
    }
    const activeClaim = (latest?.submissionClaims ?? []).some(
      (claim) =>
        claim.userId === input.currentUserId && claim.expiresAt.getTime() > now.getTime()
    );
    throw new DomainError({
      code: activeClaim
        ? 'WEEKLY_CYCLE_SUBMISSION_IN_PROGRESS'
        : 'STATE_CONFLICT',
      status: 409,
      message: activeClaim
        ? 'A weekly check-in submission is already in progress'
        : 'Weekly cycle changed concurrently',
    });
  },

  async releaseSubmissionClaim(input: {
    pair: PairDocument;
    currentUserId: string;
    cycleKey: string;
    token: string;
  }): Promise<void> {
    await connectToDatabase();
    await WeeklyCycle.updateOne(
      {
        pairId: input.pair._id,
        cycleKey: input.cycleKey,
      },
      {
        $pull: {
          submissionClaims: {
            userId: input.currentUserId,
            token: input.token,
          },
        },
      }
    );
  },

  async commitClaimedSubmission(input: {
    pair: PairDocument;
    currentUserId: string;
    cycleKey: string;
    token: string;
    answers: WeeklyCheckInAnswers;
    computed: WeeklyCheckInType['computed'];
    now?: Date;
  }): Promise<StoredWeeklyCheckIn> {
    await connectToDatabase();
    if (!input.pair.members.includes(input.currentUserId)) {
      throw new DomainError({ code: 'ACCESS_DENIED', status: 403, message: 'forbidden' });
    }
    if (input.pair.status === 'ended') {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Weekly cycle is unavailable for an ended pair',
      });
    }

    const cycle = await WeeklyCycle.findOne({
      pairId: input.pair._id,
      cycleKey: input.cycleKey,
    })
      .select({ _id: 1 })
      .lean<Pick<StoredWeeklyCycle, '_id'> | null>();
    if (!cycle) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Weekly cycle submission lease is unavailable',
      });
    }

    const session = await mongoose.startSession();
    try {
      const committed = await session.withTransaction(
        async (): Promise<StoredWeeklyCheckIn> => {
          const commitNow = input.now ?? new Date();
          const claimedCycle = await WeeklyCycle.findOneAndUpdate(
            {
              _id: cycle._id,
              status: 'OPEN',
              startsAt: { $lte: commitNow },
              endsAt: { $gt: commitNow },
              memberCompletion: {
                $elemMatch: { userId: input.currentUserId, status: 'PENDING' },
              },
              submissionClaims: {
                $elemMatch: {
                  userId: input.currentUserId,
                  token: input.token,
                  expiresAt: { $gt: commitNow },
                },
              },
            },
            {
              $set: { 'memberCompletion.$[member].status': 'SUBMITTED' },
              $pull: {
                submissionClaims: {
                  userId: input.currentUserId,
                  token: input.token,
                },
              },
            },
            {
              new: true,
              session,
              arrayFilters: [
                {
                  'member.userId': input.currentUserId,
                  'member.status': 'PENDING',
                },
              ],
            }
          )
            .select({ _id: 1 })
            .lean<Pick<StoredWeeklyCycle, '_id'> | null>();
          if (!claimedCycle) {
            return throwSubmissionClaimConflict({
              cycleId: cycle._id,
              currentUserId: input.currentUserId,
              token: input.token,
              now: commitNow,
              session,
            });
          }

          const created = await WeeklyCheckIn.create(
            [
              {
                userId: input.currentUserId,
                pairId: String(input.pair._id),
                weekKey: input.cycleKey,
                answers: input.answers,
                computed: input.computed,
              },
            ],
            { session }
          );
          const checkIn = created[0];
          if (!checkIn) {
            throw new DomainError({
              code: 'INTERNAL',
              status: 500,
              message: 'Weekly check-in was not created',
            });
          }
          return checkIn.toObject<StoredWeeklyCheckIn>();
        }
      );
      if (!committed) {
        throw new DomainError({
          code: 'STATE_CONFLICT',
          status: 409,
          message: 'Weekly cycle submission was not committed',
        });
      }
      return committed;
    } finally {
      await session.endSession();
    }
  },

  async finalizeExpiredCycles(input: {
    pair: PairDocument;
    now?: Date;
  }): Promise<void> {
    await finalizeExpiredPairCycles(input);
  },

  async syncAfterCheckIn(input: {
    pair: PairDocument;
    cycleKey: string;
    now?: Date;
  }): Promise<void> {
    await materializePairCycle(input);
  },

  async current(input: {
    pair: PairDocument;
    currentUserId: string;
    now?: Date;
  }): Promise<CurrentWeeklyCycleDTO> {
    if (!input.pair.members.includes(input.currentUserId)) {
      throw new DomainError({
        code: 'ACCESS_DENIED',
        status: 403,
        message: 'forbidden',
      });
    }
    const now = input.now ?? new Date();
    await finalizeExpiredPairCycles({ pair: input.pair, now });
    const materialized = await materializePairCycle({
      pair: input.pair,
      cycleKey: weeklyCycleKeyForDate(now),
      now,
    });
    return toCurrentWeeklyCycleDTO({
      pair: input.pair,
      currentUserId: input.currentUserId,
      cycle: materialized.cycle,
      snapshot: materialized.snapshot,
    });
  },

  async skipCurrent(input: {
    pair: PairDocument;
    currentUserId: string;
    now?: Date;
  }): Promise<CurrentWeeklyCycleDTO> {
    if (!input.pair.members.includes(input.currentUserId)) {
      throw new DomainError({ code: 'ACCESS_DENIED', status: 403, message: 'forbidden' });
    }
    const now = input.now ?? new Date();
    const cycleKey = weeklyCycleKeyForDate(now);
    const current = await materializePairCycle({ pair: input.pair, cycleKey, now });
    const status = current.snapshot.memberCompletion.find(
      (member) => member.userId === input.currentUserId
    )?.status;
    if (status === 'SUBMITTED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_ALREADY_SUBMITTED',
        status: 409,
        message: 'This weekly cycle already has a submitted check-in',
      });
    }
    if (status === 'EXPIRED') {
      throw new DomainError({
        code: 'WEEKLY_CYCLE_EXPIRED',
        status: 409,
        message: 'This weekly cycle has expired',
      });
    }
    if (status !== 'SKIPPED') {
      await WeeklyCycle.updateOne(
        { _id: current.cycle._id },
        {
          $pull: {
            submissionClaims: {
              userId: input.currentUserId,
              expiresAt: { $lte: now },
            },
          },
        }
      );
      const skipped = await WeeklyCycle.updateOne(
        {
          _id: current.cycle._id,
          memberCompletion: {
            $elemMatch: { userId: input.currentUserId, status: 'PENDING' },
          },
          submissionClaims: {
            $not: {
              $elemMatch: {
                userId: input.currentUserId,
                expiresAt: { $gt: now },
              },
            },
          },
        },
        {
          $set: { 'memberCompletion.$.status': 'SKIPPED' },
          $pull: { submissionClaims: { userId: input.currentUserId } },
        }
      );
      if (skipped.modifiedCount === 0) {
        const latest = await WeeklyCycle.findById(current.cycle._id)
          .select({ memberCompletion: 1, submissionClaims: 1 })
          .lean<
            Pick<StoredWeeklyCycle, 'memberCompletion' | 'submissionClaims'> | null
          >();
        const latestStatus = latest?.memberCompletion.find(
          (member) => member.userId === input.currentUserId
        )?.status;
        if (latestStatus === 'SUBMITTED') {
          throw new DomainError({
            code: 'WEEKLY_CYCLE_ALREADY_SUBMITTED',
            status: 409,
            message: 'This weekly cycle already has a submitted check-in',
          });
        }
        const activeClaim = (latest?.submissionClaims ?? []).some(
          (claim) =>
            claim.userId === input.currentUserId &&
            claim.expiresAt.getTime() > now.getTime()
        );
        if (latestStatus !== 'SKIPPED') {
          throw new DomainError({
            code: activeClaim
              ? 'WEEKLY_CYCLE_SUBMISSION_IN_PROGRESS'
              : 'STATE_CONFLICT',
            status: 409,
            message: activeClaim
              ? 'A weekly check-in submission is already in progress'
              : 'Weekly cycle changed concurrently',
          });
        }
      }
    }

    const materialized = await materializePairCycle({ pair: input.pair, cycleKey, now });
    return toCurrentWeeklyCycleDTO({
      pair: input.pair,
      currentUserId: input.currentUserId,
      cycle: materialized.cycle,
      snapshot: materialized.snapshot,
    });
  },
};
