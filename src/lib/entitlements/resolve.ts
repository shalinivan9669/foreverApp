import { Types, type PipelineStage } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Subscription, type SubscriptionType } from '@/models/Subscription';
import { getPlanFeatures, getPlanQuotas } from '@/lib/entitlements/catalog';
import type {
  EntitlementsSnapshot,
  ResolveEntitlementsInput,
  SubscriptionStatus,
} from '@/lib/entitlements/types';

type SubscriptionWithDates = SubscriptionType & {
  createdAt?: Date;
  updatedAt?: Date;
};

type EffectiveSubscription = SubscriptionWithDates & {
  ownership: 'pair_subscription' | 'legacy_user_subscription';
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

const statusPriorityStage = (now: Date): PipelineStage => ({
  $addFields: {
    __statusPriority: {
      $cond: [
        {
          $or: [
            { $eq: ['$status', 'expired'] },
            { $lt: [{ $ifNull: ['$periodEnd', now] }, now] },
          ],
        },
        0,
        {
          $switch: {
            branches: [
              { case: { $eq: ['$status', 'active'] }, then: 4 },
              { case: { $eq: ['$status', 'trial'] }, then: 3 },
              { case: { $eq: ['$status', 'grace'] }, then: 2 },
            ],
            default: 0,
          },
        },
      ],
    },
  },
});

const pairSubscriptionPipeline = (
  pairId: Types.ObjectId,
  now: Date
): PipelineStage[] => [
  { $match: { pairId } },
  statusPriorityStage(now),
  {
    $sort: {
      provider: 1,
      providerIsCurrent: -1,
      providerEventOccurredAt: -1,
      updatedAt: -1,
      createdAt: -1,
      _id: -1,
    },
  },
  {
    $group: {
      _id: { $ifNull: ['$provider', '__legacy_pair'] },
      candidate: { $first: '$$ROOT' },
    },
  },
  { $replaceRoot: { newRoot: '$candidate' } },
  {
    $sort: {
      __statusPriority: -1,
      periodEnd: -1,
      providerEventOccurredAt: -1,
      updatedAt: -1,
      createdAt: -1,
      _id: -1,
    },
  },
  { $limit: 1 },
  { $project: { __statusPriority: 0 } },
];

const legacySubscriptionPipeline = (
  currentUserId: string,
  now: Date
): PipelineStage[] => [
  {
    $match: {
      userId: currentUserId,
      pairId: { $exists: false },
    },
  },
  statusPriorityStage(now),
  {
    $sort: {
      __statusPriority: -1,
      periodEnd: -1,
      updatedAt: -1,
      createdAt: -1,
      _id: -1,
    },
  },
  { $limit: 1 },
  { $project: { __statusPriority: 0 } },
];

const toEffective = (
  subscription: SubscriptionWithDates | undefined,
  ownership: EffectiveSubscription['ownership'],
  now: Date
): EffectiveSubscription | null => {
  if (!subscription) return null;
  if (normalizeStatus(subscription.status, subscription.periodEnd, now) === 'expired') {
    return null;
  }
  return { ...subscription, ownership };
};

export async function resolveEntitlements(
  input: ResolveEntitlementsInput
): Promise<EntitlementsSnapshot> {
  const now = new Date();
  await connectToDatabase();

  const pairQuery =
    input.pairId && Types.ObjectId.isValid(input.pairId)
      ? Subscription.aggregate<SubscriptionWithDates>(
          pairSubscriptionPipeline(new Types.ObjectId(input.pairId), now)
        )
      : Promise.resolve<SubscriptionWithDates[]>([]);
  const legacyQuery = Subscription.aggregate<SubscriptionWithDates>(
    legacySubscriptionPipeline(input.currentUserId, now)
  );
  const [pairOwned, legacyOwned] = await Promise.all([pairQuery, legacyQuery]);

  const effective =
    toEffective(pairOwned[0], 'pair_subscription', now) ??
    toEffective(legacyOwned[0], 'legacy_user_subscription', now);
  const status = effective
    ? normalizeStatus(effective.status, effective.periodEnd, now)
    : 'expired';
  const plan = effective?.plan ?? 'FREE';

  return {
    userId: input.currentUserId,
    pairId: input.pairId,
    plan,
    status,
    source: effective?.ownership ?? 'default_free',
    resolvedAt: now.toISOString(),
    periodEnd: effective?.periodEnd?.toISOString(),
    features: getPlanFeatures(plan),
    quotas: getPlanQuotas(plan),
  };
}
