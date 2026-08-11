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
assert.match(
  service,
  /SafetyGate\.exists\(\{[\s\S]*?pairId: input\.pairId,[\s\S]*?ownerUserId: input\.ownerUserId,[\s\S]*?enabled: true/
);
assert.ok(service.includes('export const isOwnerSafetyGateActive'));
assert.equal(service.includes('isPairSafetyVetoActive'), false);
assert.ok(service.includes("event: 'SAFETY_GATE_UPDATED'"));
assert.equal(service.includes('rawReason'), false);

const route = readFileSync(
  join(process.cwd(), 'src/app/api/users/me/safety-gate/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('enforceRateLimit'));
assert.ok(route.includes("Cache-Control', 'private, no-store"));
assert.equal(route.includes('body.data.ownerUserId'), false);

const offerService = readFileSync(
  join(process.cwd(), 'src/domain/services/activityOffer.service.ts'),
  'utf8'
);
assert.ok(offerService.includes('isOwnerSafetyGateActive'));
assert.ok(offerService.includes('ownerUserId: input.currentUserId'));
assert.equal(offerService.includes('isPairSafetyVetoActive'), false);
assert.ok(offerService.includes('isSafetyFallbackTemplateId'));
assert.ok(offerService.includes('readActivityRecommendationInputs'));
assert.ok(offerService.includes('buildPairActivitySuggestionPlan'));
assert.ok(offerService.includes('blockedActionKeys'));
assert.ok(offerService.includes('isOfferedActivityEligibleForRole'));
assert.ok(offerService.includes('if (!isSafetyFallbackTemplateId(input.templateId))'));
assert.ok(offerService.includes("code: 'ACTIVITY_UNAVAILABLE'"));
const createFromTemplateBlock = offerService.slice(
  offerService.indexOf('async createFromTemplate'),
  offerService.indexOf('\n  },\n};', offerService.indexOf('async createFromTemplate'))
);
assert.match(createFromTemplateBlock, /isSafetyFallbackTemplateId\(input\.templateId\)/);
assert.match(createFromTemplateBlock, /safetyVeto: false/);
assert.doesNotMatch(
  createFromTemplateBlock,
  /isOwnerSafetyGateActive|SafetyGate\.find|SafetyGate\.exists/,
  'generic fallback creation must not require or reveal an owner SafetyGate'
);

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
assert.ok(eligibilityService.includes('resolveActivityFactorBinding'));
assert.ok(eligibilityService.includes("factor.privacyClass !== 'SENSITIVE'"));
assert.ok(eligibilityService.includes("factor.privacyClass !== 'MATCHING_ONLY'"));
assert.equal(eligibilityService.includes("['finance', 'sexuality']"), false);
assert.ok(eligibilityService.includes('isActivityEligibleForSafetyState'));
assert.ok(eligibilityService.includes('isActivityAccessibleToRole'));

const activityDto = readFileSync(
  join(process.cwd(), 'src/lib/dto/activity.dto.ts'),
  'utf8'
);
assert.doesNotMatch(
  activityDto,
  /safetyVeto|SafetyGate|safety_gate/,
  'participant activity DTO must not disclose the hidden SafetyGate state'
);

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
assert.ok(activityReadService.includes('isOwnerSafetyGateActive'));
assert.ok(activityReadService.includes('ownerUserId: input.currentUserId'));
assert.equal(activityReadService.includes('isPairSafetyVetoActive'), false);
assert.ok(activityReadService.includes('isOfferedActivityEligibleForRole'));
assert.ok(activityReadService.includes("safetyVeto && activity.status === 'offered'"));
assert.ok(activityReadService.includes('safetyVeto: false'));
const activityBucketBlock = activityReadService.slice(
  activityReadService.indexOf('const buildQuery'),
  activityReadService.indexOf('export const pairActivityReadService')
);
assert.doesNotMatch(
  activityBucketBlock,
  /SafetyGate|safetyVeto/,
  'current/history bucket selection must be independent of SafetyGate'
);
assert.ok(activityReadService.includes('canonicalOfferedIds'));
assert.ok(activityReadService.includes("status: 'OFFERED'"));

const eventService = readFileSync(
  join(process.cwd(), 'src/domain/services/pairEvent.service.ts'),
  'utf8'
);
assert.ok(eventService.includes('system-resource-relief'));
assert.ok(eventService.includes('eventEligibleForPairProjection'));
assert.doesNotMatch(
  eventService,
  /safetyGate\.service|isOwnerSafetyGateActive|isPairSafetyVetoActive|isActivityEligibleForSafetyState|safetyVeto/,
  'PairEvent list and generated activities must be independent of owner-private SafetyGate state'
);

const dashboardService = readFileSync(
  join(process.cwd(), 'src/domain/services/pairDashboardSummary.service.ts'),
  'utf8'
);
assert.doesNotMatch(
  dashboardService,
  /safetyGate\.service|isOwnerSafetyGateActive|isPairSafetyVetoActive|SafetyGate|safetyVeto: true/,
  'partner dashboard must not import or read owner-private SafetyGate state'
);
assert.ok(dashboardService.includes('isActivityAccessibleToRole'));
assert.ok(dashboardService.includes('isOfferedActivityEligibleForRole'));
assert.ok(dashboardService.includes('safetyVeto: false'));
assert.ok(dashboardService.includes('canonicalOfferedIds'));
assert.ok(dashboardService.includes('Math.min'));

console.log('safety-gate selfcheck passed');
