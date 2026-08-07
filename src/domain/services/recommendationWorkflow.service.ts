import { DomainError } from '@/domain/errors';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { activitiesService } from '@/domain/services/activities.service';
import { activityOfferService } from '@/domain/services/activityOffer.service';
import {
  recommendationDecisionService,
  type RecommendationDecisionDTO,
} from '@/domain/services/recommendationDecision.service';

const unavailable = (): never => {
  throw new DomainError({
    code: 'RECOMMENDATION_UNAVAILABLE',
    status: 409,
    message: 'Recommendation is unavailable',
  });
};

const createOrReuseOffer = async (input: {
  pairId: string;
  currentUserId: string;
  previousDecisionId?: string;
  excludeActivityId?: string;
  excludeTemplateId?: string;
  auditRequest?: AuditRequestContext;
}): Promise<RecommendationDecisionDTO> => {
  let activityId = await recommendationDecisionService.findEligibleOfferedActivity({
    pairId: input.pairId,
    currentUserId: input.currentUserId,
    excludeActivityId: input.excludeActivityId,
    excludeTemplateId: input.excludeTemplateId,
  });

  if (!activityId) {
    const offers = await activityOfferService.suggestActivities({
      pairId: input.pairId,
      currentUserId: input.currentUserId,
      dedupeAgainstLastOffered: true,
      count: 1,
      source: 'pairs.activities.suggest',
      auditRequest: input.auditRequest,
    });
    activityId = offers[0]?.id ?? null;
  }
  if (!activityId) return unavailable();

  return recommendationDecisionService.openForActivity({
    pairId: input.pairId,
    activityId,
    currentUserId: input.currentUserId,
    previousDecisionId: input.previousDecisionId,
  });
};

export const recommendationWorkflowService = {
  async offer(input: {
    pairId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<RecommendationDecisionDTO> {
    const current = await recommendationDecisionService.getCurrent(input);
    if (current) return current;
    return createOrReuseOffer(input);
  },

  async accept(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<RecommendationDecisionDTO> {
    const decision = await recommendationDecisionService.getById(input);
    if (decision.status === 'ACCEPTED') return decision;
    if (!decision.canAccept) return unavailable();

    await activitiesService.acceptActivity({
      activityId: decision.activity.id,
      currentUserId: input.currentUserId,
      auditRequest: input.auditRequest,
    });
    await recommendationDecisionService.markAcceptedForActivity(
      decision.activity.id,
      new Date()
    );
    return recommendationDecisionService.getById(input);
  },

  async skip(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<RecommendationDecisionDTO> {
    return recommendationDecisionService.skip(input);
  },

  async replace(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<RecommendationDecisionDTO> {
    const prepared = await recommendationDecisionService.prepareReplacement(input);
    if (prepared.kind === 'existing') return prepared.decision;

    try {
      return await createOrReuseOffer({
        pairId: input.pairId,
        currentUserId: input.currentUserId,
        previousDecisionId: prepared.decisionId,
        excludeActivityId: prepared.activityId,
        excludeTemplateId: prepared.templateId,
        auditRequest: input.auditRequest,
      });
    } catch (error) {
      await recommendationDecisionService.rollbackReplacement(input);
      throw error;
    }
  },
};
