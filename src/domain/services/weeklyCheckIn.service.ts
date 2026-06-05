import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import { DomainError } from '@/domain/errors';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { Insight, type InsightType } from '@/models/Insight';
import { VectorSnapshot } from '@/models/VectorSnapshot';
import {
  WeeklyCheckIn,
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
  buildPairInsightCandidates,
  buildUserInsightCandidates,
  persistInsightCandidates,
  toInsightDTO,
  type InsightDTO,
} from '@/domain/services/insightRules.service';

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

export const currentWeekKey = (date = new Date()): string => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

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

export const buildPairWeeklyCheckInSummary = async (input: {
  pair: HydratedDocument<PairType>;
  currentUserId: string;
  weekKey?: string;
}): Promise<PairWeeklyCheckInSummaryDTO> => {
  const pairId = String(input.pair._id);
  const weekKey = input.weekKey?.trim() || currentWeekKey();
  const peerId =
    input.pair.members.find((memberId) => memberId !== input.currentUserId) ??
    input.pair.members[1];
  const [checkIns, peer] = await Promise.all([
    WeeklyCheckIn.find({
      pairId: { $in: pairIdVariants(pairId) },
      weekKey,
      userId: { $in: input.pair.members },
    })
      .sort({ updatedAt: -1 })
      .lean<PairWeeklyCheckInRow[]>(),
    User.findOne({ id: peerId })
      .select({ id: 1, username: 1, avatar: 1 })
      .lean<PairWeeklyMember | null>(),
  ]);

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

export const weeklyCheckInService = {
  async submit(input: WeeklyCheckInSubmitInput): Promise<WeeklyCheckInDTO> {
    await connectToDatabase();
    const answers = validateWeeklyAnswers(input.answers);
    const weekKey = input.weekKey?.trim() || currentWeekKey();
    const pairData = await resolvePair(input.pairId, input.currentUserId);
    if (pairData) assertPairAcceptsCheckIn(pairData.pair);

    const user = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const now = new Date();
    const pairId = pairData ? String(pairData.pair._id) : undefined;
    const psycheTarget = clamp01(answers.readiness * 0.55 + (1 - answers.fatigue) * 0.45);
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
            positives: answers.unresolvedTopic ? ['weekly_unresolved_topic'] : [],
            now,
          })
        : null;
    const preliminaryComputed: WeeklyCheckInType['computed'] = {
      userStateDelta: {
        psyche: psycheApplied.delta,
        ...(communicationApplied ? { communication: communicationApplied.delta } : {}),
      },
      generatedInsightIds: [],
    };

    const checkIn = await WeeklyCheckIn.findOneAndUpdate(
      pairId
        ? pairIdentityFilter({ userId: input.currentUserId, pairId, weekKey })
        : soloIdentityFilter({ userId: input.currentUserId, weekKey }),
      pairId
        ? {
            $set: {
              pairId,
              answers,
              computed: preliminaryComputed,
            },
          }
        : {
            $set: {
              answers,
              computed: preliminaryComputed,
            },
            $unset: { pairId: 1 },
          },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<StoredWeeklyCheckIn | null>();
    if (!checkIn) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Weekly check-in was not saved',
      });
    }

    const setPayload: Record<string, number | string | Date> = {
      ...stateSetPayload('psyche', psycheApplied, user),
      'fatigue.score': answers.fatigue,
      'fatigue.updatedAt': now,
      'readiness.score': answers.readiness,
      'readiness.updatedAt': now,
    };
    if (communicationApplied) {
      Object.assign(setPayload, stateSetPayload('communication', communicationApplied, user));
    }
    await User.updateOne({ id: input.currentUserId }, { $set: setPayload });

    const snapshots = [
      createAppliedVectorSnapshot({
        userId: input.currentUserId,
        pairId,
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
          pairId,
          axis: 'communication',
          layer: 'state',
          applied: communicationApplied,
          reason: { source: 'weekly_checkin' },
          createdAt: now,
        })
      );
    }
    await VectorSnapshot.insertMany(snapshots);

    let pairRiskDelta: number | undefined;
    let generatedInsightIds: string[] = [];
    let pairSummary: PairWeeklyCheckInSummaryDTO | null = null;
    let pairStateUpdated = false;

    if (pairData && pairId) {
      pairSummary = await buildPairWeeklyCheckInSummary({
        pair: pairData.pair,
        currentUserId: input.currentUserId,
        weekKey,
      });
      if (
        pairSummary.pair.readiness !== undefined &&
        pairSummary.pair.fatigue !== undefined
      ) {
        await Pair.updateOne(
          { _id: pairData.pair._id },
          {
            $set: {
              'readiness.score': pairSummary.pair.readiness,
              'readiness.updatedAt': now,
              'fatigue.score': pairSummary.pair.fatigue,
              'fatigue.updatedAt': now,
            },
          }
        );
        pairStateUpdated = true;
      }

      const [left, right] = await Promise.all([
        User.findOne({ id: pairData.pair.members[0] }).lean<UserType | null>(),
        User.findOne({ id: pairData.pair.members[1] }).lean<UserType | null>(),
      ]);
      const insightCandidates = buildUserInsightCandidates({
        user: { ...user, fatigue: { score: answers.fatigue, updatedAt: now } } as UserType,
        activePair: {
          fatigue: {
            score: pairSummary.pair.fatigue ?? answers.fatigue,
            updatedAt: now,
          },
        },
      });

      if (left && right) {
        const diagnostics = await buildPairAnswerDiagnostics({ pairId, left, right });
        pairRiskDelta = diagnostics.pairAnswerSignals.filter(
          (signal) => signal.status === 'risk'
        ).length;
        await Pair.updateOne(
          { _id: pairData.pair._id },
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
          }
        );
        insightCandidates.unshift(
          ...buildPairInsightCandidates({
            pairId,
            members: [pairData.pair.members[0], pairData.pair.members[1]],
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

      const created = await persistInsightCandidates(insightCandidates);
      generatedInsightIds = created.map((insight) => String(insight._id));
    } else {
      const created = await persistInsightCandidates(
        buildUserInsightCandidates({
          user: { ...user, fatigue: { score: answers.fatigue, updatedAt: now } } as UserType,
          activePair: { fatigue: { score: answers.fatigue, updatedAt: now } },
        })
      );
      generatedInsightIds = created.map((insight) => String(insight._id));
    }

    const computed: WeeklyCheckInType['computed'] = {
      userStateDelta: preliminaryComputed.userStateDelta,
      ...(pairRiskDelta !== undefined ? { pairRiskDelta } : {}),
      generatedInsightIds,
    };
    const updatedCheckIn = await WeeklyCheckIn.findByIdAndUpdate(
      checkIn._id,
      { $set: { computed } },
      { new: true }
    ).lean<StoredWeeklyCheckIn | null>();

    await emitEvent({
      event: 'WEEKLY_CHECKIN_SUBMITTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/checkins/weekly', method: 'POST' },
      context: pairId ? { pairId } : undefined,
      target: { type: 'user', id: input.currentUserId },
      metadata: {
        ...(pairId ? { pairId } : {}),
        weekKey,
        snapshotCount: snapshots.length,
        generatedInsightCount: generatedInsightIds.length,
        traitMutationApplied: false,
        ...(pairSummary
          ? {
              submittedCount: pairSummary.pair.submittedCount,
              bothSubmitted: pairSummary.pair.bothSubmitted,
            }
          : {}),
        pairStateUpdated,
      },
    });

    const visibleInsights = generatedInsightIds.length > 0
      ? (await Promise.all(
          generatedInsightIds.map(async (id) => {
            const doc = await Insight.findById(id).lean<
              (InsightType & { _id: Types.ObjectId }) | null
            >();
            return doc ? toInsightDTO(doc) : null;
          })
        )).filter((item): item is InsightDTO => item !== null)
      : [];

    return toDTO({
      checkIn: updatedCheckIn ?? { ...checkIn, computed },
      readiness: { score: answers.readiness, updatedAt: now },
      fatigue: { score: answers.fatigue, updatedAt: now },
      insights: visibleInsights,
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
