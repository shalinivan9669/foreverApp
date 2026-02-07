import { successScore, applyEffects, clamp } from '@/utils/activities';
import { requireActivityMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
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
    return {};
  },

  async cancelActivity(input: {
    activityId: string;
    currentUserId: string;
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

    return {};
  },

  async checkinActivity(input: {
    activityId: string;
    currentUserId: string;
    answers: ActivityAnswerInput[];
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

    return {
      success: score,
    };
  },

  async completeActivity(input: {
    activityId: string;
    currentUserId: string;
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

    return {
      success: clamp(score),
      status: completedStatus,
    };
  },
};