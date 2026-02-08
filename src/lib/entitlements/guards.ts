import { DomainError } from '@/domain/errors';
import { emitEvent, auditContextFromRequest } from '@/lib/audit/emitEvent';
import { connectToDatabase } from '@/lib/mongodb';
import { EntitlementQuotaUsage } from '@/models/EntitlementQuotaUsage';
import { requiredPlanForFeature } from '@/lib/entitlements/catalog';
import type {
  EntitlementKey,
  EntitlementsSnapshot,
  Quota,
  QuotaKey,
  QuotaWindow,
} from '@/lib/entitlements/types';

type AssertEntitlementInput = {
  req: Request;
  route: string;
  snapshot: EntitlementsSnapshot;
  key: EntitlementKey;
};

type AssertQuotaInput = {
  req: Request;
  route: string;
  snapshot: EntitlementsSnapshot;
  key: QuotaKey;
  incrementBy?: number;
};

export type QuotaCheckResult = {
  key: QuotaKey;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt?: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const TTL_PADDING_IN_MS = 5 * DAY_IN_MS;

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfUtcWeek = (date: Date): Date => {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return new Date(dayStart.getTime() - mondayOffset * DAY_IN_MS);
};

const startOfUtcMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const resolveWindowStart = (window: QuotaWindow, now: Date): Date => {
  if (window === 'day') return startOfUtcDay(now);
  if (window === 'week') return startOfUtcWeek(now);
  return startOfUtcMonth(now);
};

const resolveResetAt = (quota: Quota, windowStart: Date): Date => {
  if (quota.window === 'day') {
    return new Date(windowStart.getTime() + DAY_IN_MS);
  }
  if (quota.window === 'week') {
    return new Date(windowStart.getTime() + 7 * DAY_IN_MS);
  }
  return new Date(
    Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, 1)
  );
};

const emitDenied = async (input: {
  req: Request;
  route: string;
  userId: string;
  plan: string;
  reason: 'feature' | 'quota';
  feature?: string;
  requiredPlan?: string;
  quota?: string;
  limit?: number | null;
  used?: number;
  resetAt?: string;
}): Promise<void> => {
  const request = auditContextFromRequest(input.req, input.route);
  await emitEvent({
    event: 'ENTITLEMENT_DENIED',
    actor: { userId: input.userId },
    request,
    target: {
      type: 'system',
      id: input.feature ?? input.quota ?? 'entitlements',
    },
    metadata: {
      reason: input.reason,
      feature: input.feature ?? null,
      requiredPlan: input.requiredPlan ?? null,
      quota: input.quota ?? null,
      plan: input.plan,
      limit: input.limit ?? null,
      used: input.used ?? null,
      resetAt: input.resetAt ?? null,
      route: request.route,
    },
  });
};

export async function assertEntitlement(input: AssertEntitlementInput): Promise<void> {
  if (input.snapshot.features[input.key]) {
    return;
  }

  const requiredPlan = requiredPlanForFeature(input.key);
  await emitDenied({
    req: input.req,
    route: input.route,
    userId: input.snapshot.userId,
    plan: input.snapshot.plan,
    reason: 'feature',
    feature: input.key,
    requiredPlan,
  });

  throw new DomainError({
    code: 'ENTITLEMENT_REQUIRED',
    status: 402,
    message: 'Upgrade required',
    details: {
      feature: input.key,
      plan: input.snapshot.plan,
      requiredPlan,
    },
  });
}

export async function assertQuota(input: AssertQuotaInput): Promise<QuotaCheckResult> {
  const incrementBy = input.incrementBy ?? 1;
  const quota = input.snapshot.quotas[input.key];

  if (!quota) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: `Missing quota config: ${input.key}`,
    });
  }

  if (quota.limit === null) {
    return {
      key: input.key,
      limit: null,
      used: 0,
      remaining: null,
    };
  }

  const now = new Date();
  const windowStart = resolveWindowStart(quota.window, now);
  const resetAt = resolveResetAt(quota, windowStart);
  const expiresAt = new Date(resetAt.getTime() + TTL_PADDING_IN_MS);

  await connectToDatabase();

  const doc = await EntitlementQuotaUsage.findOneAndUpdate(
    {
      subjectId: input.snapshot.userId,
      quotaKey: input.key,
      window: quota.window,
      windowStart,
    },
    {
      $inc: { count: incrementBy },
      $setOnInsert: {
        subjectId: input.snapshot.userId,
        quotaKey: input.key,
        window: quota.window,
        windowStart,
        expiresAt,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean<{ count: number } | null>();

  const used = doc?.count ?? incrementBy;
  const limit = quota.limit;
  const remaining = Math.max(0, limit - used);
  const resetAtIso = resetAt.toISOString();

  if (used <= limit) {
    return {
      key: input.key,
      limit,
      used,
      remaining,
      resetAt: resetAtIso,
    };
  }

  await emitDenied({
    req: input.req,
    route: input.route,
    userId: input.snapshot.userId,
    plan: input.snapshot.plan,
    reason: 'quota',
    quota: input.key,
    limit,
    used,
    resetAt: resetAtIso,
  });

  throw new DomainError({
    code: 'QUOTA_EXCEEDED',
    status: 403,
    message: 'Quota exceeded',
    details: {
      quota: input.key,
      plan: input.snapshot.plan,
      limit,
      used,
      resetAt: resetAtIso,
    },
  });
}
