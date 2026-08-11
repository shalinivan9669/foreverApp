import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import type { recommendationBodySchema } from './request';
import type { z } from 'zod';

type RecommendationBody = z.infer<typeof recommendationBodySchema>;

export const executeRecommendationMutation = async (input: {
  pairId: string;
  currentUserId: string;
  body: RecommendationBody;
  auditRequest: AuditRequestContext;
}) => {
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
