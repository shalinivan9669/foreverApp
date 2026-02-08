import type { JsonValue } from '@/lib/api/response';
import type { PairType } from '@/models/Pair';
import { DomainError } from '@/domain/errors';

export type PairRole = 'A' | 'B';

export type PairTransitionContext = {
  currentUserId: string;
  role: PairRole;
};

export type PairSnapshot = {
  status: PairType['status'];
};

export type PairAction =
  | { type: 'CREATE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export type PairTransitionEvent = {
  type: string;
  payload?: JsonValue;
};

export type PairTransitionResult = {
  next: {
    status: PairType['status'];
  };
  events: PairTransitionEvent[];
};

const stateConflict = (
  pair: PairSnapshot | null,
  action: PairAction,
  context: PairTransitionContext
): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Forbidden pair transition',
    details: {
      status: pair?.status ?? 'none',
      action: action.type,
      role: context.role,
      currentUserId: context.currentUserId,
    },
  });
};

export function pairTransition(
  pair: PairSnapshot | null,
  action: PairAction,
  context: PairTransitionContext
): PairTransitionResult {
  switch (action.type) {
    case 'CREATE': {
      if (pair) {
        stateConflict(pair, action, context);
      }
      return {
        next: { status: 'active' },
        events: [{ type: 'pair.created' }],
      };
    }

    case 'PAUSE': {
      const current = pair;
      if (!current) {
        return stateConflict(current, action, context);
      }
      if (current.status === 'paused') {
        return {
          next: { status: 'paused' },
          events: [{ type: 'pair.pause_noop' }],
        };
      }
      if (current.status !== 'active') {
        stateConflict(current, action, context);
      }
      return {
        next: { status: 'paused' },
        events: [{ type: 'pair.paused' }],
      };
    }

    case 'RESUME': {
      const current = pair;
      if (!current) {
        return stateConflict(current, action, context);
      }
      if (current.status === 'active') {
        return {
          next: { status: 'active' },
          events: [{ type: 'pair.resume_noop' }],
        };
      }
      if (current.status !== 'paused') {
        stateConflict(current, action, context);
      }
      return {
        next: { status: 'active' },
        events: [{ type: 'pair.resumed' }],
      };
    }

    default: {
      const actionNever: never = action;
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Unsupported pair action',
        details: { action: actionNever },
      });
    }
  }
}
