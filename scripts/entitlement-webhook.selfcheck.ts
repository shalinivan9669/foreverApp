import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hashSandboxWebhookPayload,
  parseSandboxWebhook,
  signSandboxWebhook,
  verifySandboxWebhook,
} from '@/lib/billing/sandboxWebhook';
import {
  classifyProviderEvent,
  compareProviderCurrentOrder,
} from '@/domain/services/billingWebhook.service';
import { decideCycleAccess } from '@/domain/services/cycleEntitlement.service';
import { getPlanFeatures, getPlanQuotas } from '@/lib/entitlements/catalog';
import type { EntitlementsSnapshot } from '@/lib/entitlements/types';

const now = new Date('2026-08-07T12:00:00.000Z');
const timestamp = String(Math.floor(now.getTime() / 1000));
const eventId = 'evt_sandbox_001';
const secret = 's'.repeat(32);
const rawBody = JSON.stringify({
  eventType: 'subscription.updated',
  occurredAt: '2026-08-07T11:59:00.000Z',
  version: 7,
  subscriptionId: 'sub_sandbox_001',
  pairId: '64f000000000000000000001',
  billingOwnerUserId: 'member-a',
  plan: 'COUPLE',
  status: 'trial',
  periodEnd: '2026-08-21T12:00:00.000Z',
});
const signature = signSandboxWebhook({ secret, timestamp, eventId, rawBody });
assert.equal(
  verifySandboxWebhook({ secret, timestamp, eventId, rawBody, signature, now }),
  true
);
assert.equal(
  verifySandboxWebhook({
    secret,
    timestamp,
    eventId,
    rawBody: `${rawBody} `,
    signature,
    now,
  }),
  false
);
assert.equal(
  verifySandboxWebhook({
    secret,
    timestamp: String(Number(timestamp) - 301),
    eventId,
    rawBody,
    signature,
    now,
  }),
  false
);
assert.match(hashSandboxWebhookPayload(rawBody), /^[a-f0-9]{64}$/);
assert.equal(parseSandboxWebhook(rawBody).pairId, '64f000000000000000000001');
assert.equal(parseSandboxWebhook(rawBody).version, 7);
assert.throws(() => parseSandboxWebhook('{"eventType":"subscription.updated","extra":true}'));

const deletedOrder = {
  providerEventVersion: 8,
  providerEventOccurredAt: new Date('2026-08-07T12:00:00.000Z'),
  providerLastPayloadHash: 'd'.repeat(64),
};
assert.equal(
  classifyProviderEvent({
    current: deletedOrder,
    incoming: {
      subscriptionId: 'sub_sandbox_001',
      version: 7,
      occurredAt: new Date('2026-08-07T11:59:00.000Z'),
      eventId: 'evt-older-update',
      payloadHash: 'a'.repeat(64),
    },
  }),
  'STALE'
);
assert.equal(
  classifyProviderEvent({
    current: deletedOrder,
    incoming: {
      subscriptionId: 'sub_sandbox_001',
      version: 8,
      occurredAt: new Date('2026-08-07T12:00:00.000Z'),
      eventId: 'evt-equivalent-alias',
      payloadHash: 'd'.repeat(64),
    },
  }),
  'EQUIVALENT'
);
assert.equal(
  classifyProviderEvent({
    current: deletedOrder,
    incoming: {
      subscriptionId: 'sub_sandbox_001',
      version: 8,
      occurredAt: new Date('2026-08-07T12:00:00.000Z'),
      eventId: 'evt-conflicting-alias',
      payloadHash: 'c'.repeat(64),
    },
  }),
  'CONFLICT'
);
assert.equal(
  classifyProviderEvent({
    current: deletedOrder,
    incoming: {
      subscriptionId: 'sub_sandbox_001',
      version: 9,
      occurredAt: new Date('2026-08-07T11:58:00.000Z'),
      eventId: 'evt-time-regression',
      payloadHash: 'b'.repeat(64),
    },
  }),
  'CONFLICT'
);
assert.ok(
  compareProviderCurrentOrder(
    {
      subscriptionId: 'sub-older',
      version: 2,
      occurredAt: new Date('2026-08-07T11:59:00.000Z'),
      eventId: 'evt-older',
      payloadHash: 'a'.repeat(64),
    },
    {
      providerSubscriptionId: 'sub-current',
      providerEventVersion: 1,
      providerEventOccurredAt: new Date('2026-08-07T12:00:00.000Z'),
      providerLastEventId: 'evt-current',
    }
  ) < 0
);

