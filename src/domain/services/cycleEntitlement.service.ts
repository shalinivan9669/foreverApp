import { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { resolveEntitlements } from '@/lib/entitlements/resolve';
import type { EntitlementsSnapshot } from '@/lib/entitlements/types';
import { connectToDatabase } from '@/lib/mongodb';
import { WeeklyCycle } from '@/models/WeeklyCycle';

export type CycleBillingMode = 'disabled' | 'sandbox';

export type CycleAccessDecision =
  | {
      allowed: true;
      reason: 'FIRST_VALUE_CYCLE' | 'FREE_LAUNCH' | 'PAIR_ENTITLED';
    }
  | {
      allowed: false;
      reason: 'PAIR_ENTITLEMENT_REQUIRED';
      requiredPlan: 'COUPLE';
      currentPlan: EntitlementsSnapshot['plan'];
      currentStatus: EntitlementsSnapshot['status'];
    };

export const decideCycleAccess = (input: {
  billingMode: CycleBillingMode;
  hasPriorValueCycle: boolean;
  entitlements?: EntitlementsSnapshot;
}): CycleAccessDecision => {
  if (!input.hasPriorValueCycle) {
    return { allowed: true, reason: 'FIRST_VALUE_CYCLE' };
  }
  if (input.billingMode === 'disabled') {
    return { allowed: true, reason: 'FREE_LAUNCH' };
  }

  const entitlements = input.entitlements;
  if (
    entitlements?.source === 'pair_subscription' &&
    entitlements.plan === 'COUPLE' &&
    ['active', 'trial', 'grace'].includes(entitlements.status)
  ) {
    return { allowed: true, reason: 'PAIR_ENTITLED' };
  }

  return {
    allowed: false,
    reason: 'PAIR_ENTITLEMENT_REQUIRED',
    requiredPlan: 'COUPLE',
    currentPlan: entitlements?.plan ?? 'FREE',
    currentStatus: entitlements?.status ?? 'expired',
  };
};

const configuredBillingMode = (): CycleBillingMode =>
  process.env.BILLING_MODE === 'sandbox' ? 'sandbox' : 'disabled';

export const cycleEntitlementService = {
  async assertCanOpen(input: {
    pairId: string;
    currentUserId: string;
    cycleKey: string;
    billingMode?: CycleBillingMode;
  }): Promise<CycleAccessDecision> {
    await connectToDatabase();
    if (!Types.ObjectId.isValid(input.pairId)) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'pair not found',
      });
    }

    const hasPriorValueCycle = Boolean(
      await WeeklyCycle.exists({
        pairId: new Types.ObjectId(input.pairId),
        cycleKey: { $ne: input.cycleKey },
        pairReadiness: 'ENOUGH',
        latestSnapshotId: { $exists: true },
      })
    );
    const billingMode = input.billingMode ?? configuredBillingMode();
    const entitlements =
      hasPriorValueCycle && billingMode === 'sandbox'
        ? await resolveEntitlements({
            currentUserId: input.currentUserId,
            pairId: input.pairId,
          })
        : undefined;
    const decision = decideCycleAccess({
      billingMode,
      hasPriorValueCycle,
      ...(entitlements ? { entitlements } : {}),
    });

    if (!decision.allowed) {
      throw new DomainError({
        code: 'ENTITLEMENT_REQUIRED',
        status: 402,
        message: 'Для следующего цикла нужен активный тариф для пары.',
        details: {
          boundary: 'cycle_2',
          requiredPlan: decision.requiredPlan,
          currentPlan: decision.currentPlan,
          currentStatus: decision.currentStatus,
        },
      });
    }
    return decision;
  },
};
