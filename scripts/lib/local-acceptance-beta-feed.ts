import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';
import { betaDirectService } from '@/domain/services/assessmentDirect.service';
import { betaDiscoveryService } from '@/domain/services/assessmentDiscovery.service';
import { ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_TERMS_VERSION } from '@/domain/assessment/admission';
import type { BetaDirectPlan } from '@/lib/dto/assessmentBeta.dto';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { Pair } from '@/models/Pair';
import { MatchingProfile } from '@/models/MatchingProfile';

/** Browser fixture only. Existing onboarding/matching profiles and sessions are prerequisites.
 * Uses real registration, direct conditions and discovery; never creates a Pair or contact.
 */
export async function prepareLocalAcceptanceBetaFeed(subjects: { a: string; b: string }, runId: string): Promise<void> {
  assert.match(runId, /^[a-f0-9]{12}$/);
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.protocol, 'mongodb:'); assert.equal(uri.hostname, '127.0.0.1');
  assert.equal(uri.pathname, `/vmeste_local_${runId}_test`); assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`);
  assert.equal(mongoose.connection.name, `vmeste_local_${runId}_test`);
  assert.deepEqual(subjects, { a: `local-acceptance-${runId}-a`, b: `local-acceptance-${runId}-b` });
  assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true'); assert.notEqual(process.env.ASSESSMENT_MODE, 'PRIVATE_BETA');
  const owners = Object.values(subjects);
  assert.equal(await Pair.countDocuments({ members: { $in: owners }, status: { $in: ['active', 'paused'] } }), 0);
  assert.equal(await MatchingProfile.countDocuments({ userId: { $in: owners } }), 2);
  assert.equal(await AssessmentParticipant.countDocuments({ _id: { $in: owners } }), 0);
  await AssessmentParticipant.insertMany(owners.map(ownerId => ({ _id: ownerId, environment: 'ISOLATED_SYNTHETIC', cohortId: runId, deletionGeneration: 0, membershipStatus: 'INVITED' })));
  const startsAt = new Date(Date.now() + 86400000).toISOString(), endsAt = new Date(Date.now() + 28 * 86400000).toISOString();
  const plan: BetaDirectPlan = { templateId: 'DOM.S07', period: { startsAt, endsAt }, timezone: 'UTC', calendarComplete: true,
    availableIntervals: [{ startsAt, endsAt }], alternativeIntervals: [], offer: 'COOKING', acceptableOffers: ['COOKING', 'SHOPPING'], idealOffer: null, excludedOffers: [], conditionImportance: 'MUST', requireAppliedCriterion: false,
    willingness: true, alternativeOffer: null, willingAlternative: null, resource: { unit: 'minute', lineageId: 'synthetic-browser-own-budget', capacity: 200, basis: 'TOTAL', ordinaryUse: 80 }, criterionAttemptMinutes: null, scheduleAttemptMinutes: null, organizationAttemptMinutes: null,
    willingCriterion: null, willingSchedule: null, provenance: 'USER_INPUT', disclosureVersion: 'beta-direct-predicate-v1' };
  for (const ownerId of owners) {
    const settings = await assessmentAdmissionService.get(ownerId);
    const registered = await assessmentAdmissionService.register(ownerId, { viewerToken: settings.viewerToken, idempotencyKey: randomUUID(), termsAccepted: true, adultConfirmed: true, termsVersion: ASSESSMENT_TERMS_VERSION, informationVersion: ASSESSMENT_INFORMATION_VERSION, ownerAssessment: true, discovery: true, pairSharing: false });
    assert.equal(registered.admission, 'ACTIVE'); assert.equal(registered.settings.discovery, true);
    const direct = await betaDirectService.get(ownerId);
    await betaDirectService.mutate(ownerId, { action: 'save', viewerToken: direct.viewerToken, expectedRevision: direct.revision, idempotencyKey: randomUUID(), plan, discoveryOptIn: true, pairUse: false });
  }
  const feed = await betaDiscoveryService.get(subjects.a, { limit: 10 });
  assert.ok(feed.cards.some(card => card.candidateId === subjects.b && card.lane === 'CURRENT_SUPPORTED'));
}
