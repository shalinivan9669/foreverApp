import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSafetyFallbackTemplateId } from '@/domain/services/safetyGate.service';

assert.equal(isSafetyFallbackTemplateId('system-resource-relief'), true);
assert.equal(isSafetyFallbackTemplateId('system-resource-phone-free'), true);
assert.equal(isSafetyFallbackTemplateId('system-closeness-comfort'), false);
assert.equal(isSafetyFallbackTemplateId(undefined), false);

const model = readFileSync(join(process.cwd(), 'src/models/SafetyGate.ts'), 'utf8');
assert.ok(model.includes("retentionClass: 'UNTIL_REVOKED_OR_PAIR_END'"));
assert.ok(model.includes('{ pairId: 1, ownerUserId: 1 }, { unique: true }'));
assert.equal(model.includes('reason:'), false);
assert.equal(model.includes('note:'), false);
assert.equal(model.includes('explanation:'), false);

const service = readFileSync(
  join(process.cwd(), 'src/domain/services/safetyGate.service.ts'),
  'utf8'
);
assert.ok(service.includes('requirePairMember'));
assert.ok(service.includes('ownerUserId: input.ownerUserId'));
assert.ok(service.includes('SafetyGate.exists({ pairId, enabled: true })'));
assert.ok(service.includes("event: 'SAFETY_GATE_UPDATED'"));
assert.equal(service.includes('rawReason'), false);

const route = readFileSync(
  join(process.cwd(), 'src/app/api/users/me/safety-gate/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('enforceRateLimit'));
assert.ok(route.includes("Cache-Control', 'no-store"));
assert.equal(route.includes('body.data.ownerUserId'), false);

const offerService = readFileSync(
  join(process.cwd(), 'src/domain/services/activityOffer.service.ts'),
  'utf8'
);
assert.ok(offerService.includes('isPairSafetyVetoActive'));
assert.ok(offerService.includes('isSafetyFallbackTemplateId'));
assert.ok(offerService.includes('A neutral low-effort format is available now.'));
assert.equal(offerService.includes('safetyVeto: true'), false);
assert.ok(offerService.includes('isOfferedActivityEligibleForRole'));
assert.ok(offerService.includes('if (!isSafetyFallbackTemplateId(input.templateId))'));
assert.ok(offerService.includes("code: 'ACTIVITY_UNAVAILABLE'"));

const activityService = readFileSync(
  join(process.cwd(), 'src/domain/services/activities.service.ts'),
  'utf8'
);
assert.ok(activityService.includes("code: 'ACTIVITY_UNAVAILABLE'"));
assert.ok(activityService.includes('isOfferedActivityEligibleForRole'));

const eligibilityService = readFileSync(
  join(process.cwd(), 'src/domain/services/activityEligibility.service.ts'),
  'utf8'
);
assert.ok(eligibilityService.includes("['finance', 'sexuality']"));
assert.ok(eligibilityService.includes('isActivityEligibleForSafetyState'));
assert.ok(eligibilityService.includes('isActivityAccessibleToRole'));

const activitiesRoute = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/[id]/activities/route.ts'),
  'utf8'
);
assert.ok(activitiesRoute.includes('pairActivityReadService.list'));
assert.equal(activitiesRoute.includes('relationshipActivityLegacyService'), false);

const activityReadService = readFileSync(
  join(process.cwd(), 'src/domain/services/pairActivityRead.service.ts'),
  'utf8'
);
assert.ok(activityReadService.includes('isPairSafetyVetoActive'));
assert.ok(activityReadService.includes('isOfferedActivityEligibleForRole'));
assert.ok(activityReadService.includes('if (safetyVeto)'));
assert.ok(activityReadService.includes('canonicalOfferedIds'));
assert.ok(activityReadService.includes("status: 'OFFERED'"));

const eventService = readFileSync(
  join(process.cwd(), 'src/domain/services/pairEvent.service.ts'),
  'utf8'
);
assert.ok(eventService.includes('system-resource-relief'));
assert.ok(eventService.includes('eventEligibleForPairProjection'));
assert.ok(eventService.includes('isActivityEligibleForSafetyState'));

const dashboardService = readFileSync(
  join(process.cwd(), 'src/domain/services/pairDashboardSummary.service.ts'),
  'utf8'
);
assert.ok(dashboardService.includes('isPairSafetyVetoActive'));
assert.ok(dashboardService.includes('isActivityAccessibleToRole'));
assert.ok(dashboardService.includes('isOfferedActivityEligibleForRole'));
assert.ok(dashboardService.includes('canonicalOfferedIds'));
assert.ok(dashboardService.includes('Math.min'));

console.log('safety-gate selfcheck passed');