const entitlementSnapshot = (input: {
  plan: EntitlementsSnapshot['plan'];
  status: EntitlementsSnapshot['status'];
  source: EntitlementsSnapshot['source'];
}): EntitlementsSnapshot => ({
  userId: 'member-a',
  pairId: '64f000000000000000000001',
  plan: input.plan,
  status: input.status,
  source: input.source,
  resolvedAt: now.toISOString(),
  features: getPlanFeatures(input.plan),
  quotas: getPlanQuotas(input.plan),
});

assert.deepEqual(
  decideCycleAccess({ billingMode: 'sandbox', hasPriorValueCycle: false }),
  { allowed: true, reason: 'FIRST_VALUE_CYCLE' }
);
assert.deepEqual(
  decideCycleAccess({ billingMode: 'disabled', hasPriorValueCycle: true }),
  { allowed: true, reason: 'FREE_LAUNCH' }
);
assert.deepEqual(
  decideCycleAccess({
    billingMode: 'sandbox',
    hasPriorValueCycle: true,
    entitlements: entitlementSnapshot({
      plan: 'COUPLE',
      status: 'trial',
      source: 'pair_subscription',
    }),
  }),
  { allowed: true, reason: 'PAIR_ENTITLED' }
);
assert.equal(
  decideCycleAccess({
    billingMode: 'sandbox',
    hasPriorValueCycle: true,
    entitlements: entitlementSnapshot({
      plan: 'COUPLE',
      status: 'active',
      source: 'legacy_user_subscription',
    }),
  }).allowed,
  false
);
assert.equal(
  decideCycleAccess({
    billingMode: 'sandbox',
    hasPriorValueCycle: true,
    entitlements: entitlementSnapshot({
      plan: 'COUPLE',
      status: 'expired',
      source: 'pair_subscription',
    }),
  }).allowed,
  false
);

const source = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');
const subscription = source('src/models/Subscription.ts');
const eventModel = source('src/models/BillingWebhookEvent.ts');
const service = source('src/domain/services/billingWebhook.service.ts');
const route = source('src/app/api/billing/webhooks/sandbox/route.ts');
const resolver = source('src/lib/entitlements/resolve.ts');
const cycleEntitlement = source(
  'src/domain/services/cycleEntitlement.service.ts'
);

assert.ok(subscription.includes('pair_provider_subscription_unique'));
assert.ok(subscription.includes('pair_provider_current_subscription_unique'));
assert.ok(subscription.includes('providerEventVersion'));
assert.ok(subscription.includes('billingOwnerUserId'));
assert.ok(eventModel.includes('billing_provider_event_unique'));
assert.ok(eventModel.includes('providerOccurredAt'));
assert.ok(service.includes('session.withTransaction'));
assert.ok(service.includes("status: { $in: ['active', 'paused'] }"));
assert.ok(service.includes('payloadHash !== input.payloadHash'));
assert.ok(service.includes('classifyProviderEvent'));
assert.ok(service.includes('providerIsCurrent: true'));
assert.ok(route.includes('verifySandboxWebhook'));
assert.ok(route.includes("process.env.BILLING_MODE !== 'sandbox'"));
assert.ok(!route.includes('console.log'));
assert.ok(resolver.includes("ownership: 'pair_subscription'"));
assert.ok(resolver.includes('$limit: 1'));
assert.ok(!resolver.includes('.limit(20)'));
assert.ok(source('scripts/release-preflight.ts').includes('ambiguous-legacy-pair-provider-subscriptions'));
assert.ok(cycleEntitlement.includes('cycleKey: { $ne: input.cycleKey }'));
assert.equal(cycleEntitlement.includes('cycleKey: { $lt: input.cycleKey }'), false);
assert.ok(source('src/app/api/pairs/[id]/weekly-cycle/current/route.ts').includes('cycleEntitlementService.assertCanOpen'));
assert.ok(source('src/domain/services/weeklyCheckIn.service.ts').includes('cycleEntitlementService.assertCanOpen'));

console.log('entitlement webhook selfcheck passed');
