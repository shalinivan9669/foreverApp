import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OPERATIONAL_EVENT_NAMES,
  operationalRouteGroupForPath,
  recordOperationalEvent,
} from '@/lib/observability/operationalEvents';

const requiredEvents = [
  'retry_observed',
  'conflict_observed',
  'invite_converted',
  'cycle_completed',
  'recommendation_accepted',
  'activity_completed',
  'webhook_failed',
  'reconciliation_failed',
] as const;

for (const event of requiredEvents) {
  assert.ok(OPERATIONAL_EVENT_NAMES.includes(event));
}

assert.equal(operationalRouteGroupForPath('/api/exchange-code'), 'auth');
assert.equal(operationalRouteGroupForPath('/api/pair-invites/accept'), 'pair_invite');
assert.equal(operationalRouteGroupForPath('/api/checkins/weekly'), 'weekly_cycle');
assert.equal(operationalRouteGroupForPath('/api/pairs/x/recommendations'), 'recommendation');
assert.equal(operationalRouteGroupForPath('/api/activities/x/complete'), 'activity');
assert.equal(operationalRouteGroupForPath('/api/billing/webhooks/sandbox'), 'billing');

const captured: Array<{ label: string; event: object }> = [];
const originalInfo = console.info;
console.info = (label: string, event: object): void => {
  captured.push({ label, event });
};
try {
  recordOperationalEvent({
    name: 'conflict_observed',
    routeGroup: 'recommendation',
    outcome: 'conflict',
    durationMs: 1.2,
    code: 'safe_code',
  });
} finally {
  console.info = originalInfo;
}
assert.deepEqual(captured, [
  {
    label: 'operational_event',
    event: {
      name: 'conflict_observed',
      routeGroup: 'recommendation',
      outcome: 'conflict',
      durationMs: 1,
      code: 'SAFE_CODE',
    },
  },
]);

const callSiteSources = [
  'src/lib/idempotency/withIdempotency.ts',
  'src/domain/services/pairInvite.service.ts',
  'src/domain/services/weeklyCheckIn.service.ts',
  'src/domain/services/weeklyCycle.service.ts',
  'src/domain/services/recommendationWorkflow.service.ts',
  'src/domain/services/activities.service.ts',
  'src/domain/services/billingWebhook.service.ts',
].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'));
const allCallSites = callSiteSources.join('\n');
for (const event of requiredEvents) {
  assert.match(allCallSites, new RegExp(`name: ['"]${event}['"]`));
}

console.log('operational events selfcheck passed');
