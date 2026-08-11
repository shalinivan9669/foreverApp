import { DomainError } from '@/domain/errors';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { activitiesService } from '@/domain/services/activities.service';
import {
  activityOfferService,
  type PairActivitySuggestionResult,
} from '@/domain/services/activityOffer.service';
import {
  recommendationDecisionService,
  type RecommendationDecisionDTO,
} from '@/domain/services/recommendationDecision.service';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { Types } from 'mongoose';
import {
  toActivityOfferDTO,
  toPairActivityDTO,
  type ActivityOfferDTO,
  type PairActivityDTO,
} from '@/lib/dto';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';
import { isSafetyFallbackTemplateId } from '@/domain/services/safetyGate.service';
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
  successorDecisionId?: string;
  excludeActivityId?: string;
  excludeTemplateId?: string;
  auditRequest?: AuditRequestContext;
}): Promise<RecommendationDecisionDTO> => {
  const recommendationContext =
    await recommendationDecisionService.requireCurrentPublishableSummary({
      pairId: input.pairId,
      currentUserId: input.currentUserId,
    });
  let activityId = await recommendationDecisionService.findEligibleOfferedActivity({
    pairId: input.pairId,
    currentUserId: input.currentUserId,
    snapshotId: String(recommendationContext.snapshotId),
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
      recommendationContext,
      auditRequest: input.auditRequest,
    });
    activityId = offers[0]?.id ?? null;
    if (!activityId) {
      activityId =
        await recommendationDecisionService.findEligibleOfferedActivity({
          pairId: input.pairId,
          currentUserId: input.currentUserId,
          snapshotId: String(recommendationContext.snapshotId),
          excludeActivityId: input.excludeActivityId,
          excludeTemplateId: input.excludeTemplateId,
        });
    }
  }
  if (!activityId) return unavailable();

  const decision = await recommendationDecisionService.openForActivity({
    pairId: input.pairId,
    activityId,
    currentUserId: input.currentUserId,
    previousDecisionId: input.previousDecisionId,
    successorDecisionId: input.successorDecisionId,
    recommendationContext,
  });
  if (decision.activity.id !== activityId) {
    await PairActivity.updateOne(
      { _id: activityId, pairId: input.pairId, status: 'offered' },
      { $set: { status: 'cancelled' } }
    );
  }
  return decision;
};

type WorkflowInput = {
  pairId: string;
  currentUserId: string;
  auditRequest?: AuditRequestContext;
};

type RecommendationReplacementReliabilityTestHooks = {
  afterReplacementPrepared?: () => Promise<void>;
};

type RecommendationFromTemplateReliabilityTestHooks = {
  afterActivityPrepared?: () => Promise<void>;
};

type CanonicalOfferProjection = {
  decision: RecommendationDecisionDTO;
  activity: PairActivityDTO;
  offer: ActivityOfferDTO;
  createdDecision: boolean;
};

type StoredActivity = PairActivityType & { _id: Types.ObjectId };

type OfferDecisionResult = {
  decision: RecommendationDecisionDTO;
  createdDecision: boolean;
};

const offerFlights = new Map<string, Promise<OfferDecisionResult>>();
const offerVisibilityFlights = new Map<
  string,
  Promise<RecommendationDecisionDTO | null>
>();

const loadVisibleCurrentOffer = (
  input: WorkflowInput
): Promise<RecommendationDecisionDTO | null> => {
  const flightKey = `${input.pairId}:${input.currentUserId}`;
  const existingFlight = offerVisibilityFlights.get(flightKey);
  if (existingFlight) return existingFlight;

  // The canonical offer flight has already reconciled ACTION_AVAILABLE before
  // followers are released. Followers need only their owner-specific projection.
  const flight = recommendationDecisionService.getCurrent(input, {
    reconcileActionNotification: false,
  });
  offerVisibilityFlights.set(flightKey, flight);
  const clearFlight = () => {
    if (offerVisibilityFlights.get(flightKey) === flight) {
      offerVisibilityFlights.delete(flightKey);
    }
  };
  void flight.then(clearFlight, clearFlight);
  return flight;
};

const createOfferWithConcurrentRecovery = async (
  input: WorkflowInput
): Promise<RecommendationDecisionDTO> => {
  try {
    return await createOrReuseOffer(input);
  } catch (error) {
    if (
      !(error instanceof DomainError) ||
      error.code !== 'RECOMMENDATION_UNAVAILABLE'
    ) {
      throw error;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const concurrent = await recommendationDecisionService.getCurrent(input);
      if (concurrent) return concurrent;
      if (attempt < 2) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 10 * (attempt + 1))
        );
      }
    }
    throw error;
  }
};

const resolveOfferDecision = async (
  input: WorkflowInput
): Promise<OfferDecisionResult> => {
  const current = await recommendationDecisionService.getCurrent(input);
  if (current) return { decision: current, createdDecision: false };

  return {
    decision: await createOfferWithConcurrentRecovery(input),
    createdDecision: true,
  };
};

const offerDecision = async (
  input: WorkflowInput
): Promise<OfferDecisionResult> => {
  const flightKey = input.pairId;
  let flight = offerFlights.get(flightKey);
  const createdFlight = !flight;
  if (!flight) {
    flight = resolveOfferDecision(input);
    offerFlights.set(flightKey, flight);
  }

  try {
    const result = await flight;
    if (createdFlight) {
      return result;
    }
    const visibleDecision = await loadVisibleCurrentOffer(input);
    if (!visibleDecision) return unavailable();
    return { decision: visibleDecision, createdDecision: false };
  } finally {
    if (createdFlight && offerFlights.get(flightKey) === flight) {
      offerFlights.delete(flightKey);
    }
  }
};

