export const PLAN_VALUES = ['FREE', 'SOLO', 'COUPLE'] as const;
export type Plan = (typeof PLAN_VALUES)[number];

export const SUBSCRIPTION_STATUS_VALUES = [
  'active',
  'trial',
  'grace',
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS_VALUES)[number];

export const ENTITLEMENT_KEYS = [
  'match.mutations',
  'pairs.create',
  'activities.suggestions',
  'questionnaires.premium',
  'lootboxes.access',
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const QUOTA_KEYS = [
  'match.mutations.per_day',
  'pairs.create.per_month',
  'activities.suggestions.per_day',
] as const;
export type QuotaKey = (typeof QUOTA_KEYS)[number];

export const QUOTA_WINDOW_VALUES = ['day', 'week', 'month'] as const;
export type QuotaWindow = (typeof QUOTA_WINDOW_VALUES)[number];

export type Quota = {
  key: QuotaKey;
  limit: number | null;
  window: QuotaWindow;
};

export type EntitlementsSnapshot = {
  userId: string;
  pairId?: string;
  plan: Plan;
  status: SubscriptionStatus;
  source: 'default_free' | 'subscription';
  resolvedAt: string;
  periodEnd?: string;
  features: Record<EntitlementKey, boolean>;
  quotas: Record<QuotaKey, Quota>;
};

export type ResolveEntitlementsInput = {
  currentUserId: string;
  pairId?: string;
};
