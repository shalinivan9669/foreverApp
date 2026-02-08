import { successScore, applyEffects, clamp } from '@/utils/activities';
import { requireActivityMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  activityTransition,
  type ActivityAnswerInput,
} from '@/domain/state/activityMachine';

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

const determineCompletionStatus = (
  score: number
): 'completed_success' | 'completed_partial' | 'failed' => {
  if (score >= 0.7) return 'completed_success';
  if (score < 0.35) return 'failed';
  return 'completed_partial';
};

export const activitiesService = {
  async acceptActivity(input: {
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

    const transition = activityTransition(
      {
        status: data.activity.status,
        answers: data.activity.answers ?? [],
      },
      {
        type: 'CANCEL',
        at: new Date(),
      },
      {
        currentUserId: input.currentUserId,
        role: data.by,
      }
    );

    data.activity.status = transition.next.status;
    await data.activity.save();

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
  }): Promise<{ success: number }> {
    const data = await ensureActivityMember(input.activityId, input.currentUserId);

    const now = new Date();
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
    data.activity.answers = transition.next.answers ?? data.activity.answers;

    const score = successScore(data.activity.checkIns, data.activity.answers ?? []);
    data.activity.successScore = score;

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
        status: 'awaiting_checkin',
      },
    });

    return {
      success: score,
    };
  },

  async completeActivity(input: {
    activityId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<{ success: number; status: 'completed_success' | 'completed_partial' | 'failed' }> {
    const data = await ensureActivityMember(input.activityId, input.currentUserId);

    const score = successScore(data.activity.checkIns, data.activity.answers ?? []);
    const completedStatus = determineCompletionStatus(score);
    const now = new Date();

    const transition = activityTransition(
      {
        status: data.activity.status,
        answers: data.activity.answers ?? [],
      },
      {
        type: 'COMPLETE',
        at: now,
        success: score,
        completedStatus,
      },
      {
        currentUserId: input.currentUserId,
        role: data.by,
      }
    );

    data.activity.status = transition.next.status;
    data.activity.successScore = transition.next.successScore;

    await applyEffects({
      pairDoc: data.pair,
      members: data.activity.members,
      effect: data.activity.effect ?? [],
      success: score,
      fatigueDelta: data.activity.fatigueDeltaOnComplete ?? 0,
      readinessDelta: data.activity.readinessDeltaOnComplete ?? 0,
    });

    await data.activity.save();

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
        success: clamp(score),
        status: completedStatus,
      },
    });

    return {
      success: clamp(score),
      status: completedStatus,
    };
  },
};
