import { randomUUID } from 'crypto';
import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
} from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import { DomainError } from '@/domain/errors';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { Insight, type InsightType } from '@/models/Insight';
import { VectorSnapshot } from '@/models/VectorSnapshot';
import {
  WeeklyCheckIn,
  WEEKLY_CHECK_IN_FINALIZATION_VERSION,
  type WeeklyCheckInAnswers,
  type WeeklyCheckInType,
} from '@/models/WeeklyCheckIn';
import type { Axis } from '@/domain/vectors';
import {
  applyVectorDelta,
  createAppliedVectorSnapshot,
  readAxisLayer,
  recalculateDisplayedVector,
  type AppliedVectorDelta,
} from '@/domain/services/vectorScoring.service';
import { buildPairAnswerDiagnostics } from '@/domain/services/pairAnswerScoring.service';
import {
  weeklyCycleKeyForDate,
  weeklyCycleService,
} from '@/domain/services/weeklyCycle.service';
import { cycleEntitlementService } from '@/domain/services/cycleEntitlement.service';
import {
  buildPairInsightCandidates,
  buildUserInsightCandidates,
  persistInsightCandidates,
  toInsightDTO,
  type InsightDTO,
} from '@/domain/services/insightRules.service';
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
  pairId?: string;
  weekKey: string;
  answers: WeeklyCheckInAnswers;
  computed: WeeklyCheckInType['computed'];
  readiness: { score: number; updatedAt: Date };
  fatigue: { score: number; updatedAt: Date };
  insights: InsightDTO[];
  createdAt: Date;
  updatedAt: Date;
};

type PairWeeklyCheckInParticipantDTO = {
  userId: string;
  submitted: boolean;
  checkInId?: string;
  readiness?: number;
  fatigue?: number;
  closeness?: number;
  irritation?: number;
  unresolvedTopic?: boolean;
  updatedAt?: string;
};

export type PairWeeklyCheckInSummaryDTO = {
  pairId: string;
  weekKey: string;
  currentUser: PairWeeklyCheckInParticipantDTO;
  peer: PairWeeklyCheckInParticipantDTO & {
    username?: string;
    avatar?: string;
    avatarUrl?: string | null;
  };
  pair: {
    submittedCount: number;
    bothSubmitted: boolean;
    readiness?: number;
    fatigue?: number;
    closeness?: number;
    irritation?: number;
    unresolvedTopicCount: number;
    hasDivergence: boolean;
    divergence?: {
      readiness?: number;
      fatigue?: number;
      closeness?: number;
      irritation?: number;
    };
    status: 'missing' | 'partial' | 'complete' | 'divergent';
  };
};

