import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MVP_ANALYTICS_FLOW_VERSION,
  MVP_PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_SCOPES,
  recordProductAnalyticsEvent,
  type ProductAnalyticsEvent,
} from '@/lib/observability/productAnalytics';

const captured: ProductAnalyticsEvent[] = [];
const originalInfo = console.info;
console.info = (label: string, event: ProductAnalyticsEvent): void => {
  assert.equal(label, 'product_analytics_event');
  captured.push(event);
};

try {
  for (const name of MVP_PRODUCT_ANALYTICS_EVENTS) {
    const event = recordProductAnalyticsEvent({
      name,
      technicalScope:
        name === 'auth_completed'
          ? 'auth'
          : name === 'onboarding_completed'
            ? 'onboarding'
            : name.startsWith('pair_')
              ? 'pair_invite'
              : name.startsWith('subscription_')
                ? 'subscription'
                : name.includes('cycle') || name === 'checkin_submitted'
                  ? 'weekly_cycle'
                  : 'activity',
      at: new Date('2026-08-01T00:00:00.000Z'),
    });
    assert.equal(event.flowVersion, MVP_ANALYTICS_FLOW_VERSION);
  }
} finally {
  console.info = originalInfo;
}

assert.equal(captured.length, MVP_PRODUCT_ANALYTICS_EVENTS.length);
assert.equal(new Set(captured.map((event) => event.eventId)).size, captured.length);
for (const event of captured) {
  assert.ok(MVP_PRODUCT_ANALYTICS_EVENTS.includes(event.name));
  assert.ok(PRODUCT_ANALYTICS_SCOPES.includes(event.technicalScope));
  assert.deepEqual(Object.keys(event).sort(), [
    'eventId',
    'flowVersion',
    'name',
    'technicalScope',
    'timestamp',
  ]);
  assert.match(event.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(event.timestamp, '2026-08-01T00:00:00.000Z');
}

const seamSource = readFileSync(
  resolve(process.cwd(), 'src/lib/observability/productAnalytics.ts'),
  'utf8'
);
assert.doesNotMatch(
  seamSource,
  /\b(?:userId|pairId|payload|answers|token|cookie)\b/,
  'product analytics seam must not accept subject identifiers or payloads'
);

const callSitePaths = [
  'src/app/api/exchange-code/route.ts',
  'src/app/api/pairs/[id]/summary/route.ts',
  'src/domain/services/mvpOnboarding.service.ts',
  'src/domain/services/pairInvite.service.ts',
  'src/domain/services/weeklyCheckIn.service.ts',
  'src/domain/services/weeklyCycle.service.ts',
  'src/domain/services/recommendationDecision.service.ts',
  'src/domain/services/activities.service.ts',
  'src/domain/services/billingWebhook.service.ts',
];
const callSiteSources = new Map(
  callSitePaths.map((path) => [
    path,
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ])
);
const allCallSites = Array.from(callSiteSources.values()).join('\n');
for (const name of MVP_PRODUCT_ANALYTICS_EVENTS) {
  assert.match(allCallSites, new RegExp(`name: ['"]${name}['"]`));
}

assert.match(
  callSiteSources.get('src/domain/services/weeklyCycle.service.ts') ?? '',
  /materializedCycle\.created/
);
assert.match(
  callSiteSources.get('src/domain/services/recommendationDecision.service.ts') ?? '',
  /if \(newlyCreated\)/
);
assert.match(
  callSiteSources.get('src/domain/services/activities.service.ts') ?? '',
  /if \(outcome\.newFeedbackSubmission\)/
);
assert.match(
  callSiteSources.get('src/domain/services/pairInvite.service.ts') ?? '',
  /if \(!result\.alreadyAccepted\)/
);
assert.match(
  callSiteSources.get('src/domain/services/billingWebhook.service.ts') ?? '',
  /analyticsTransition === 'subscription_started'/
);

console.log('product analytics selfcheck passed');
