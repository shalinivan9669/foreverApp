import type { NextRequest } from 'next/server';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { recommendationDecisionService } from '@/domain/services/recommendationDecision.service';
import {
  assertRecommendationOfferAccess,
  buildRecommendationQuotaClaimKey,
} from '@/lib/entitlements';
import type { recommendationBodySchema } from './request';
import type { z } from 'zod';

type RecommendationBody = z.infer<typeof recommendationBodySchema>;

export const executeRecommendationMutation = async (input: {
  req: NextRequest;
  route: string;
  pairId: string;
  currentUserId: string;
  body: RecommendationBody;
  auditRequest: AuditRequestContext;
}) => {
  if (input.body.action === 'offer') {
    const current = await recommendationDecisionService.getCurrent({
      pairId: input.pairId,
      currentUserId: input.currentUserId,
    });
    if (current) return current;
    const context =
      await recommendationDecisionService.requireCurrentPublishableSummary({
        pairId: input.pairId,
        currentUserId: input.currentUserId,
      });
    await assertRecommendationOfferAccess({
      req: input.req,
      route: input.route,
      currentUserId: input.currentUserId,
      pairId: input.pairId,
      quotaClaimKey: buildRecommendationQuotaClaimKey({
        pairId: input.pairId,
        cycleKey: context.cycleKey,
        kind: 'primary',
      }),
    });
  }
  if (input.body.action === 'replace') {
    const decision = await recommendationDecisionService.getById({
      pairId: input.pairId,
      decisionId: input.body.decisionId,
      currentUserId: input.currentUserId,
    });
    await assertRecommendationOfferAccess({
      req: input.req,
      route: input.route,
      currentUserId: input.currentUserId,
      pairId: input.pairId,
      quotaClaimKey: buildRecommendationQuotaClaimKey({
        pairId: input.pairId,
        cycleKey: decision.cycleKey,
        kind: 'replacement',
        decisionId: decision.id,
      }),
    });
  }

  const workflowInput = {
    pairId: input.pairId,
    currentUserId: input.currentUserId,
    auditRequest: input.auditRequest,
  };
  if (input.body.action === 'offer') {
    return recommendationWorkflowService.offer(workflowInput);
  }
  if (input.body.action === 'accept') {
    return recommendationWorkflowService.accept({
      ...workflowInput,
      decisionId: input.body.decisionId,
    });
  }
  if (input.body.action === 'replace') {
    return recommendationWorkflowService.replace({
      ...workflowInput,
      decisionId: input.body.decisionId,
    });
  }
  return recommendationWorkflowService.skip({
    pairId: input.pairId,
    currentUserId: input.currentUserId,
    decisionId: input.body.decisionId,
  });
};