export type WeeklyCheckInReliabilityTestHooks = {
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

type PairWeeklyCheckInRow = Pick<
  StoredWeeklyCheckIn,
  '_id' | 'userId' | 'answers' | 'updatedAt'
>;

type PairWeeklyMember = Pick<UserType, 'id' | 'username' | 'avatar'>;

type DuplicateKeyError = { code: number };

const isDuplicateKeyError = (error: object): error is DuplicateKeyError => {
  if (!('code' in error)) return false;
  return (error as { code: number }).code === 11000;
};

export const WEEKLY_CHECK_IN_DIVERGENCE_THRESHOLD = 0.3;

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
  if (pair.status === 'ended') {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Weekly check-in is unavailable for an ended pair',
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

const soloIdentityFilter = (input: { userId: string; weekKey: string }) => ({
  userId: input.userId,
  weekKey: input.weekKey,
  $or: [{ pairId: { $exists: false } }, { pairId: null }],
});

const average = (values: number[]): number | undefined =>
  values.length > 0
    ? clamp01(values.reduce((sum, value) => sum + value, 0) / values.length)
    : undefined;

const participantDTO = (
  userId: string,
  row: PairWeeklyCheckInRow | undefined
): PairWeeklyCheckInParticipantDTO => {
  if (!row) return { userId, submitted: false };
  return {
    userId,
    submitted: true,
    checkInId: String(row._id),
    readiness: row.answers.readiness,
    fatigue: row.answers.fatigue,
    closeness: row.answers.closeness,
    irritation: row.answers.irritation,
    unresolvedTopic: row.answers.unresolvedTopic,
    updatedAt: row.updatedAt.toISOString(),
  };
};

export const summarizePairWeeklyCheckIns = (input: {
  pairId: string;
  weekKey: string;
  currentUserId: string;
  members: [string, string];
  checkIns: PairWeeklyCheckInRow[];
  peer?: PairWeeklyMember | null;
}): PairWeeklyCheckInSummaryDTO => {
  const latestByUser = new Map<string, PairWeeklyCheckInRow>();
  for (const row of input.checkIns) {
    const existing = latestByUser.get(row.userId);
    if (!existing || existing.updatedAt.getTime() < row.updatedAt.getTime()) {
      latestByUser.set(row.userId, row);
    }
  }

  const rows = input.members
    .map((memberId) => latestByUser.get(memberId))
    .filter((row): row is PairWeeklyCheckInRow => Boolean(row));
  const currentRow = latestByUser.get(input.currentUserId);
  const peerId =
    input.members.find((memberId) => memberId !== input.currentUserId) ??
    input.members[1];
  const peerRow = latestByUser.get(peerId);
  const submittedCount = rows.length;
  const bothSubmitted = submittedCount === input.members.length;
  const readiness = average(rows.map((row) => row.answers.readiness));
  const fatigue = average(rows.map((row) => row.answers.fatigue));
  const closeness = average(rows.map((row) => row.answers.closeness));
  const irritation = average(rows.map((row) => row.answers.irritation));
  const unresolvedTopicCount = rows.filter((row) => row.answers.unresolvedTopic).length;
  const divergence = bothSubmitted && rows.length === 2
    ? {
        readiness: Math.abs(rows[0].answers.readiness - rows[1].answers.readiness),
        fatigue: Math.abs(rows[0].answers.fatigue - rows[1].answers.fatigue),
        closeness: Math.abs(rows[0].answers.closeness - rows[1].answers.closeness),
        irritation: Math.abs(rows[0].answers.irritation - rows[1].answers.irritation),
      }
    : undefined;
  const hasDivergence = Boolean(
    divergence &&
      Object.values(divergence).some(
        (value) => value >= WEEKLY_CHECK_IN_DIVERGENCE_THRESHOLD
      )
  );
  const status =
    submittedCount === 0
      ? 'missing'
      : !bothSubmitted
        ? 'partial'
        : hasDivergence
          ? 'divergent'
          : 'complete';

  return {
    pairId: input.pairId,
    weekKey: input.weekKey,
    currentUser: participantDTO(input.currentUserId, currentRow),
    peer: {
      ...participantDTO(peerId, peerRow),
      ...(input.peer
        ? {
            username: input.peer.username,
            avatar: input.peer.avatar,
            avatarUrl: toDiscordAvatarUrl(input.peer.id, input.peer.avatar),
          }
        : {}),
    },
    pair: {
      submittedCount,
      bothSubmitted,
      ...(readiness !== undefined ? { readiness } : {}),
      ...(fatigue !== undefined ? { fatigue } : {}),
      ...(closeness !== undefined ? { closeness } : {}),
      ...(irritation !== undefined ? { irritation } : {}),
      unresolvedTopicCount,
      hasDivergence,
      ...(divergence ? { divergence } : {}),
      status,
    },
  };
};

const qualitativeSignal = (input: {
  key: PairWeeklyCheckInSignalKey;
  value: number;
  divergence?: number;
}): PairWeeklyCheckInPairDTO['pair']['signals'][number] => {
  const status: PairWeeklyCheckInSignalStatus =
    typeof input.divergence === 'number' &&
    input.divergence >= WEEKLY_CHECK_IN_DIVERGENCE_THRESHOLD
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

  return {
    key: input.key,
    status,
    dataStatus: 'ENOUGH',
    reasonCode,
    nextStepHint,
  };
};

export const toPairWeeklyCheckInPairDTO = (
  summary: PairWeeklyCheckInSummaryDTO
): PairWeeklyCheckInPairDTO => {
  const metricsReady = [
    summary.pair.readiness,
    summary.pair.fatigue,
    summary.pair.closeness,
    summary.pair.irritation,
  ].every((value) => typeof value === 'number' && Number.isFinite(value));
  const dataStatus: PairWeeklyCheckInDataStatus =
    !summary.currentUser.submitted && !summary.peer.submitted
      ? 'NOT_READY'
      : !summary.pair.bothSubmitted
        ? 'PARTIAL'
        : metricsReady
          ? 'ENOUGH'
          : 'INSUFFICIENT';
  const signals =
    dataStatus === 'ENOUGH'
      ? [
          qualitativeSignal({
            key: 'connection',
            value: summary.pair.closeness ?? 0,
            divergence: summary.pair.divergence?.closeness,
          }),
          qualitativeSignal({
            key: 'tension',
            value: summary.pair.irritation ?? 0,
            divergence: summary.pair.divergence?.irritation,
          }),
          qualitativeSignal({
            key: 'recovery',
            value: 1 - (summary.pair.fatigue ?? 1),
            divergence: summary.pair.divergence?.fatigue,
          }),
          qualitativeSignal({
            key: 'resource',
            value: summary.pair.readiness ?? 0,
            divergence: summary.pair.divergence?.readiness,
          }),
        ]
      : [];
  const reasonCodes: PairWeeklyCheckInPairDTO['pair']['reasonCodes'] =
    dataStatus === 'NOT_READY'
      ? ['WAITING_FOR_RESPONSES']
      : dataStatus === 'PARTIAL'
        ? ['WAITING_FOR_PEER']
        : dataStatus === 'ENOUGH'
          ? ['PAIR_SIGNALS_READY']
          : ['PAIR_DATA_INSUFFICIENT'];

  return {
    pairId: summary.pairId,
    weekKey: summary.weekKey,
    currentUser: { submitted: summary.currentUser.submitted },
    peer: {
      submitted: summary.peer.submitted,
      ...(summary.peer.username ? { username: summary.peer.username } : {}),
      ...(summary.peer.avatar ? { avatar: summary.peer.avatar } : {}),
      ...(summary.peer.avatarUrl !== undefined
        ? { avatarUrl: summary.peer.avatarUrl }
        : {}),
    },
    pair: {
      bothSubmitted: summary.pair.bothSubmitted,
      dataStatus,
      reasonCodes,
      signals,
    },
  };
};

export const buildPairWeeklyCheckInSummary = async (input: {
  pair: HydratedDocument<PairType>;
  currentUserId: string;
  weekKey?: string;
  mongoSession?: ClientSession;
}): Promise<PairWeeklyCheckInSummaryDTO> => {
  const pairId = String(input.pair._id);
  const weekKey = input.weekKey?.trim() || currentWeekKey();
  const peerId =
    input.pair.members.find((memberId) => memberId !== input.currentUserId) ??
    input.pair.members[1];
  const checkInsQuery = WeeklyCheckIn.find({
    pairId: { $in: pairIdVariants(pairId) },
    weekKey,
    userId: { $in: input.pair.members },
  }).sort({ updatedAt: -1 });
  const peerQuery = User.findOne({ id: peerId }).select({
    id: 1,
    username: 1,
    avatar: 1,
  });
  if (input.mongoSession) {
    checkInsQuery.session(input.mongoSession);
    peerQuery.session(input.mongoSession);
  }
  const checkIns = await checkInsQuery.lean<PairWeeklyCheckInRow[]>();
  const peer = await peerQuery.lean<PairWeeklyMember | null>();

  return summarizePairWeeklyCheckIns({
    pairId,
    weekKey,
    currentUserId: input.currentUserId,
    members: [input.pair.members[0], input.pair.members[1]],
    checkIns,
    peer,
  });
};

const vectorTarget = (axis: Axis, level: number, facets: string[]) => ({
  axis,
  target01: clamp01(level),
  evidenceCount: 1,
  questionConfidence: 1,
  positives: facets,
  negatives: [],
});

const applyState = (input: {
  user: UserType;
  axis: Axis;
  target01: number;
  positives: string[];
  now: Date;
}): AppliedVectorDelta => {
  const current = readAxisLayer(input.user, input.axis, 'state');
  return applyVectorDelta({
    current,
    target: vectorTarget(input.axis, input.target01, input.positives),
    layer: 'state',
    now: input.now,
  });
};

const stateSetPayload = (
  axis: Axis,
  applied: AppliedVectorDelta,
  user: UserType
): Record<string, number | string | Date> => {
  const trait = readAxisLayer(user, axis, 'trait');
  const displayed = recalculateDisplayedVector(trait, applied.after);
  return {
    [`vectors.${axis}.state.level`]: applied.after.level,
    [`vectors.${axis}.state.confidence`]: applied.after.confidence,
    [`vectors.${axis}.state.evidenceCount`]: applied.after.evidenceCount,
    [`vectors.${axis}.state.scoringVersion`]: applied.after.scoringVersion,
    [`vectors.${axis}.state.updatedAt`]: applied.after.updatedAt ?? new Date(),
    [`vectors.${axis}.displayed.level`]: displayed.level,
    [`vectors.${axis}.displayed.confidence`]: displayed.confidence,
    [`vectors.${axis}.displayed.source`]: displayed.source,
    [`vectors.${axis}.displayed.updatedAt`]: displayed.updatedAt ?? applied.after.updatedAt ?? new Date(),
  };
};

const toDTO = (input: {
  checkIn: StoredWeeklyCheckIn;
  readiness: { score: number; updatedAt: Date };
  fatigue: { score: number; updatedAt: Date };
  insights: InsightDTO[];
}): WeeklyCheckInDTO => ({
  id: String(input.checkIn._id),
  userId: input.checkIn.userId,
  pairId: input.checkIn.pairId ? String(input.checkIn.pairId) : undefined,
  weekKey: input.checkIn.weekKey,
  answers: input.checkIn.answers,
  computed: input.checkIn.computed,
  readiness: input.readiness,
  fatigue: input.fatigue,
  insights: input.insights,
  createdAt: input.checkIn.createdAt,
  updatedAt: input.checkIn.updatedAt,
});

const visibleInsightsForIds = async (ids: string[]): Promise<InsightDTO[]> =>
  (
    await Promise.all(
      ids.map(async (id) => {
        const doc = await Insight.findById(id).lean<
          (InsightType & { _id: Types.ObjectId }) | null
        >();
        return doc ? toInsightDTO(doc) : null;
      })
    )
  ).filter((item): item is InsightDTO => item !== null);

const toStoredWeeklyCheckInDTO = async (
  checkIn: StoredWeeklyCheckIn
): Promise<WeeklyCheckInDTO> =>
  toDTO({
    checkIn,
    readiness: {
      score: checkIn.answers.readiness,
      updatedAt: checkIn.updatedAt,
    },
    fatigue: {
      score: checkIn.answers.fatigue,
      updatedAt: checkIn.updatedAt,
    },
    insights: await visibleInsightsForIds(checkIn.computed.generatedInsightIds),
  });

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
    return { kind: 'completed', checkIn: current };
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
  pairId?: string;
  weekKey: string;
  leaseOwner: string;
}): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const checkIn = await WeeklyCheckIn.findOne({
        _id: input.checkInId,
        'finalization.version': WEEKLY_CHECK_IN_FINALIZATION_VERSION,
        'finalization.state': 'processing',
        'finalization.leaseOwner': input.leaseOwner,
      })
        .session(session)
        .lean<StoredWeeklyCheckIn | null>();
      if (!checkIn) {
        throw new DomainError({
          code: 'IDEMPOTENCY_IN_PROGRESS',
          status: 503,
          message: 'Weekly check-in finalization lease was lost',
        });
      }

      const user = await User.findOne({ id: input.currentUserId })
        .session(session)
        .lean<UserType | null>();
      if (!user) {
        throw new DomainError({
          code: 'NOT_FOUND',
          status: 404,
          message: 'User not found',
        });
      }

      const now = new Date();
      const answers = checkIn.answers;
      const psycheTarget = clamp01(
        answers.readiness * 0.55 + (1 - answers.fatigue) * 0.45
      );
      const communicationTarget = clamp01(
        1 - Math.max(answers.irritation, answers.unresolvedTopic ? 0.8 : 0)
      );
      const psycheApplied = applyState({
        user,
        axis: 'psyche',
        target01: psycheTarget,
        positives: answers.fatigue < 0.35 ? ['weekly_recovered'] : [],
        now,
      });
      const communicationApplied =
        answers.irritation >= 0.6 || answers.unresolvedTopic
          ? applyState({
              user,
              axis: 'communication',
              target01: communicationTarget,
              positives: answers.unresolvedTopic
                ? ['weekly_unresolved_topic']
                : [],
              now,
            })
          : null;

      const setPayload: Record<string, number | string | Date> = {
        ...stateSetPayload('psyche', psycheApplied, user),
        'fatigue.score': answers.fatigue,
        'fatigue.updatedAt': now,
        'readiness.score': answers.readiness,
        'readiness.updatedAt': now,
      };
      if (communicationApplied) {
        Object.assign(
          setPayload,
          stateSetPayload('communication', communicationApplied, user)
        );
      }
      await User.updateOne(
        { id: input.currentUserId },
        { $set: setPayload },
        { session }
      );

      const snapshots = [
        createAppliedVectorSnapshot({
          userId: input.currentUserId,
          pairId: input.pairId,
          axis: 'psyche',
          layer: 'state',
          applied: psycheApplied,
          reason: { source: 'weekly_checkin' },
          createdAt: now,
        }),
      ];
      if (communicationApplied) {
        snapshots.push(
          createAppliedVectorSnapshot({
            userId: input.currentUserId,
            pairId: input.pairId,
            axis: 'communication',
            layer: 'state',
            applied: communicationApplied,
            reason: { source: 'weekly_checkin' },
            createdAt: now,
          })
        );
      }
      await VectorSnapshot.insertMany(snapshots, { session });

      let pairRiskDelta: number | undefined;
      let generatedInsightIds: string[] = [];
      if (input.pairId) {
        const pair = await Pair.findById(input.pairId).session(session);
        if (!pair) {
          throw new DomainError({
            code: 'NOT_FOUND',
            status: 404,
            message: 'pair not found',
          });
        }
        const pairSummary = await buildPairWeeklyCheckInSummary({
          pair,
          currentUserId: input.currentUserId,
          weekKey: input.weekKey,
          mongoSession: session,
        });
        if (
          pairSummary.pair.bothSubmitted &&
          pairSummary.pair.readiness !== undefined &&
          pairSummary.pair.fatigue !== undefined
        ) {
          await Pair.updateOne(
            { _id: pair._id },
            {
              $set: {
                'readiness.score': pairSummary.pair.readiness,
                'readiness.updatedAt': now,
                'fatigue.score': pairSummary.pair.fatigue,
                'fatigue.updatedAt': now,
              },
            },
            { session }
          );
        }

        const left = await User.findOne({ id: pair.members[0] })
          .session(session)
          .lean<UserType | null>();
        const right = await User.findOne({ id: pair.members[1] })
          .session(session)
          .lean<UserType | null>();
        const insightCandidates = buildUserInsightCandidates({
          user: {
            ...user,
            fatigue: { score: answers.fatigue, updatedAt: now },
          } as UserType,
          activePair: {
            fatigue: {
              score: pairSummary.pair.fatigue ?? answers.fatigue,
              updatedAt: now,
            },
          },
        });

        if (left && right) {
          const diagnostics = await buildPairAnswerDiagnostics({
            pairId: input.pairId,
            left,
            right,
            mongoSession: session,
          });
          pairRiskDelta = diagnostics.pairAnswerSignals.filter(
            (signal) => signal.status === 'risk'
          ).length;
          await Pair.updateOne(
            { _id: pair._id },
            {
              $set: {
                'passport.strongSides': diagnostics.passport.strongSides,
                'passport.riskZones': diagnostics.passport.riskZones,
                'passport.complementMap': diagnostics.passport.complementMap,
                'passport.levelDelta': diagnostics.passport.levelDelta,
                'passport.lastDiagnosticsAt': now,
                'passport.axes': diagnostics.axes,
                'passport.pairAnswerSignals': diagnostics.pairAnswerSignals,
                'passport.overall': diagnostics.overall,
              },
            },
            { session }
          );
          insightCandidates.unshift(
            ...buildPairInsightCandidates({
              pairId: input.pairId,
              members: [pair.members[0], pair.members[1]],
              left,
              right,
              fatigue: {
                score: pairSummary.pair.fatigue ?? answers.fatigue,
                updatedAt: now,
              },
              readiness: {
                score: pairSummary.pair.readiness ?? answers.readiness,
                updatedAt: now,
              },
              weekly: {
                fatigue: pairSummary.pair.fatigue,
                closeness: pairSummary.pair.closeness,
              },
            })
          );
        }

        const created = await persistInsightCandidates(
          insightCandidates,
          now,
          session
        );
        generatedInsightIds = created.map((insight) => String(insight._id));
      } else {
        const created = await persistInsightCandidates(
          buildUserInsightCandidates({
            user: {
              ...user,
              fatigue: { score: answers.fatigue, updatedAt: now },
            } as UserType,
            activePair: {
              fatigue: { score: answers.fatigue, updatedAt: now },
            },
          }),
          now,
          session
        );
        generatedInsightIds = created.map((insight) => String(insight._id));
      }

      const computed: WeeklyCheckInType['computed'] = {
        userStateDelta: {
          psyche: psycheApplied.delta,
          ...(communicationApplied
            ? { communication: communicationApplied.delta }
            : {}),
        },
        ...(pairRiskDelta !== undefined ? { pairRiskDelta } : {}),
        generatedInsightIds,
      };
      const marked = await WeeklyCheckIn.updateOne(
        {
          _id: checkIn._id,
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
        },
        { session }
      );
      if (marked.modifiedCount !== 1) {
        throw new DomainError({
          code: 'IDEMPOTENCY_IN_PROGRESS',
          status: 503,
          message: 'Weekly check-in finalization lease was lost',
        });
      }
    });
  } catch (error) {
    const current = await WeeklyCheckIn.findById(input.checkInId)
      .select({ finalization: 1 })
      .lean<Pick<StoredWeeklyCheckIn, 'finalization'> | null>();
    if (
      current?.finalization?.state === 'effects_applied' &&
      current.finalization.leaseOwner === input.leaseOwner
    ) {
      return;
    }
    throw error;
  } finally {
    await session.endSession();
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
  pairData: PairGuardData | null;
  hooks: WeeklyCheckInReliabilityTestHooks;
  auditRequest?: AuditRequestContext;
}): Promise<WeeklyCheckInDTO> => {
  const claim = await claimWeeklyCheckInFinalization(input.checkIn._id);
  if (claim.kind === 'legacy') {
    if (input.pairData) {
      await weeklyCycleService.syncAfterCheckIn({
        pair: input.pairData.pair,
        cycleKey: claim.checkIn.weekKey,
      });
    }
    return toStoredWeeklyCheckInDTO(claim.checkIn);
  }
  if (claim.kind === 'completed') {
    return toStoredWeeklyCheckInDTO(claim.checkIn);
  }

  const pairId = input.pairData ? String(input.pairData.pair._id) : undefined;
  await runWeeklyCheckInFinalization({
    phase: claim.phase,
    applyEffects: () =>
      applyWeeklyCheckInEffects({
        checkInId: claim.checkIn._id,
        currentUserId: input.currentUserId,
        pairId,
        weekKey: claim.checkIn.weekKey,
        leaseOwner: claim.leaseOwner,
      }),
    syncMaterializedCycle: async () => {
      if (!input.pairData) return;
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

  const pairSummary = input.pairData
    ? await buildPairWeeklyCheckInSummary({
        pair: input.pairData.pair,
        currentUserId: input.currentUserId,
        weekKey: finalized.weekKey,
      })
    : null;
  await emitEvent({
    event: 'WEEKLY_CHECKIN_SUBMITTED',
    actor: { userId: input.currentUserId },
    request: input.auditRequest ?? {
      route: '/api/checkins/weekly',
      method: 'POST',
    },
    context: pairId ? { pairId } : undefined,
    target: { type: 'user', id: input.currentUserId },
    metadata: {
      ...(pairId ? { pairId } : {}),
      weekKey: finalized.weekKey,
      snapshotCount:
        finalized.answers.irritation >= 0.6 ||
        finalized.answers.unresolvedTopic
          ? 2
          : 1,
      generatedInsightCount: finalized.computed.generatedInsightIds.length,
      traitMutationApplied: false,
      ...(pairSummary
        ? {
            submittedCount: pairSummary.pair.submittedCount,
            bothSubmitted: pairSummary.pair.bothSubmitted,
          }
        : {}),
      pairStateUpdated: pairSummary?.pair.bothSubmitted ?? false,
    },
  });
  recordProductAnalyticsEvent({
    name: 'checkin_submitted',
    technicalScope: 'weekly_cycle',
  });
  return toDTO({
    checkIn: finalized,
    readiness: {
      score: finalized.answers.readiness,
      updatedAt: finalized.updatedAt,
    },
    fatigue: {
      score: finalized.answers.fatigue,
      updatedAt: finalized.updatedAt,
    },
    insights: await visibleInsightsForIds(
      finalized.computed.generatedInsightIds
    ),
  });
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
    if (pairData) assertPairAcceptsCheckIn(pairData.pair);

    const userExists = await User.exists({ id: input.currentUserId });
    if (!userExists) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const pairId = pairData ? String(pairData.pair._id) : undefined;
    const identityFilter = pairId
      ? pairIdentityFilter({ userId: input.currentUserId, pairId, weekKey })
      : soloIdentityFilter({ userId: input.currentUserId, weekKey });
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

    if (pairData) {
      await cycleEntitlementService.assertCanOpen({
        pairId: String(pairData.pair._id),
        currentUserId: input.currentUserId,
        cycleKey: weekKey,
      });
    }

    const now = new Date();
    const preliminaryComputed: WeeklyCheckInType['computed'] = {
      userStateDelta: {},
      generatedInsightIds: [],
    };

    let checkIn: StoredWeeklyCheckIn;
    let submissionClaimToken: string | undefined;
    if (pairData) {
      const claim = await weeklyCycleService.claimSubmission({
        pair: pairData.pair,
        currentUserId: input.currentUserId,
        cycleKey: weekKey,
        now,
      });
      submissionClaimToken = claim.token;
    }
    try {
      if (pairData && submissionClaimToken) {
        checkIn = await weeklyCycleService.commitClaimedSubmission({
          pair: pairData.pair,
          currentUserId: input.currentUserId,
          cycleKey: weekKey,
          token: submissionClaimToken,
          answers,
          computed: preliminaryComputed,
        });
      } else {
        const created = await WeeklyCheckIn.create({
          userId: input.currentUserId,
          weekKey,
          answers,
          computed: preliminaryComputed,
        });
        checkIn = created.toObject<StoredWeeklyCheckIn>();
      }
    } catch (error) {
      if (error instanceof Error && isDuplicateKeyError(error as object)) {
        const concurrent = await WeeklyCheckIn.findOne(identityFilter).lean<
          StoredWeeklyCheckIn | null
        >();
        if (concurrent) {
          if (pairData && submissionClaimToken) {
            await weeklyCycleService.releaseSubmissionClaim({
              pair: pairData.pair,
              currentUserId: input.currentUserId,
              cycleKey: weekKey,
              token: submissionClaimToken,
            });
          }
          return reconcileWeeklyCheckIn({
            checkIn: concurrent,
            currentUserId: input.currentUserId,
            pairData,
            hooks,
            auditRequest: input.auditRequest,
          });
        }
      }
      if (pairData && submissionClaimToken) {
        await weeklyCycleService.releaseSubmissionClaim({
          pair: pairData.pair,
          currentUserId: input.currentUserId,
          cycleKey: weekKey,
          token: submissionClaimToken,
        });
      }
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
    const weekKey = input.weekKey?.trim() || currentWeekKey();
    const pairId = pairData ? String(pairData.pair._id) : undefined;
    const checkIn = await WeeklyCheckIn.findOne(
      pairId
        ? pairIdentityFilter({ userId: input.currentUserId, pairId, weekKey })
        : soloIdentityFilter({ userId: input.currentUserId, weekKey })
    )
      .sort({ updatedAt: -1 })
      .lean<StoredWeeklyCheckIn | null>();
    if (!checkIn) return null;
    const user = await User.findOne({ id: input.currentUserId }).lean<
      (UserType & {
        readiness?: { score: number; updatedAt: Date };
        fatigue?: { score: number; updatedAt: Date };
      }) | null
    >();
    return toDTO({
      checkIn,
      readiness: user?.readiness ?? {
        score: checkIn.answers.readiness,
        updatedAt: checkIn.updatedAt,
      },
      fatigue: user?.fatigue ?? {
        score: checkIn.answers.fatigue,
        updatedAt: checkIn.updatedAt,
      },
      insights: [],
    });
  },

  async pairCurrent(input: {
    currentUserId: string;
    pairId: string;
    weekKey?: string;
  }): Promise<PairWeeklyCheckInSummaryDTO> {
    await connectToDatabase();
    const pairData = await resolvePair(input.pairId, input.currentUserId);
    if (!pairData) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'pair not found',
      });
    }
    return buildPairWeeklyCheckInSummary({
      pair: pairData.pair,
      currentUserId: input.currentUserId,
      weekKey: input.weekKey,
    });
  },
};
