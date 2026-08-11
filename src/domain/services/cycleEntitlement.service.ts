import type { EntitlementsSnapshot } from '@/lib/entitlements/types';

export type CycleBillingMode = 'disabled' | 'sandbox';

export type CycleAccessDecision = {
  allowed: true;
  reason:
    | 'FREE_CORE'
    | 'FIRST_VALUE_CYCLE'
    | 'FREE_LAUNCH'
    | 'PAIR_ENTITLED';
};

export const decideCycleAccess = (input: {
  billingMode: CycleBillingMode;
  hasPriorValueCycle: boolean;
  entitlements?: EntitlementsSnapshot;
}): CycleAccessDecision => {
  void input;
  return { allowed: true, reason: 'FREE_CORE' };
};

// Compatibility seam for older internal checks. Core weekly paths do not import it.
export const cycleEntitlementService = {
  async assertCanOpen(input: {
    pairId: string;
    currentUserId: string;
    cycleKey: string;
    billingMode?: CycleBillingMode;
  }): Promise<CycleAccessDecision> {
    return decideCycleAccess({
      billingMode: input.billingMode ?? 'disabled',
      hasPriorValueCycle: true,
    });
  },
};
