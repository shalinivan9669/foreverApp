import type { JsonValue } from '@/lib/api/response';
import type { Decision, LikeStatus, LikeType, RecipientResponse } from '@/models/Like';
import { DomainError } from '@/domain/errors';

export type MatchRole = 'from' | 'to';

export type MatchTransitionContext = {
  currentUserId: string;
  role: MatchRole;
};

export type MatchStatus = LikeStatus | 'draft';

export type MatchSnapshot = {
  fromId: string;
  toId: string;
  status: MatchStatus;
  recipientResponse?: RecipientResponse;
  initiatorDecision?: Decision;
  recipientDecision?: Decision;
};

export type MatchAction =
  | { type: 'CREATE' }
  | { type: 'RESPOND'; response: RecipientResponse }
  | { type: 'ACCEPT'; at: Date }
  | { type: 'REJECT'; at: Date }
  | { type: 'CONFIRM' };

export type MatchTransitionEvent = {
  type: string;
  payload?: JsonValue;
};

export type MatchTransitionResult = {
  next: {
    status: LikeType['status'];
    recipientResponse?: RecipientResponse;
    initiatorDecision?: Decision;
    recipientDecision?: Decision;
    updatedAt?: Date;
  };
  events: MatchTransitionEvent[];
};

const stateConflict = (
  like: MatchSnapshot,
  action: MatchAction,
  context: MatchTransitionContext
): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Forbidden like transition',
    details: {
      status: like.status,
      action: action.type,
      role: context.role,
      currentUserId: context.currentUserId,
    },
  });
};

const accessDenied = (context: MatchTransitionContext, expectedRole: MatchRole): never => {
  throw new DomainError({
    code: 'ACCESS_DENIED',
    status: 403,
    message: 'Action is not allowed for current role',
    details: {
      currentRole: context.role,
      expectedRole,
      currentUserId: context.currentUserId,
    },
  });
};

export function matchTransition(
  like: MatchSnapshot,
  action: MatchAction,
  context: MatchTransitionContext
): MatchTransitionResult {
  switch (action.type) {
    case 'CREATE': {
      if (context.role !== 'from') {
        accessDenied(context, 'from');
      }
      if (like.status !== 'draft') {
        stateConflict(like, action, context);
      }
      return {
        next: { status: 'sent' },
        events: [{ type: 'like.created' }],
      };
    }

    case 'RESPOND': {
      if (context.role !== 'to') {
        accessDenied(context, 'to');
      }
      if (like.status !== 'sent' && like.status !== 'viewed') {
        stateConflict(like, action, context);
      }
      return {
        next: {
          status: 'awaiting_initiator',
          recipientResponse: action.response,
          updatedAt: action.response.at,
        },
        events: [{ type: 'like.responded' }],
      };
    }

    case 'ACCEPT': {
      if (context.role !== 'from') {
        accessDenied(context, 'from');
      }
      if (like.status !== 'awaiting_initiator' || !like.recipientResponse) {
        stateConflict(like, action, context);
      }
      return {
        next: {
          status: 'mutual_ready',
          initiatorDecision: { accepted: true, at: action.at },
          updatedAt: action.at,
        },
        events: [{ type: 'like.accepted_by_initiator' }],
      };
    }

    case 'REJECT': {
      if (context.role !== 'to') {
        accessDenied(context, 'to');
      }
      if (like.status === 'rejected') {
        return {
          next: {
            status: 'rejected',
            recipientDecision: like.recipientDecision,
            updatedAt: action.at,
          },
          events: [{ type: 'like.reject_noop' }],
        };
      }
      if (like.status !== 'sent' && like.status !== 'viewed') {
        stateConflict(like, action, context);
      }
      return {
        next: {
          status: 'rejected',
          recipientDecision: { accepted: false, at: action.at },
          updatedAt: action.at,
        },
        events: [{ type: 'like.rejected' }],
      };
    }

    case 'CONFIRM': {
      if (context.role !== 'from') {
        accessDenied(context, 'from');
      }
      if (like.status !== 'mutual_ready' || !like.recipientResponse) {
        stateConflict(like, action, context);
      }
      return {
        next: {
          status: 'paired',
          updatedAt: new Date(),
        },
        events: [{ type: 'like.confirmed' }],
      };
    }

    default: {
      const actionNever: never = action;
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Unsupported match action',
        details: { action: actionNever },
      });
    }
  }
}