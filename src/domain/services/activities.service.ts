import {
  applyEffects,
  buildActivityResultSummary,
  clamp,
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
  isSafetyFallbackTemplateId,
} from '@/domain/services/safetyGate.service';
import type {
  ActivityCompletedStatus,
} from '@/models/PairActivity';
import {
  activityTransition,
  type ActivityAnswerInput,
} from '@/domain/state/activityMachine';
import {
  toActivityResultSummaryDTO,
  type ActivityResultSummaryDTO,
} from '@/lib/dto/activity.dto';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';

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
    const data = await ensureActivityMember(input.activityId, input.currentUserId);
    const safetyVeto = await isPairSafetyVetoActive(String(data.pair._id));
    const templateId =
      typeof data.activity.stateMeta?.templateId === 'string'
        ? data.activity.stateMeta.templateId
        : undefined;
    if (
      safetyVeto &&
      !isSafetyFallbackTemplateId(templateId)
    ) {
      throw new DomainError({
        code: 'ACTIVITY_UNAVAILABLE',
        status: 409,
        message: 'Activity is unavailable',
      });
    }

    const now = new Date();
    await recommendationDecisionService.assertAcceptableForActivity(
      input.activityId,
      now
    );
    const transition = activityTransition(
      {
        status: data.activity.status,
        answers: data.activity.answers ?? [],
      },
      {
        type: 'ACCEPT',
        at: now,
      },
      {
        currentUserId: input.currentUserId,
        role: data.by,
      }
    );

    data.activity.status = transition.next.status;
    if (transition.next.acceptedAt) {
      data.activity.acceptedAt = transition.next.acceptedAt;
    }

    await data.activity.save();

    await recommendationDecisionService.markAcceptedForActivity(
      String(data.activity._id),
      transition.next.acceptedAt ?? now
    );

    await emitEvent({
      event: 'ACTIVITY_ACCEPTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/accept`,
        method: 'POST',
      },
      context: {
        pairId: String(data.pair._id),
        activityId: String(data.activity._id),
      },
      target: {
        type: 'activity',
        id: String(data.activity._id),
      },
      metadata: {
        activityId: String(data.activity._id),
        status: 'accepted',
      },
    });

    return {};
  },

  async cancelActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const data = await ensureActivityMember(input.activityId, input.currentUserId);
    const now = new Date();

    const transition = activityTransition(
      {
        status: data.activity.status,
        answers: data.activity.answers ?? [],
      },
      {
        type: 'CANCEL',
        at: now,
      },
      {
        currentUserId: input.currentUserId,
        role: data.by,
      }
    );

    data.activity.status = transition.next.status;
    await data.activity.save();

    await recommendationDecisionService.markSkippedForActivity(
      String(data.activity._id),
      now
    );

    await emitEvent({
      event: 'ACTIVITY_CANCELED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/cancel`,
        method: 'POST',
      },
      context: {
        pairId: String(data.pair._id),
        activityId: String(data.activity._id),
      },
      target: {
        type: 'activity',
        id: String(data.activity._id),
      },
      metadata: {
        activityId: String(data.activity._id),
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
    const data = await ensureActivityMember(input.activityId, input.currentUserId);
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

    const checkIns = effectiveActivityCheckIns(data.activity.checkIns);
    validateFeedback(checkIns, input.answers);
    if (!data.activity.checkIns.length) {
      data.activity.checkIns = checkIns;
    }

    const now = new Date();
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
    });
    if (updatesPreliminaryResult && data.activity.resultSummary) {
      result = refineActivityResultSummary({
        previous: data.activity.resultSummary,
        next: result,
      });
      data.activity.status = result.status;
      data.activity.resultSummary = result;
    }

    await data.activity.save();

    await emitEvent({
      event: 'ACTIVITY_CHECKED_IN',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/checkin`,
        method: 'POST',
      },
      context: {
        pairId: String(data.pair._id),
        activityId: String(data.activity._id),
      },
      target: {
        type: 'activity',
        id: String(data.activity._id),
      },
      metadata: {
        activityId: String(data.activity._id),
        answersCount: input.answers.length,
        success: clamp(score),
        status: updatesPreliminaryResult ? result.status : 'awaiting_checkin',
        submittedCount: result.submittedCount,
        bothSubmitted: result.bothSubmitted,
        resultVersion: result.resultVersion,
      },
    });

    return toActivityResultSummaryDTO(result);
  },

  async completeActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<ActivityCompletionResponse> {
    const data = await ensureActivityMember(input.activityId, input.currentUserId);
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
      return {
        status: resultSummary.status,
        resultSummary: toActivityResultSummaryDTO(resultSummary),
      };
    }

    if (!hasActivityFeedback(resultSummary)) {
      throw new DomainError({
        code: 'ACTIVITY_FEEDBACK_REQUIRED',
        status: 409,
        message: 'Activity feedback is required before completion',
      });
    }

    if (alreadyCompleted && resultSummary.effectApplied) {
      return {
        status: resultSummary.status,
        resultSummary: toActivityResultSummaryDTO(resultSummary),
      };
    }

    if (!alreadyCompleted) {
      const transition = activityTransition(
        {
          status: data.activity.status,
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
      data.activity.resultSummary = resultSummary;
      await data.activity.save();
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
        primaryReason: readStateMetaString(data.activity.stateMeta, 'primaryReason'),
      });
      resultSummary = {
        ...resultSummary,
        effectApplied: true,
        effect,
      };
      data.activity.resultSummary = resultSummary;
      await data.activity.save();
    }

    await emitEvent({
      event: 'ACTIVITY_COMPLETED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: `/api/activities/${input.activityId}/complete`,
        method: 'POST',
      },
      context: {
        pairId: String(data.pair._id),
        activityId: String(data.activity._id),
      },
      target: {
        type: 'activity',
        id: String(data.activity._id),
      },
      metadata: {
        activityId: String(data.activity._id),
        pairId: String(data.pair._id),
        success: clamp(resultSummary.successScore),
        status: resultSummary.status,
        submittedCount: resultSummary.submittedCount,
        bothSubmitted: resultSummary.bothSubmitted,
        effectApplied: resultSummary.effectApplied,
        fatigueDelta: resultSummary.effect.fatigueDelta,
        readinessDelta: resultSummary.effect.readinessDelta,
        resultVersion: resultSummary.resultVersion,
      },
    });

    return {
      status: resultSummary.status,
      resultSummary: toActivityResultSummaryDTO(resultSummary),
    };
  },
};