const projectDecision = async (
  input: WorkflowInput,
  decision: RecommendationDecisionDTO,
  createdDecision: boolean
): Promise<CanonicalOfferProjection> => {
  const activity = await PairActivity.findOne({
    _id: decision.activity.id,
    pairId: input.pairId,
    status: 'offered',
  }).lean<StoredActivity | null>();
  if (!activity) return unavailable();
  return {
    decision,
    activity: toPairActivityDTO(activity, { includeAnswers: false }),
    offer: toActivityOfferDTO(activity),
    createdDecision,
  };
};

const projectCanonicalOffer = async (
  input: WorkflowInput
): Promise<CanonicalOfferProjection> => {
  const { decision, createdDecision } = await offerDecision(input);
  return projectDecision(input, decision, createdDecision);
};

export const recommendationWorkflowService = {
  async offer(input: {
    pairId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<RecommendationDecisionDTO> {
    return (await offerDecision(input)).decision;
  },

  async suggestCompatibility(
    input: WorkflowInput
  ): Promise<PairActivitySuggestionResult> {
    const projection = await projectCanonicalOffer(input);
    return {
      plan: {
        status: 'ready',
        reasonCode: 'FACTOR_SUPPORT',
        explanation: projection.decision.explanation,
        decisionVersion: 'activity-decision-v2',
      },
      currentActivity: null,
      offers: [projection.activity],
      createdCount: projection.createdDecision ? 1 : 0,
    };
  },

  async offersCompatibility(input: WorkflowInput): Promise<ActivityOfferDTO[]> {
    return [(await projectCanonicalOffer(input)).offer];
  },

  async nextCompatibility(
    input: WorkflowInput
  ): Promise<{ activityId: string; offer: ActivityOfferDTO }> {
    const projection = await projectCanonicalOffer(input);
    return {
      activityId: projection.offer.id,
      offer: projection.offer,
    };
  },

  async fromTemplateCompatibility(
    input: WorkflowInput & { templateId: string },
    hooks: RecommendationFromTemplateReliabilityTestHooks = {}
  ): Promise<{ id: string; offer: ActivityOfferDTO }> {
    const current = await recommendationDecisionService.getCurrent(input);
    if (current) {
      const projection = await projectDecision(input, current, false);
      return { id: projection.offer.id, offer: projection.offer };
    }

    const recommendationContext =
      await recommendationDecisionService.requireCurrentPublishableSummary({
        pairId: input.pairId,
        currentUserId: input.currentUserId,
      });
    if (!isSafetyFallbackTemplateId(input.templateId)) return unavailable();
    let activityId = await recommendationDecisionService.findEligibleOfferedActivity({
      pairId: input.pairId,
      currentUserId: input.currentUserId,
      snapshotId: String(recommendationContext.snapshotId),
      includeTemplateId: input.templateId,
    });
    if (!activityId) {
      const created = await activityOfferService.createFromTemplate({
        ...input,
        recommendationContext,
      });
      activityId = created.id;
    }
    await hooks.afterActivityPrepared?.();
    const decision = await recommendationDecisionService.openForActivity({
      pairId: input.pairId,
      activityId,
      currentUserId: input.currentUserId,
      recommendationContext,
    });
    if (decision.activity.id !== activityId) {
      await PairActivity.updateOne(
        { _id: activityId, pairId: input.pairId, status: 'offered' },
        { $set: { status: 'cancelled' } }
      );
    }
    const projection = await projectDecision(input, decision, true);
    return { id: projection.offer.id, offer: projection.offer };
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
    recordOperationalEvent({
      name: 'recommendation_accepted',
      routeGroup: 'recommendation',
      outcome: 'ok',
    });
    return recommendationDecisionService.getById(input);
  },

  async skip(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<RecommendationDecisionDTO> {
    return recommendationDecisionService.skip(input);
  },

  async replace(
    input: {
      pairId: string;
      decisionId: string;
      currentUserId: string;
      auditRequest?: AuditRequestContext;
    },
    hooks: RecommendationReplacementReliabilityTestHooks = {}
  ): Promise<RecommendationDecisionDTO> {
    const prepared = await recommendationDecisionService.prepareReplacement(input);
    if (prepared.kind === 'existing') return prepared.decision;
    await hooks.afterReplacementPrepared?.();

    try {
      return await createOrReuseOffer({
        pairId: input.pairId,
        currentUserId: input.currentUserId,
        previousDecisionId: prepared.decisionId,
        successorDecisionId: prepared.successorDecisionId,
        excludeActivityId: prepared.activityId,
        excludeTemplateId: prepared.templateId,
        auditRequest: input.auditRequest,
      });
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === 'RECOMMENDATION_UNAVAILABLE'
      ) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const recovered =
            await recommendationDecisionService.prepareReplacement(input);
          if (recovered.kind === 'existing') return recovered.decision;
          if (attempt < 2) {
            await new Promise<void>((resolve) =>
              setTimeout(resolve, 10 * (attempt + 1))
            );
          }
        }
      }
      await recommendationDecisionService.rollbackReplacement(input);
      throw error;
    }
  },
};
