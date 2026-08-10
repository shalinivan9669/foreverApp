export const OPERATIONAL_EVENT_NAMES = [
  'request_completed',
  'db_health_checked',
  'retry_observed',
  'conflict_observed',
  'invite_converted',
  'cycle_completed',
  'recommendation_accepted',
  'activity_completed',
  'webhook_failed',
  'reconciliation_failed',
] as const;

export type OperationalEventName = (typeof OPERATIONAL_EVENT_NAMES)[number];

export const OPERATIONAL_ROUTE_GROUPS = [
  'health',
  'auth',
  'pair_invite',
  'weekly_cycle',
  'recommendation',
  'activity',
  'history',
  'notification',
  'privacy',
  'billing',
  'other',
] as const;

export type OperationalRouteGroup = (typeof OPERATIONAL_ROUTE_GROUPS)[number];

export const operationalRouteGroupForPath = (path: string): OperationalRouteGroup => {
  if (path.includes('/exchange-code')) return 'auth';
  if (path.includes('/pair-invites')) return 'pair_invite';
  if (path.includes('/weekly') || path.includes('/checkins')) return 'weekly_cycle';
  if (path.includes('/recommendations') || path.includes('/suggest')) return 'recommendation';
  if (path.includes('/activities')) return 'activity';
  if (path.includes('/history')) return 'history';
  if (path.includes('/notifications')) return 'notification';
  if (path.includes('/privacy')) return 'privacy';
  if (path.includes('/billing') || path.includes('/entitlements')) return 'billing';
  return 'other';
};

type OperationalOutcome = 'ok' | 'error' | 'conflict' | 'retry';

export type OperationalEvent = {
  name: OperationalEventName;
  routeGroup: OperationalRouteGroup;
  outcome: OperationalOutcome;
  durationMs?: number;
  count?: number;
  code?: string;
};

const normalizeCode = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_]{1,48}$/.test(normalized) ? normalized : 'UNCLASSIFIED';
};

export const recordOperationalEvent = (event: OperationalEvent): void => {
  const durationMs =
    event.durationMs === undefined
      ? undefined
      : Math.max(0, Math.round(event.durationMs));
  const count =
    event.count === undefined ? undefined : Math.max(0, Math.round(event.count));

  console.info('operational_event', {
    name: event.name,
    routeGroup: event.routeGroup,
    outcome: event.outcome,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(count === undefined ? {} : { count }),
    ...(event.code ? { code: normalizeCode(event.code) } : {}),
  });
};
