import type { JsonValue } from '@/lib/api/response';
import type { PairQuestionnaireSessionType } from '@/models/PairQuestionnaireSession';
import { DomainError } from '@/domain/errors';

export type QuestionnaireRole = 'A' | 'B';

export type QuestionnaireTransitionContext = {
  currentUserId: string;
  role: QuestionnaireRole;
};

export type QuestionnaireSessionSnapshot = {
  status: PairQuestionnaireSessionType['status'];
  startedAt: Date;
  finishedAt?: Date;
};

export type QuestionnaireAction =
  | { type: 'START'; at: Date }
  | { type: 'ANSWER'; at: Date }
  | { type: 'COMPLETE'; at: Date };

export type QuestionnaireTransitionEvent = {
  type: string;
  payload?: JsonValue;
};

export type QuestionnaireTransitionResult = {
  next: {
    status: PairQuestionnaireSessionType['status'];
    startedAt: Date;
    finishedAt?: Date;
    meta?: {
      lastAnsweredAt?: string;
      lastAnsweredBy?: QuestionnaireRole;
    };
  };
  events: QuestionnaireTransitionEvent[];
};

const stateConflict = (
  session: QuestionnaireSessionSnapshot | null,
  action: QuestionnaireAction,
  context: QuestionnaireTransitionContext
): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Forbidden questionnaire transition',
    details: {
      status: session?.status ?? 'none',
      action: action.type,
      role: context.role,
      currentUserId: context.currentUserId,
    },
  });
};

export function questionnaireTransition(
  session: QuestionnaireSessionSnapshot | null,
  action: QuestionnaireAction,
  context: QuestionnaireTransitionContext
): QuestionnaireTransitionResult {
  switch (action.type) {
    case 'START': {
      if (!session) {
        return {
          next: {
            status: 'in_progress',
            startedAt: action.at,
          },
          events: [{ type: 'questionnaire.started' }],
        };
      }

      if (session.status === 'in_progress') {
        return {
          next: {
            status: 'in_progress',
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
          },
          events: [{ type: 'questionnaire.start_noop' }],
        };
      }

      stateConflict(session, action, context);
    }

    case 'ANSWER': {
      if (!session) {
        throw new DomainError({
          code: 'NOT_FOUND',
          status: 404,
          message: 'Questionnaire session not found',
          details: {
            action: action.type,
            currentUserId: context.currentUserId,
          },
        });
      }
      if (session.status !== 'in_progress') {
        stateConflict(session, action, context);
      }
      return {
        next: {
          status: 'in_progress',
          startedAt: session.startedAt,
          finishedAt: session.finishedAt,
          meta: {
            lastAnsweredAt: action.at.toISOString(),
            lastAnsweredBy: context.role,
          },
        },
        events: [{ type: 'questionnaire.answered' }],
      };
    }

    case 'COMPLETE': {
      if (!session) {
        throw new DomainError({
          code: 'NOT_FOUND',
          status: 404,
          message: 'Questionnaire session not found',
          details: {
            action: action.type,
            currentUserId: context.currentUserId,
          },
        });
      }
      if (session.status !== 'in_progress') {
        stateConflict(session, action, context);
      }
      return {
        next: {
          status: 'completed',
          startedAt: session.startedAt,
          finishedAt: action.at,
        },
        events: [{ type: 'questionnaire.completed' }],
      };
    }

    default: {
      const actionNever: never = action;
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Unsupported questionnaire action',
        details: { action: actionNever },
      });
    }
  }
}