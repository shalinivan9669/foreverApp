import { DomainError } from '@/domain/errors';
import type { PairInviteStatus } from '@/models/PairInvite';

export type PairInviteSnapshot = {
  creatorUserId: string;
  status: PairInviteStatus;
  acceptedByUserId?: string;
};

export type PairInviteAction =
  | { type: 'CANCEL' }
  | { type: 'REISSUE' }
  | { type: 'EXPIRE' }
  | { type: 'ACCEPT' };

export type PairInviteTransitionContext = {
  currentUserId: string;
  now: Date;
};

export type PairInviteTransitionResult = {
  next: {
    status: PairInviteStatus;
    acceptedByUserId?: string;
    acceptedAt?: Date;
  };
  reason:
    | 'INVITE_CANCELLED'
    | 'INVITE_CANCEL_NOOP'
    | 'INVITE_REISSUED'
    | 'INVITE_EXPIRED'
    | 'INVITE_EXPIRE_NOOP'
    | 'INVITE_ACCEPTED'
    | 'INVITE_ACCEPT_NOOP';
};

const unavailable = (): never => {
  throw new DomainError({
    code: 'PAIR_INVITE_UNAVAILABLE',
    status: 409,
    message: 'Pair invite is unavailable',
  });
};

const ownerConflict = (): never => {
  throw new DomainError({
    code: 'PAIR_INVITE_STATE_CONFLICT',
    status: 409,
    message: 'Pair invite cannot be changed in its current state',
  });
};

export function pairInviteTransition(
  invite: PairInviteSnapshot,
  action: PairInviteAction,
  context: PairInviteTransitionContext
): PairInviteTransitionResult {
  switch (action.type) {
    case 'CANCEL': {
      if (invite.creatorUserId !== context.currentUserId) unavailable();
      if (invite.status === 'CANCELLED') {
        return {
          next: { status: 'CANCELLED' },
          reason: 'INVITE_CANCEL_NOOP',
        };
      }
      if (invite.status !== 'ACTIVE') ownerConflict();
      return {
        next: { status: 'CANCELLED' },
        reason: 'INVITE_CANCELLED',
      };
    }

    case 'REISSUE': {
      if (invite.creatorUserId !== context.currentUserId) unavailable();
      if (invite.status === 'ACCEPTED') ownerConflict();
      return {
        next: {
          status: invite.status === 'ACTIVE' ? 'CANCELLED' : invite.status,
        },
        reason: 'INVITE_REISSUED',
      };
    }

    case 'EXPIRE': {
      if (invite.status !== 'ACTIVE') {
        return {
          next: {
            status: invite.status,
            acceptedByUserId: invite.acceptedByUserId,
          },
          reason: 'INVITE_EXPIRE_NOOP',
        };
      }
      return {
        next: { status: 'EXPIRED' },
        reason: 'INVITE_EXPIRED',
      };
    }

    case 'ACCEPT': {
      if (invite.creatorUserId === context.currentUserId) unavailable();
      if (invite.status === 'ACCEPTED') {
        if (invite.acceptedByUserId !== context.currentUserId) unavailable();
        return {
          next: {
            status: 'ACCEPTED',
            acceptedByUserId: invite.acceptedByUserId,
          },
          reason: 'INVITE_ACCEPT_NOOP',
        };
      }
      if (invite.status !== 'ACTIVE') unavailable();
      return {
        next: {
          status: 'ACCEPTED',
          acceptedByUserId: context.currentUserId,
          acceptedAt: context.now,
        },
        reason: 'INVITE_ACCEPTED',
      };
    }

    default: {
      const actionNever: never = action;
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: `Unsupported pair invite action: ${String(actionNever)}`,
      });
    }
  }
}
