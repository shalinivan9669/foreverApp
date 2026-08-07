import { DomainError } from '@/domain/errors';
import type {
  RecommendationDecisionStatus,
} from '@/models/RecommendationDecision';

export type RecommendationDecisionSnapshot = {
  status: RecommendationDecisionStatus;
  replacementDepth: 0 | 1;
};

export type RecommendationDecisionAction =
  | { type: 'ACCEPT'; at: Date }
  | { type: 'SKIP'; at: Date }
  | { type: 'REPLACE'; at: Date }
  | { type: 'EXPIRE'; at: Date };

export type RecommendationDecisionTransitionResult = {
  next: {
    status: RecommendationDecisionStatus;
    acceptedAt?: Date;
    skippedAt?: Date;
    replacedAt?: Date;
    expiredAt?: Date;
  };
  changed: boolean;
};

const unavailable = (): never => {
  throw new DomainError({
    code: 'RECOMMENDATION_UNAVAILABLE',
    status: 409,
    message: 'Recommendation is unavailable',
  });
};

export const recommendationDecisionTransition = (
  decision: RecommendationDecisionSnapshot,
  action: RecommendationDecisionAction
): RecommendationDecisionTransitionResult => {
  const target: RecommendationDecisionStatus =
    action.type === 'ACCEPT'
      ? 'ACCEPTED'
      : action.type === 'SKIP'
        ? 'SKIPPED'
        : action.type === 'REPLACE'
          ? 'REPLACED'
          : 'EXPIRED';

  if (decision.status === target) {
    return { next: { status: target }, changed: false };
  }

  if (action.type === 'EXPIRE' && decision.status !== 'OFFERED') {
    return { next: { status: decision.status }, changed: false };
  }

  if (decision.status !== 'OFFERED') unavailable();
  if (action.type === 'REPLACE' && decision.replacementDepth >= 1) {
    throw new DomainError({
      code: 'RECOMMENDATION_REPLACEMENT_UNAVAILABLE',
      status: 409,
      message: 'Recommendation replacement is unavailable',
    });
  }

  if (action.type === 'ACCEPT') {
    return {
      next: { status: target, acceptedAt: action.at },
      changed: true,
    };
  }
  if (action.type === 'SKIP') {
    return {
      next: { status: target, skippedAt: action.at },
      changed: true,
    };
  }
  if (action.type === 'REPLACE') {
    return {
      next: { status: target, replacedAt: action.at },
      changed: true,
    };
  }
  return {
    next: { status: target, expiredAt: action.at },
    changed: true,
  };
};
