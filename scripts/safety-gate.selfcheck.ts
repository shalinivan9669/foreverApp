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
assert.equal(route.includes('body.data.ownerUserId'), false);

const offerService = readFileSync(
  join(process.cwd(), 'src/domain/services/activityOffer.service.ts'),
  'utf8'
);
assert.ok(offerService.includes('isPairSafetyVetoActive'));
assert.ok(offerService.includes('isSafetyFallbackTemplateId'));
assert.ok(offerService.includes('A neutral low-effort format is available now.'));
assert.equal(offerService.includes('safetyVeto: true'), false);

const activityService = readFileSync(
  join(process.cwd(), 'src/domain/services/activities.service.ts'),
  'utf8'
);
assert.ok(activityService.includes("code: 'ACTIVITY_UNAVAILABLE'"));
assert.ok(activityService.includes('isSafetyFallbackTemplateId'));

console.log('safety-gate selfcheck passed');
