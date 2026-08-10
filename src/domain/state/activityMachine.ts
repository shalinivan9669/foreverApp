import type { JsonValue } from '@/lib/api/response';
import type { PairActivityType } from '@/models/PairActivity';
import { DomainError } from '@/domain/errors';

export type ActivityRole = 'A' | 'B';

export type ActivityTransitionContext = {
  currentUserId: string;
  role: ActivityRole;
};

export type ActivityAnswerInput = {
  checkInId: string;
  ui: number;
};

export type ActivitySnapshot = {
  status: PairActivityType['status'];
  lifecycleVersion?: PairActivityType['lifecycleVersion'];
  startedAt?: Date;
  answers: NonNullable<PairActivityType['answers']>;
};

export type ActivityAction =
  | { type: 'ACCEPT'; at: Date }
  | { type: 'START'; at: Date }
  | { type: 'CANCEL'; at: Date }
  | { type: 'CHECKIN'; at: Date; answers: ActivityAnswerInput[] }
  | {
      type: 'COMPLETE';
      at: Date;
      success: number;
      completedStatus: 'completed_success' | 'completed_partial' | 'failed';
    };

export type ActivityTransitionEvent = {
  type: string;
  payload?: JsonValue;
};

export type ActivityTransitionResult = {
  next: {
    status: PairActivityType['status'];
    acceptedAt?: Date;
    startedAt?: Date;
    answers?: NonNullable<PairActivityType['answers']>;
    successScore?: number;
  };
  events: ActivityTransitionEvent[];
};

const stateConflict = (
  activity: ActivitySnapshot,
  action: ActivityAction,
  context: ActivityTransitionContext
): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Forbidden activity transition',
    details: {
      status: activity.status,
      action: action.type,
      role: context.role,
      currentUserId: context.currentUserId,
    },
  });
};

export function activityTransition(
  activity: ActivitySnapshot,
  action: ActivityAction,
  context: ActivityTransitionContext
): ActivityTransitionResult {
  switch (action.type) {
    case 'ACCEPT': {
      if (activity.status === 'accepted') {
        return {
          next: {
            status: 'accepted',
            acceptedAt: action.at,
          },
          events: [{ type: 'activity.accept_noop' }],
        };
      }
      if (activity.status !== 'offered') {
        stateConflict(activity, action, context);
      }
      return {
        next: {
          status: 'accepted',
          acceptedAt: action.at,
        },
        events: [{ type: 'activity.accepted' }],
      };
    }

    case 'START': {
      if (
        activity.status === 'in_progress' ||
        activity.status === 'awaiting_feedback' ||
        activity.status === 'awaiting_checkin'
      ) {
        return {
          next: {
            status: activity.status,
            startedAt: activity.startedAt ?? action.at,
            answers: activity.answers,
          },
          events: [{ type: 'activity.start_noop' }],
        };
      }
      if (activity.status !== 'accepted') {
        stateConflict(activity, action, context);
      }
      return {
        next: {
          status: 'in_progress',
          startedAt: action.at,
          answers: activity.answers,
        },
        events: [{ type: 'activity.started' }],
      };
    }

    case 'CANCEL': {
      if (activity.status === 'cancelled') {
        return {
          next: {
            status: 'cancelled',
            answers: activity.answers,
          },
          events: [{ type: 'activity.cancel_noop' }],
        };
      }
      if (
        activity.status !== 'offered' &&
        activity.status !== 'accepted' &&
        activity.status !== 'in_progress' &&
        activity.status !== 'awaiting_feedback' &&
        activity.status !== 'awaiting_checkin'
      ) {
        stateConflict(activity, action, context);
      }
      return {
        next: {
          status: 'cancelled',
          answers: activity.answers,
        },
        events: [{ type: 'activity.cancelled' }],
      };
    }

    case 'CHECKIN': {
      const isLegacyLifecycle =
        activity.lifecycleVersion !== 'activity-lifecycle-v2';
      if (
        !(isLegacyLifecycle && activity.status === 'accepted') &&
        activity.status !== 'in_progress' &&
        activity.status !== 'awaiting_feedback' &&
        activity.status !== 'awaiting_checkin'
      ) {
        stateConflict(activity, action, context);
      }

      const appendedAnswers: NonNullable<PairActivityType['answers']> = [
        ...activity.answers,
        ...action.answers.map((answer) => ({
          checkInId: answer.checkInId,
          by: context.role,
          ui: answer.ui,
          at: action.at,
        })),
      ];

      return {
        next: {
          status: isLegacyLifecycle
            ? 'awaiting_checkin'
            : 'awaiting_feedback',
          answers: appendedAnswers,
        },
        events: [{ type: 'activity.checkin_submitted' }],
      };
    }

    case 'COMPLETE': {
      const isLegacyLifecycle =
        activity.lifecycleVersion !== 'activity-lifecycle-v2';
      if (
        !(isLegacyLifecycle && activity.status === 'accepted') &&
        !(isLegacyLifecycle && activity.status === 'in_progress') &&
        activity.status !== 'awaiting_feedback' &&
        activity.status !== 'awaiting_checkin'
      ) {
        stateConflict(activity, action, context);
      }
      return {
        next: {
          status: action.completedStatus,
          answers: activity.answers,
          successScore: action.success,
        },
        events: [{
          type: 'activity.completed',
          payload: {
            status: action.completedStatus,
            success: action.success,
          },
        }],
      };
    }

    default: {
      const actionNever: never = action;
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Unsupported activity action',
        details: { action: actionNever },
      });
    }
  }
}
