import {
  applyEffects,
  buildActivityResultSummary,
  effectiveActivityCheckIns,
  hasActivityFeedback,
  refineActivityResultSummary,
  replaceActivityAnswers,
  shouldApplyActivityEffect,
  successScore,
} from '@/utils/activities';
import { requireActivityMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  isPairSafetyVetoActive,
} from '@/domain/services/safetyGate.service';
import type { ActivityCompletedStatus } from '@/models/PairActivity';
import { PairActivity } from '@/models/PairActivity';
import { Pair } from '@/models/Pair';
import mongoose, { type ClientSession } from 'mongoose';
import {
  activityTransition,
  type ActivityAnswerInput,
} from '@/domain/state/activityMachine';
import {
  toActivityResultSummaryDTO,
  type ActivityResultSummaryDTO,
} from '@/lib/dto/activity.dto';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import {
  isActivityAccessibleToRole,
  isActivityEligibleForSafetyState,
  isOfferedActivityEligibleForRole,
} from '@/domain/services/activityEligibility.service';
import { notificationService } from '@/domain/services/notification.service';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

const guardFailureToDomainError = async (response: Response): Promise<DomainError> => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null) as GuardErrorPayload | null;

  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensureActivityMember = async (activityId: string, currentUserId: string) => {
  const guard = await requireActivityMember(activityId, currentUserId);
  if (!guard.ok) {
    throw await guardFailureToDomainError(guard.response);
  }
  return guard.data;
};

const unavailable = (): never => {
  throw new DomainError({
    code: 'ACTIVITY_UNAVAILABLE',
    status: 409,
    message: 'Activity is unavailable',
  });
};

const assertActivityAccessible = (input: {
  activity: Parameters<typeof isActivityAccessibleToRole>[0];
  role: 'A' | 'B';
}): void => {
  if (!isActivityAccessibleToRole(input.activity, input.role)) unavailable();
};

const assertActivityAllowedBySafety = async (input: {
  activity: Parameters<typeof isActivityEligibleForSafetyState>[0];
  pairId: string;
}): Promise<void> => {
  const safetyVeto = await isPairSafetyVetoActive(input.pairId);
  if (!isActivityEligibleForSafetyState(input.activity, safetyVeto)) {
    unavailable();
  }
};

const reloadActivityContext = async (input: {
  activityId: string;
  pairId: string;
  currentUserId: string;
  session: ClientSession;
}) => {
  const activity = await PairActivity.findById(input.activityId).session(
    input.session
  );
  const pair = await Pair.findById(input.pairId).session(input.session);
  if (!activity || !pair || String(activity.pairId) !== String(pair._id)) {
    return unavailable();
  }
  const by: 'A' | 'B' | null =
    pair.members[0] === input.currentUserId
      ? 'A'
      : pair.members[1] === input.currentUserId
        ? 'B'
        : null;
  if (!by) return unavailable();
  assertActivityAccessible({ activity, role: by });
  return { activity, pair, by };
};

const COMPLETED_STATUSES: ActivityCompletedStatus[] = [
  'completed_success',
  'completed_partial',
  'failed',
];

const isCompletedStatus = (
  status: string
): status is ActivityCompletedStatus =>
  COMPLETED_STATUSES.includes(status as ActivityCompletedStatus);

const readStateMetaString = (
  stateMeta: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  const value = stateMeta?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const validateFeedback = (
  checkIns: ReturnType<typeof effectiveActivityCheckIns>,
  answers: ActivityAnswerInput[]
): void => {
  const expectedIds = new Set(checkIns.map((checkIn) => checkIn.id));
  const providedIds = new Set<string>();

  for (const answer of answers) {
    const checkIn = checkIns.find((item) => item.id === answer.checkInId);
    if (!checkIn || !expectedIds.has(answer.checkInId)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Unknown activity feedback question',
      });
    }
    if (providedIds.has(answer.checkInId)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Duplicate activity feedback answer',
      });
    }
    if (
      !Number.isInteger(answer.ui) ||
      answer.ui < 1 ||
      answer.ui > checkIn.map.length
    ) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Invalid activity feedback value',
      });
    }
    providedIds.add(answer.checkInId);
  }

  if (providedIds.size !== expectedIds.size) {
    throw new DomainError({
      code: 'ACTIVITY_FEEDBACK_INCOMPLETE',
      status: 400,
      message: 'Answer every activity feedback question',
    });
  }
};

