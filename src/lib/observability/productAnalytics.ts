import { randomUUID } from 'node:crypto';

export const MVP_PRODUCT_ANALYTICS_EVENTS = [
  'auth_completed',
  'onboarding_completed',
  'pair_invite_created',
  'pair_joined',
  'cycle_started',
  'checkin_submitted',
  'pair_summary_viewed',
  'activity_offered',
  'activity_accepted',
  'activity_replaced',
  'activity_skipped',
  'activity_completed',
  'feedback_submitted',
  'next_cycle_started',
  'subscription_started',
  'subscription_cancelled',
] as const;

export type MvpProductAnalyticsEventName =
  (typeof MVP_PRODUCT_ANALYTICS_EVENTS)[number];

export const PRODUCT_ANALYTICS_SCOPES = [
  'auth',
  'onboarding',
  'pair_invite',
  'weekly_cycle',
  'pair_summary',
  'recommendation',
  'activity',
  'subscription',
] as const;

export type ProductAnalyticsScope = (typeof PRODUCT_ANALYTICS_SCOPES)[number];

export const MVP_ANALYTICS_FLOW_VERSION = 'mvp-flow-v1';

export type ProductAnalyticsEvent = {
  eventId: string;
  name: MvpProductAnalyticsEventName;
  technicalScope: ProductAnalyticsScope;
  flowVersion: typeof MVP_ANALYTICS_FLOW_VERSION;
  timestamp: string;
};

export const recordProductAnalyticsEvent = (input: {
  name: MvpProductAnalyticsEventName;
  technicalScope: ProductAnalyticsScope;
  at?: Date;
}): ProductAnalyticsEvent => {
  const event: ProductAnalyticsEvent = {
    eventId: randomUUID(),
    name: input.name,
    technicalScope: input.technicalScope,
    flowVersion: MVP_ANALYTICS_FLOW_VERSION,
    timestamp: (input.at ?? new Date()).toISOString(),
  };

  console.info('product_analytics_event', event);
  return event;
};
