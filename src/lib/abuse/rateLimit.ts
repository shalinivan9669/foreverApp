import { connectToDatabase } from '@/lib/mongodb';
import { RateLimitBucket, type RateLimitBucketType } from '@/models/RateLimitBucket';
import { jsonError } from '@/lib/api/response';
import {
  auditContextFromRequest,
  emitEvent,
  type TrustedProxyMode,
} from '@/lib/audit/emitEvent';

export type RateLimitWindowPolicy = {
  limit: number;
  windowMs: number;
  name: string;
};

export type RateLimitPolicy = {
  name: string;
  routeKey: string;
  keying: 'ip' | 'user' | 'user_or_ip';
  windows: RateLimitWindowPolicy[];
};

export const RATE_LIMIT_POLICIES = {
  exchangeCode: {
    name: 'exchange-code',
    routeKey: '/api/exchange-code',
    keying: 'ip',
    windows: [
      { name: '10/min', limit: 10, windowMs: 60_000 },
      { name: '30/hour', limit: 30, windowMs: 3_600_000 },
    ],
  },
  matchMutations: {
    name: 'match-mutations',
    routeKey: '/api/match/*',
    keying: 'user_or_ip',
    windows: [{ name: '30/min', limit: 30, windowMs: 60_000 }],
  },
  logs: {
    name: 'logs',
    routeKey: '/api/logs',
    keying: 'user_or_ip',
    windows: [{ name: '60/min', limit: 60, windowMs: 60_000 }],
  },
  usersCreate: {
    name: 'users-create',
    routeKey: '/api/users',
    keying: 'user',
    windows: [{ name: '5/min', limit: 5, windowMs: 60_000 }],
  },
  pairsCreate: {
    name: 'pairs-create',
    routeKey: '/api/pairs/create',
    keying: 'user',
    windows: [{ name: '5/min', limit: 5, windowMs: 60_000 }],
  },
  weeklyMutations: {
    name: 'weekly-mutations',
    routeKey: '/api/checkins/weekly*',
    keying: 'user',
    windows: [
      { name: '20/min', limit: 20, windowMs: 60_000 },
      { name: '100/day', limit: 100, windowMs: 86_400_000 },
    ],
  },
  recommendationMutations: {
    name: 'recommendation-mutations',
    routeKey: '/api/pairs/*/recommendations',
    keying: 'user',
    windows: [
      { name: '30/min', limit: 30, windowMs: 60_000 },
      { name: '200/day', limit: 200, windowMs: 86_400_000 },
    ],
  },
  activityMutations: {
    name: 'activity-mutations',
    routeKey: '/api/activities/*',
    keying: 'user',
    windows: [
      { name: '30/min', limit: 30, windowMs: 60_000 },
      { name: '200/day', limit: 200, windowMs: 86_400_000 },
    ],
  },
  notificationMutations: {
    name: 'notification-mutations',
    routeKey: '/api/notifications/*/read',
    keying: 'user',
    windows: [
      { name: '60/min', limit: 60, windowMs: 60_000 },
      { name: '500/day', limit: 500, windowMs: 86_400_000 },
    ],
  },
  billingWebhook: {
    name: 'billing-webhook',
    routeKey: '/api/billing/webhooks/*',
    keying: 'ip',
    windows: [
      { name: '60/min', limit: 60, windowMs: 60_000 },
      { name: '500/hour', limit: 500, windowMs: 3_600_000 },
    ],
  },
  privacyExport: {
    name: 'privacy-export',
    routeKey: '/api/privacy/export',
    keying: 'user',
    windows: [
      { name: '2/hour', limit: 2, windowMs: 3_600_000 },
      { name: '5/day', limit: 5, windowMs: 86_400_000 },
    ],
  },
  privacyDeletionStatus: {
    name: 'privacy-deletion-status',
    routeKey: '/api/privacy/deletion-request',
    keying: 'user',
    windows: [{ name: '30/min', limit: 30, windowMs: 60_000 }],
  },
  privacyDeletionMutation: {
    name: 'privacy-deletion-mutation',
    routeKey: '/api/privacy/deletion-request',
    keying: 'user',
    windows: [
      { name: '5/hour', limit: 5, windowMs: 3_600_000 },
      { name: '10/day', limit: 10, windowMs: 86_400_000 },
    ],
  },
} as const satisfies Record<string, RateLimitPolicy>;