type ActivityCompletionResponse = {
  status: ActivityCompletedStatus;
  resultSummary: ActivityResultSummaryDTO;
};

export const activitiesService = {
  async acceptActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const guarded = await ensureActivityMember(
      input.activityId,
      input.currentUserId
    );
    assertActivityAccessible({ activity: guarded.activity, role: guarded.by });
    const now = new Date();
    const outcome: {
      pairId?: string;
      activityId?: string;
      alreadyAccepted?: boolean;
    } = {};
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        outcome.pairId = undefined;
        outcome.activityId = undefined;
        outcome.alreadyAccepted = false;
        const data = await reloadActivityContext({
          activityId: input.activityId,
          pairId: String(guarded.pair._id),
          currentUserId: input.currentUserId,
          session,
        });
        if (data.pair.status !== 'active') return unavailable();
        const safetyVeto = await isPairSafetyVetoActive(String(data.pair._id));
        if (!isOfferedActivityEligibleForRole({
          activity: data.activity,
          role: data.by,
          safetyVeto,
        })) {
          return unavailable();
        }
        const transition = activityTransition(
          {
            status: data.activity.status,
            answers: data.activity.answers ?? [],
          },
          { type: 'ACCEPT', at: now },
          { currentUserId: input.currentUserId, role: data.by }
        );
        if (transition.events.some((event) => event.type === 'activity.accept_noop')) {
          await recommendationDecisionService.claimAcceptedForActivity(
            input.activityId,
            now,
            session
          );
          outcome.alreadyAccepted = true;
          return;
        }
        await Pair.updateOne(
          { _id: data.pair._id },
          { $set: { updatedAt: new Date() } },
          { session }
        );
        await recommendationDecisionService.claimAcceptedForActivity(
          input.activityId,
          now,
          session
        );
        data.activity.status = transition.next.status;
        if (transition.next.acceptedAt) {
          data.activity.acceptedAt = transition.next.acceptedAt;
        }
        await data.activity.save({ session });
        outcome.pairId = String(data.pair._id);
        outcome.activityId = String(data.activity._id);
      });
    } finally {
      await session.endSession();
    }
    if (outcome.alreadyAccepted) return {};
    if (!outcome.pairId || !outcome.activityId) return unavailable();

    await emitEvent({
      event: 'ACTIVITY_ACCEPTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/accept`,
        method: 'POST',
      },
      context: {
        pairId: outcome.pairId,
        activityId: outcome.activityId,
      },
      target: {
        type: 'activity',
        id: outcome.activityId,
      },
      metadata: {
        activityId: outcome.activityId,
        status: 'accepted',
      },
    });
    recordProductAnalyticsEvent({
      name: 'activity_accepted',
      technicalScope: 'activity',
    });

    return {};
  },

  async startActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const guarded = await ensureActivityMember(
      input.activityId,
      input.currentUserId
    );
    assertActivityAccessible({ activity: guarded.activity, role: guarded.by });
    await assertActivityAllowedBySafety({
      activity: guarded.activity,
      pairId: String(guarded.pair._id),
    });
    const outcome: {
      pairId?: string;
      activityId?: string;
      started?: boolean;
    } = {};
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        outcome.pairId = undefined;
        outcome.activityId = undefined;
        outcome.started = false;
        const data = await reloadActivityContext({
          activityId: input.activityId,
          pairId: String(guarded.pair._id),
          currentUserId: input.currentUserId,
          session,
        });
        if (data.pair.status !== 'active') return unavailable();
        await assertActivityAllowedBySafety({
          activity: data.activity,
          pairId: String(data.pair._id),
        });
        const transition = activityTransition(
          {
            status: data.activity.status,
            lifecycleVersion: data.activity.lifecycleVersion,
            startedAt: data.activity.startedAt,
            answers: data.activity.answers ?? [],
          },
          { type: 'START', at: new Date() },
          { currentUserId: input.currentUserId, role: data.by }
        );
        const started = transition.events.some(
          (event) => event.type === 'activity.started'
        );
        data.activity.status = transition.next.status;
        if (transition.next.startedAt && !data.activity.startedAt) {
          data.activity.startedAt = transition.next.startedAt;
        }
        await data.activity.save({ session });
        outcome.pairId = String(data.pair._id);
        outcome.activityId = String(data.activity._id);
        outcome.started = started;
      });
    } finally {
      await session.endSession();
    }
    if (!outcome.pairId || !outcome.activityId) return unavailable();
    if (outcome.started) {
      await emitEvent({
        event: 'ACTIVITY_STARTED',
        actor: { userId: input.currentUserId },
        request: input.auditRequest ?? {
          route: `/api/activities/${input.activityId}/start`,
          method: 'POST',
        },
        context: {
          pairId: outcome.pairId,
          activityId: outcome.activityId,
        },
        target: { type: 'activity', id: outcome.activityId },
        metadata: {
          activityId: outcome.activityId,
          status: 'in_progress',
        },
      });
    }
    return {};
  },

  async cancelActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const guarded = await ensureActivityMember(
      input.activityId,
      input.currentUserId
    );
    assertActivityAccessible({ activity: guarded.activity, role: guarded.by });
    const now = new Date();
    const outcome: { pairId?: string; activityId?: string } = {};
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        outcome.pairId = undefined;
        outcome.activityId = undefined;
        const data = await reloadActivityContext({
          activityId: input.activityId,
          pairId: String(guarded.pair._id),
          currentUserId: input.currentUserId,
          session,
        });
        const transition = activityTransition(
          {
            status: data.activity.status,
            answers: data.activity.answers ?? [],
          },
          { type: 'CANCEL', at: now },
          { currentUserId: input.currentUserId, role: data.by }
        );
        await recommendationDecisionService.claimSkippedForActivity({
          activityId: String(data.activity._id),
          activityStatus: data.activity.status,
          skippedAt: now,
          session,
        });
        data.activity.status = transition.next.status;
        await data.activity.save({ session });
        outcome.pairId = String(data.pair._id);
        outcome.activityId = String(data.activity._id);
      });
    } finally {
      await session.endSession();
    }
    if (!outcome.pairId || !outcome.activityId) return unavailable();

    await emitEvent({
      event: 'ACTIVITY_CANCELED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/cancel`,
        method: 'POST',
      },
      context: {
        pairId: outcome.pairId,
        activityId: outcome.activityId,
      },
      target: {
        type: 'activity',
        id: outcome.activityId,
      },
      metadata: {
        activityId: outcome.activityId,
        status: 'cancelled',
      },
    });

    return {};
  },

  async checkinActivity(input: {
    activityId: string;
    currentUserId: string;
    answers: ActivityAnswerInput[];
    auditRequest?: AuditRequestContext;
  }): Promise<ActivityResultSummaryDTO> {
    const guarded = await ensureActivityMember(
      input.activityId,
      input.currentUserId
    );
    assertActivityAccessible({ activity: guarded.activity, role: guarded.by });
    await assertActivityAllowedBySafety({
      activity: guarded.activity,
      pairId: String(guarded.pair._id),
    });
    const outcome: {
      result?: ActivityResultSummaryDTO;
      newFeedbackSubmission?: boolean;
      audit?: {
        pairId: string;
        activityId: string;
        status:
          | 'awaiting_feedback'
          | 'awaiting_checkin'
          | ActivityCompletedStatus;
        dataStatus: 'ENOUGH' | 'PARTIAL';
        resultVersion: 'activity-result-v1';
      };
    } = {};
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        outcome.result = undefined;
        outcome.audit = undefined;
        outcome.newFeedbackSubmission = undefined;
        const data = await reloadActivityContext({
          activityId: input.activityId,
          pairId: String(guarded.pair._id),
          currentUserId: input.currentUserId,
          session,
        });
        await assertActivityAllowedBySafety({
          activity: data.activity,
          pairId: String(data.pair._id),
        });
        if (data.pair.status === 'ended') {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Completed pairs cannot submit activity feedback',
          });
        }
        if (
          data.activity.status === 'completed_success' ||
          data.activity.status === 'failed'
        ) {
          throw new DomainError({
            code: 'ACTIVITY_RESULT_FINALIZED',
            status: 409,
            message: 'Activity feedback is already final',
          });
        }

        const checkIns = effectiveActivityCheckIns(
          data.activity.checkIns,
          data.activity.feedbackSchemaVersion
        );
        validateFeedback(checkIns, input.answers);
        if (!data.activity.checkIns.length) {
          data.activity.checkIns = checkIns;
        }

        const now = new Date();
        outcome.newFeedbackSubmission = !(data.activity.answers ?? []).some(
          (answer) => answer.by === data.by
        );
        const replacedAnswers = replaceActivityAnswers({
          existing: data.activity.answers ?? [],
          incoming: input.answers,
          role: data.by,
          at: now,
        });
        const updatesPreliminaryResult =
          data.activity.status === 'completed_partial' &&
          Boolean(data.activity.resultSummary);
        if (!updatesPreliminaryResult) {
          const transition = activityTransition(
            {
              status: data.activity.status,
              lifecycleVersion: data.activity.lifecycleVersion,
              startedAt: data.activity.startedAt,
              answers: data.activity.answers ?? [],
            },
            {
              type: 'CHECKIN',
              at: now,
              answers: input.answers,
            },
            {
              currentUserId: input.currentUserId,
              role: data.by,
            }
          );
          data.activity.status = transition.next.status;
        }
        data.activity.answers = replacedAnswers;

        const score = successScore(checkIns, data.activity.answers ?? []);
        data.activity.successScore = score;
        let result = buildActivityResultSummary({
          checkIns,
          answers: data.activity.answers ?? [],
          completedAt: data.activity.resultSummary?.completedAt,
          feedbackSchemaVersion: data.activity.feedbackSchemaVersion,
        });
        if (updatesPreliminaryResult && data.activity.resultSummary) {
          result = refineActivityResultSummary({
            previous: data.activity.resultSummary,
            next: result,
          });
          data.activity.status = result.status;
          data.activity.resultSummary = result;
        }

        await data.activity.save({ session });
        if (
          !result.bothSubmitted &&
          (data.activity.status === 'awaiting_feedback' ||
            data.activity.status === 'awaiting_checkin')
        ) {
          const peerId = data.pair.members[data.by === 'A' ? 1 : 0];
          await notificationService.create({
            userIds: [peerId],
            pairId: String(data.pair._id),
            type: 'FEEDBACK_REQUESTED',
            sourceKey: `activity:${String(data.activity._id)}`,
            now,
            session,
          });
        }
        outcome.result = toActivityResultSummaryDTO(result);
        outcome.audit = {
          pairId: String(data.pair._id),
          activityId: String(data.activity._id),
          status: updatesPreliminaryResult
            ? result.status
            : data.activity.status === 'awaiting_feedback'
              ? 'awaiting_feedback'
              : 'awaiting_checkin',
          dataStatus: result.bothSubmitted ? 'ENOUGH' : 'PARTIAL',
          resultVersion: result.resultVersion,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!outcome.result || !outcome.audit) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Activity feedback was not stored',
      });
    }

    await emitEvent({
      event: 'ACTIVITY_CHECKED_IN',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/checkin`,
        method: 'POST',
      },
      context: {
        pairId: outcome.audit.pairId,
        activityId: outcome.audit.activityId,
      },
      target: {
        type: 'activity',
        id: outcome.audit.activityId,
      },
      metadata: {
        activityId: outcome.audit.activityId,
        status: outcome.audit.status,
        dataStatus: outcome.audit.dataStatus,
        resultVersion: outcome.audit.resultVersion,
      },
    });
    if (outcome.newFeedbackSubmission) {
      recordProductAnalyticsEvent({
        name: 'feedback_submitted',
        technicalScope: 'activity',
      });
    }

    return outcome.result;
  },

  async completeActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<ActivityCompletionResponse> {
    const guarded = await ensureActivityMember(
      input.activityId,
      input.currentUserId
    );
    assertActivityAccessible({ activity: guarded.activity, role: guarded.by });
    await assertActivityAllowedBySafety({
      activity: guarded.activity,
      pairId: String(guarded.pair._id),
    });
    const outcome: {
      response?: ActivityCompletionResponse;
      audit?: {
        pairId: string;
        activityId: string;
        status: ActivityCompletedStatus;
        dataStatus: 'ENOUGH' | 'PARTIAL';
        effectApplied: boolean;
        resultVersion: 'activity-result-v1';
      };
    } = {};
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        outcome.response = undefined;
        outcome.audit = undefined;
        const data = await reloadActivityContext({
          activityId: input.activityId,
          pairId: String(guarded.pair._id),
          currentUserId: input.currentUserId,
          session,
        });
        await assertActivityAllowedBySafety({
          activity: data.activity,
          pairId: String(data.pair._id),
        });
        if (data.pair.status === 'ended') {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Completed pairs cannot complete activities',
          });
        }

        const now = new Date();
        const existingCompletedStatus = isCompletedStatus(data.activity.status)
          ? data.activity.status
          : undefined;
        const alreadyCompleted = Boolean(existingCompletedStatus);
        let resultSummary =
          data.activity.resultSummary ??
          buildActivityResultSummary({
            checkIns: data.activity.checkIns,
            answers: data.activity.answers ?? [],
            completedAt: now,
            feedbackSchemaVersion: data.activity.feedbackSchemaVersion,
          });

        if (alreadyCompleted && !data.activity.resultSummary) {
          resultSummary = {
            ...resultSummary,
            status: existingCompletedStatus ?? resultSummary.status,
            effectApplied: true,
            effectExplanation: {
              ru: 'Результат старой активности восстановлен без повторного применения эффекта.',
              en: 'The legacy activity result was restored without applying its effect again.',
            },
          };
          outcome.response = {
            status: resultSummary.status,
            resultSummary: toActivityResultSummaryDTO(resultSummary),
          };
          return;
        }

        if (!hasActivityFeedback(resultSummary)) {
          throw new DomainError({
            code: 'ACTIVITY_FEEDBACK_REQUIRED',
            status: 409,
            message: 'Activity feedback is required before completion',
          });
        }

        if (alreadyCompleted && resultSummary.effectApplied) {
          outcome.response = {
            status: resultSummary.status,
            resultSummary: toActivityResultSummaryDTO(resultSummary),
          };
          return;
        }

        if (!alreadyCompleted) {
          const transition = activityTransition(
            {
              status: data.activity.status,
              lifecycleVersion: data.activity.lifecycleVersion,
              startedAt: data.activity.startedAt,
              answers: data.activity.answers ?? [],
            },
            {
              type: 'COMPLETE',
              at: now,
              success: resultSummary.successScore,
              completedStatus: resultSummary.status,
            },
            {
              currentUserId: input.currentUserId,
              role: data.by,
            }
          );

          data.activity.status = transition.next.status;
          data.activity.successScore = transition.next.successScore;
        }

        if (shouldApplyActivityEffect(resultSummary)) {
          const effect = await applyEffects({
            pairDoc: data.pair,
            members: data.activity.members,
            effect: data.activity.effect ?? [],
            result: resultSummary,
            fatigueDelta: data.activity.fatigueDeltaOnComplete ?? 0,
            readinessDelta: data.activity.readinessDeltaOnComplete ?? 0,
            activityId: String(data.activity._id),
            templateId: readStateMetaString(data.activity.stateMeta, 'templateId'),
            primaryReason: readStateMetaString(
              data.activity.stateMeta,
              'primaryReason'
            ),
            session,
          });
          resultSummary = {
            ...resultSummary,
            effectApplied: true,
            effect,
          };
        }

        data.activity.resultSummary = resultSummary;
        await data.activity.save({ session });
        outcome.response = {
          status: resultSummary.status,
          resultSummary: toActivityResultSummaryDTO(resultSummary),
        };
        outcome.audit = {
          pairId: String(data.pair._id),
          activityId: String(data.activity._id),
          status: resultSummary.status,
          dataStatus: resultSummary.bothSubmitted ? 'ENOUGH' : 'PARTIAL',
          effectApplied: resultSummary.effectApplied,
          resultVersion: resultSummary.resultVersion,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!outcome.response) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Activity completion was not stored',
      });
    }

    if (outcome.audit) {
      await emitEvent({
        event: 'ACTIVITY_COMPLETED',
        actor: { userId: input.currentUserId },
        request: input.auditRequest ?? {
          route: `/api/activities/${input.activityId}/complete`,
          method: 'POST',
        },
        context: {
          pairId: outcome.audit.pairId,
          activityId: outcome.audit.activityId,
        },
        target: {
          type: 'activity',
          id: outcome.audit.activityId,
        },
        metadata: {
          activityId: outcome.audit.activityId,
          pairId: outcome.audit.pairId,
          status: outcome.audit.status,
          dataStatus: outcome.audit.dataStatus,
          effectApplied: outcome.audit.effectApplied,
          resultVersion: outcome.audit.resultVersion,
        },
      });
      recordProductAnalyticsEvent({
        name: 'activity_completed',
        technicalScope: 'activity',
      });
      recordOperationalEvent({
        name: 'activity_completed',
        routeGroup: 'activity',
        outcome: 'ok',
      });
    }

    return outcome.response;
  },
};
