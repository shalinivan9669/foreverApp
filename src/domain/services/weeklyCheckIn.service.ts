import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { DomainError } from '@/domain/errors';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { Insight, type InsightType } from '@/models/Insight';
import { VectorSnapshot } from '@/models/VectorSnapshot';
import { WeeklyCheckIn, type WeeklyCheckInAnswers, type WeeklyCheckInType } from '@/models/WeeklyCheckIn';
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

type PairGuardData = {
  pair: HydratedDocument<PairType>;
  by: 'A' | 'B';
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
  checkIn: WeeklyCheckInType & { _id: Types.ObjectId };
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
    const user = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const now = new Date();
    const psycheTarget = clamp01(answers.readiness * 0.55 + (1 - answers.fatigue) * 0.45);
    const communicationTarget = clamp01(1 - Math.max(answers.irritation, answers.unresolvedTopic ? 0.8 : 0));
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
    await VectorSnapshot.insertMany(snapshots);

    let pairRiskDelta: number | undefined;
    let generatedInsightIds: string[] = [];
    if (pairData) {
      const pairId = String(pairData.pair._id);
      const pairReadiness = clamp01(
        ((pairData.pair.readiness?.score ?? answers.readiness) + answers.readiness) / 2
      );
      const pairFatigue = clamp01(
        ((pairData.pair.fatigue?.score ?? answers.fatigue) + answers.fatigue) / 2
      );
      await Pair.updateOne(
        { _id: pairData.pair._id },
        {
          $set: {
            'readiness.score': pairReadiness,
            'readiness.updatedAt': now,
            'fatigue.score': pairFatigue,
            'fatigue.updatedAt': now,
          },
        }
      );

      const [left, right] = await Promise.all([
        User.findOne({ id: pairData.pair.members[0] }).lean<UserType | null>(),
        User.findOne({ id: pairData.pair.members[1] }).lean<UserType | null>(),
      ]);
      if (left && right) {
        const diagnostics = await buildPairAnswerDiagnostics({ pairId, left, right });
        pairRiskDelta = diagnostics.pairAnswerSignals.filter((signal) => signal.status === 'risk').length;
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
        const created = await persistInsightCandidates([
          ...buildPairInsightCandidates({
            pairId,
            members: [pairData.pair.members[0], pairData.pair.members[1]],
            left,
            right,
            fatigue: { score: pairFatigue, updatedAt: now },
            readiness: { score: pairReadiness, updatedAt: now },
            weekly: { fatigue: answers.fatigue, closeness: answers.closeness },
          }),
          ...buildUserInsightCandidates({
            user: { ...user, fatigue: { score: answers.fatigue, updatedAt: now } } as UserType,
            activePair: { fatigue: { score: pairFatigue, updatedAt: now } },
          }),
        ]);
        generatedInsightIds = created.map((insight) => String(insight._id));
      }
    } else {
      const created = await persistInsightCandidates(
        buildUserInsightCandidates({
          user: { ...user, fatigue: { score: answers.fatigue, updatedAt: now } } as UserType,
          activePair: { fatigue: { score: answers.fatigue, updatedAt: now } },
        })
      );
      generatedInsightIds = created.map((insight) => String(insight._id));
    }

    const computed = {
      userStateDelta: {
        psyche: psycheApplied.delta,
        ...(communicationApplied ? { communication: communicationApplied.delta } : {}),
      },
      ...(pairRiskDelta !== undefined ? { pairRiskDelta } : {}),
      generatedInsightIds,
    };

    const checkIn = await WeeklyCheckIn.findOneAndUpdate(
      { userId: input.currentUserId, weekKey },
      {
        $set: {
          pairId: input.pairId,
          answers,
          computed,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<(WeeklyCheckInType & { _id: Types.ObjectId }) | null>();

    await emitEvent({
      event: 'WEEKLY_CHECKIN_SUBMITTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/checkins/weekly', method: 'POST' },
      context: input.pairId ? { pairId: input.pairId } : undefined,
      target: { type: 'user', id: input.currentUserId },
      metadata: {
        pairId: input.pairId,
        weekKey,
        snapshotCount: snapshots.length,
        generatedInsightCount: generatedInsightIds.length,
        traitMutationApplied: false,
      },
    });

    const visibleInsights = generatedInsightIds.length > 0
      ? (await Promise.all(
          generatedInsightIds.map(async (id) => {
            const doc = await Insight.findById(id).lean<(InsightType & { _id: Types.ObjectId }) | null>();
            return doc ? toInsightDTO(doc) : null;
          })
        )).filter((item): item is InsightDTO => item !== null)
      : [];

    return toDTO({
      checkIn: checkIn as WeeklyCheckInType & { _id: Types.ObjectId },
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
    await resolvePair(input.pairId, input.currentUserId);
    const weekKey = input.weekKey?.trim() || currentWeekKey();
    const checkIn = await WeeklyCheckIn.findOne({
      userId: input.currentUserId,
      weekKey,
    }).lean<(WeeklyCheckInType & { _id: Types.ObjectId }) | null>();
    if (!checkIn) return null;
    const user = await User.findOne({ id: input.currentUserId }).lean<(UserType & {
      readiness?: { score: number; updatedAt: Date };
      fatigue?: { score: number; updatedAt: Date };
    }) | null>();
    return toDTO({
      checkIn,
      readiness: user?.readiness ?? { score: checkIn.answers.readiness, updatedAt: checkIn.updatedAt },
      fatigue: user?.fatigue ?? { score: checkIn.answers.fatigue, updatedAt: checkIn.updatedAt },
      insights: [],
    });
  },
};