type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      response: Response;
      retryAfterMs: number;
    };

type IncrementWindowResult = {
  exceeded: boolean;
  retryAfterMs: number;
  window: RateLimitWindowPolicy;
};

export const buildRateLimitIdentity = (params: {
  req: Request;
  userId?: string;
  policy: RateLimitPolicy;
  trustedProxyMode?: TrustedProxyMode;
}): string | null => {
  const user = params.userId?.trim();
  if (user && params.policy.keying !== 'ip') {
    return `user:${user}`;
  }
  if (params.policy.keying === 'user') {
    return null;
  }

  const ip = auditContextFromRequest(params.req, undefined, {
    trustedProxyMode: params.trustedProxyMode,
  }).ip?.trim();
  return ip ? `ip:${ip}` : null;
};

const ttlPaddingMs = 5 * 60 * 1000;

const incrementWindow = async (params: {
  nowMs: number;
  key: string;
  policy: RateLimitPolicy;
  window: RateLimitWindowPolicy;
}): Promise<IncrementWindowResult> => {
  const windowStartMs = Math.floor(params.nowMs / params.window.windowMs) * params.window.windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + params.window.windowMs + ttlPaddingMs);

  const updated = await RateLimitBucket.findOneAndUpdate(
    {
      key: params.key,
      route: params.policy.routeKey,
      windowMs: params.window.windowMs,
      windowStart,
    },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        key: params.key,
        route: params.policy.routeKey,
        windowMs: params.window.windowMs,
        windowStart,
        expiresAt,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean<RateLimitBucketType | null>();

  const count = updated?.count ?? 0;
  const exceeded = count > params.window.limit;
  const retryAfterMs = Math.max(0, windowStartMs + params.window.windowMs - params.nowMs);

  return {
    exceeded,
    retryAfterMs,
    window: params.window,
  };
};

const toRateLimitedResponse = (retryAfterMs: number): Response => {
  const response = jsonError(
    429,
    'RATE_LIMITED',
    'Too many requests',
    { retryAfterMs }
  );
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return response;
};

type EnforceRateLimitParams = {
  req: Request;
  policy: RateLimitPolicy;
  userId?: string;
  routeForAudit?: string;
};

export async function enforceRateLimit(params: EnforceRateLimitParams): Promise<RateLimitResult> {
  const key = buildRateLimitIdentity({
    req: params.req,
    userId: params.userId,
    policy: params.policy,
  });

  // An untrusted forwarding header is not an identity. Anonymous IP policies
  // are enabled only when a trusted ingress mode can supply a verified client
  // address; otherwise fail open instead of coupling every client to one
  // process-wide "unknown" bucket.
  if (!key) {
    return { ok: true };
  }

  await connectToDatabase();

  const nowMs = Date.now();
  let exceededWindow: IncrementWindowResult | null = null;
  let maxRetryAfterMs = 0;

  for (const window of params.policy.windows) {
    const result = await incrementWindow({
      nowMs,
      key,
      policy: params.policy,
      window,
    });

    if (result.exceeded) {
      exceededWindow = exceededWindow ?? result;
      maxRetryAfterMs = Math.max(maxRetryAfterMs, result.retryAfterMs);
    }
  }

  if (!exceededWindow) {
    return { ok: true };
  }

  const requestContext = auditContextFromRequest(
    params.req,
    params.routeForAudit ?? params.policy.routeKey
  );

  await emitEvent({
    event: 'ABUSE_RATE_LIMIT_HIT',
    actor: { userId: params.userId ?? 'anonymous' },
    request: requestContext,
    target: {
      type: 'system',
      id: params.policy.routeKey,
    },
    metadata: {
      route: params.policy.routeKey,
      policy: exceededWindow.window.name,
      retryAfterMs: maxRetryAfterMs,
      windowMs: exceededWindow.window.windowMs,
      limit: exceededWindow.window.limit,
    },
  });

  return {
    ok: false,
    retryAfterMs: maxRetryAfterMs,
    response: toRateLimitedResponse(maxRetryAfterMs),
  };
}
