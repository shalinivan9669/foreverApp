import type {
  EntitlementKey,
  Plan,
  Quota,
  QuotaKey,
} from '@/lib/entitlements/types';

const PLAN_ORDER: Plan[] = ['FREE', 'SOLO', 'COUPLE'];

type PlanCatalogEntry = {
  features: Record<EntitlementKey, boolean>;
  quotas: Record<QuotaKey, Omit<Quota, 'key'>>;
};

const buildQuotaMap = (
  quotas: Record<QuotaKey, Omit<Quota, 'key'>>
): Record<QuotaKey, Quota> => ({
  'match.mutations.per_day': {
    key: 'match.mutations.per_day',
    ...quotas['match.mutations.per_day'],
  },
  'pairs.create.per_month': {
    key: 'pairs.create.per_month',
    ...quotas['pairs.create.per_month'],
  },
  'activities.suggestions.per_day': {
    key: 'activities.suggestions.per_day',
    ...quotas['activities.suggestions.per_day'],
  },
});

export const ENTITLEMENT_CATALOG: Record<Plan, PlanCatalogEntry> = {
  FREE: {
    features: {
      'match.mutations': true,
      'pairs.create': true,
      'activities.suggestions': true,
      'questionnaires.premium': false,
      'lootboxes.access': false,
    },
    quotas: {
      // TODO: confirm exact business limits with product before billing go-live.
      'match.mutations.per_day': { limit: 50, window: 'day' },
      'pairs.create.per_month': { limit: 1, window: 'month' },
      'activities.suggestions.per_day': { limit: 6, window: 'day' },
    },
  },
  SOLO: {
    features: {
      'match.mutations': true,
      'pairs.create': true,
      'activities.suggestions': true,
      'questionnaires.premium': true,
      'lootboxes.access': true,
    },
    quotas: {
      'match.mutations.per_day': { limit: 300, window: 'day' },
      'pairs.create.per_month': { limit: 3, window: 'month' },
      'activities.suggestions.per_day': { limit: 40, window: 'day' },
    },
  },
  COUPLE: {
    features: {
      'match.mutations': true,
      'pairs.create': true,
      'activities.suggestions': true,
      'questionnaires.premium': true,
      'lootboxes.access': true,
    },
    quotas: {
      'match.mutations.per_day': { limit: null, window: 'day' },
      'pairs.create.per_month': { limit: 10, window: 'month' },
      'activities.suggestions.per_day': { limit: null, window: 'day' },
    },
  },
};

export const isEntitled = (plan: Plan, key: EntitlementKey): boolean =>
  ENTITLEMENT_CATALOG[plan].features[key];

export const requiredPlanForFeature = (key: EntitlementKey): Plan => {
  const required = PLAN_ORDER.find((plan) => ENTITLEMENT_CATALOG[plan].features[key]);
  return required ?? 'COUPLE';
};

export const getPlanQuotas = (plan: Plan): Record<QuotaKey, Quota> =>
  buildQuotaMap(ENTITLEMENT_CATALOG[plan].quotas);

export const getPlanFeatures = (plan: Plan): Record<EntitlementKey, boolean> => ({
  ...ENTITLEMENT_CATALOG[plan].features,
});
