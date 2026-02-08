import { connectToDatabase } from '@/lib/mongodb';
import { Subscription, type SubscriptionType } from '@/models/Subscription';
import {
  getPlanFeatures,
  getPlanQuotas,
} from '@/lib/entitlements/catalog';
import type {
  EntitlementsSnapshot,
  ResolveEntitlementsInput,
  SubscriptionStatus,
} from '@/lib/entitlements/types';

type SubscriptionWithDates = SubscriptionType & {
  createdAt?: Date;
  updatedAt?: Date;
};

const STATUS_PRIORITY: Record<SubscriptionStatus, number> = {
  active: 4,
  trial: 3,
  grace: 2,
  expired: 1,
};

const normalizeStatus = (
  status: SubscriptionStatus,
  periodEnd: Date | undefined,
  now: Date
): SubscriptionStatus => {
  if (status === 'expired') return 'expired';
  if (periodEnd && periodEnd.getTime() < now.getTime()) return 'expired';
  return status;
};

const compareByPriority = (
  left: SubscriptionWithDates,
  right: SubscriptionWithDates,
  now: Date
): number => {
  const leftStatus = normalizeStatus(left.status, left.periodEnd, now);
  const rightStatus = normalizeStatus(right.status, right.periodEnd, now);
  const byStatus = STATUS_PRIORITY[rightStatus] - STATUS_PRIORITY[leftStatus];
  if (byStatus !== 0) return byStatus;

  const leftPeriodEnd = left.periodEnd?.getTime() ?? 0;
  const rightPeriodEnd = right.periodEnd?.getTime() ?? 0;
  const byPeriodEnd = rightPeriodEnd - leftPeriodEnd;
  if (byPeriodEnd !== 0) return byPeriodEnd;

  const leftUpdated = left.updatedAt?.getTime() ?? left.createdAt?.getTime() ?? 0;
  const rightUpdated = right.updatedAt?.getTime() ?? right.createdAt?.getTime() ?? 0;
  return rightUpdated - leftUpdated;
};

const pickEffectiveSubscription = (
  subscriptions: SubscriptionWithDates[],
  now: Date
): SubscriptionWithDates | null => {
  if (!subscriptions.length) return null;
  const sorted = subscriptions.slice().sort((left, right) => compareByPriority(left, right, now));
  const best = sorted[0];
  const bestStatus = normalizeStatus(best.status, best.periodEnd, now);
  if (bestStatus === 'expired') return null;
  return best;
};

export async function resolveEntitlements(
  input: ResolveEntitlementsInput
): Promise<EntitlementsSnapshot> {
  const now = new Date();
  await connectToDatabase();

  const subscriptions = await Subscription.find({ userId: input.currentUserId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean<SubscriptionWithDates[]>();

  const effective = pickEffectiveSubscription(subscriptions, now);
  const status = effective
    ? normalizeStatus(effective.status, effective.periodEnd, now)
    : 'expired';
  const plan = effective?.plan ?? 'FREE';

  return {
    userId: input.currentUserId,
    pairId: input.pairId,
    plan,
    status,
    source: effective ? 'subscription' : 'default_free',
    resolvedAt: now.toISOString(),
    periodEnd: effective?.periodEnd?.toISOString(),
    features: getPlanFeatures(plan),
    quotas: getPlanQuotas(plan),
  };
}
