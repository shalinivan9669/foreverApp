import {
  assertEntitlement,
  assertQuota,
} from '@/lib/entitlements/guards';
import { resolveEntitlements } from '@/lib/entitlements/resolve';
import { createHash } from 'node:crypto';

export const buildRecommendationQuotaClaimKey = (input: {
  pairId: string;
  cycleKey: string;
  kind: 'primary' | 'replacement';
  decisionId?: string;
}): string =>
  createHash('sha256')
    .update(
      [
        'recommendation-quota-v1',
        input.pairId,
        input.cycleKey,
        input.kind,
        input.decisionId ?? '',
      ].join('|')
    )
    .digest('hex');

export async function assertRecommendationOfferAccess(input: {
  req: Request;
  route: string;
  pairId: string;
  currentUserId: string;
  quotaClaimKey: string;
}): Promise<void> {
  const snapshot = await resolveEntitlements({
    currentUserId: input.currentUserId,
    pairId: input.pairId,
  });
  await assertEntitlement({
    req: input.req,
    route: input.route,
    snapshot,
    key: 'activities.suggestions',
  });
  await assertQuota({
    req: input.req,
    route: input.route,
    snapshot,
    key: 'activities.suggestions.per_day',
    claimKey: input.quotaClaimKey,
  });
}
