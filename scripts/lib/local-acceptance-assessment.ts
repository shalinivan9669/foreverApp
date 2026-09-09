import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { assessmentRunsService } from '@/domain/services/assessmentRuns.service';
import { assessmentComparisonService } from '@/domain/services/assessmentComparison.service';
import { DOM_S07_PUBLICATION } from '@/domain/assessment/publication';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { AssessmentDirectAnswers } from '@/domain/assessment/comparison';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentRun, AssessmentOperation } from '@/models/AssessmentRun';
import { Pair } from '@/models/Pair';
import { PairInvite } from '@/models/PairInvite';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { AssessmentComparison } from '@/models/AssessmentComparison';
import { AssessmentPairWork, AssessmentPairReport } from '@/models/AssessmentPairWork';

type Subjects = { a: string; b: string };

const assertOwnedCohort = (subjects: Subjects, runId: string): void => {
  assert.match(runId, /^[a-f0-9]{12}$/);
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.protocol, 'mongodb:');
  assert.equal(uri.hostname, '127.0.0.1');
  assert.equal(uri.pathname, `/vmeste_local_${runId}_test`);
  assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`);
  assert.deepEqual(subjects, { a: `local-acceptance-${runId}-a`, b: `local-acceptance-${runId}-b` });
};

/** Enrollment creates no answers, permission grants, scores or agreement confirmations. */
export async function seedLocalAcceptanceAssessment(subjects: Subjects, runId: string): Promise<string> {
  assertOwnedCohort(subjects, runId);
  assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
  await AssessmentParticipant.insertMany(Object.values(subjects).map((userId) => ({
    _id: userId, environment: 'ISOLATED_SYNTHETIC', cohortId: runId, deletionGeneration: 0,
  })));
  // The existing Pair is formed by the real invite lifecycle with two distinct
  // synthetic subjects. Assessment cannot grant membership or invent a couple.
  const issued = await pairInviteService.create({ currentUserId: subjects.a });
  const claimed = await pairInviteService.accept({ currentUserId: subjects.b, token: issued.token });
  assert.equal(claimed.status, 'AWAITING_PARTNER_CONFIRMATION');
  const owner = await pairInviteService.ownerStatus({ currentUserId: subjects.a, inviteId: issued.invite.id });
  assert.ok(owner.partner?.publicId);
  const formed = await pairInviteService.confirm({
    currentUserId: subjects.a, inviteId: issued.invite.id, partnerPublicId: owner.partner.publicId,
  });
  assert.equal(formed.status, 'ACCEPTED');
  const pair = await Pair.findById(formed.pairId).lean();
  assert.ok(pair && pair.status === 'active');
  assert.deepEqual([...pair.members].sort(), Object.values(subjects).sort());
  return formed.pairId;
}

/** Explicit ready-browser fixture: actual capture/finalization/permissions only.
 * Current comparison, scenario, proposal and confirmations remain user actions.
 */
export async function prepareLocalAcceptanceAssessmentComparison(subjects: Subjects, runId: string): Promise<void> {
  assertOwnedCohort(subjects, runId);
  assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
  const ownerIds = Object.values(subjects);
  assert.equal(await AssessmentParticipant.countDocuments({ _id: { $in: ownerIds }, cohortId: runId, environment: 'ISOLATED_SYNTHETIC' }), 2);
  assert.equal(await AssessmentRun.countDocuments({ ownerId: { $in: ownerIds } }), 0);
  assert.equal(await Pair.countDocuments({ members: { $all: ownerIds, $size: 2 }, status: 'active' }), 1);
  for (const actor of ['a', 'b'] as const) {
    const ownerId = subjects[actor];
    let view = await assessmentRunsService.get(ownerId);
    view = await assessmentRunsService.mutate(ownerId, { action: 'start', viewerToken: view.viewerToken, idempotencyKey: randomUUID() });
    for (const item of DOM_S07_PUBLICATION.items) {
      view = await assessmentRunsService.mutate(ownerId, { action: 'present', itemId: item.id, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() });
      assert.ok(view.presentation);
      const response: AssessmentResponse = item.kind === 'FACTS' ? {
        kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id,
          field.id.startsWith('NEG.') ? field.id.endsWith('.eligible') : actor === 'a',
        ])),
      } : { kind: 'OPTION', optionId: item.options[0].id };
      view = await assessmentRunsService.mutate(ownerId, { action: 'answer', presentationId: view.presentation.presentationId, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID(), response });
    }
    view = await assessmentRunsService.mutate(ownerId, { action: 'finalize', viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    const profile = view.profile?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07');
    assert.equal(profile?.A.exactLevel, actor === 'a' ? 3 : 0);
    view = await assessmentRunsService.mutate(ownerId, { action: 'matching-permission', matchingUse: true, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    await assessmentRunsService.mutate(ownerId, { action: 'permission', pairUse: true, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    const answers: AssessmentDirectAnswers = {
      parenthood: 'WANT_CHILDREN', relationshipFormat: 'EXCLUSIVE', offersShopping: true, offersCooking: true,
      acceptableMeetingSlots: ['WEEKDAY_EVENING'], proposedMeetingSlots: ['WEEKEND_MORNING'],
      capacityMinutes: 300, ordinaryTaskMinutes: 180, practiceBudgetMinutes: 90, scheduleBudgetMinutes: 15,
      willingPractice: true, willingSchedule: true,
    };
    let direct = await assessmentComparisonService.get(ownerId);
    direct = await assessmentComparisonService.mutate(ownerId, { action: 'save-direct', answers, useForComparison: true, expectedRevision: direct.direct.revision, intentToken: direct.intentToken, idempotencyKey: randomUUID() });
    await assessmentComparisonService.mutate(ownerId, { action: 'pair-permission', pairUse: true, expectedRevision: direct.direct.revision, intentToken: direct.intentToken, idempotencyKey: randomUUID() });
  }
  assert.equal(await AssessmentComparison.countDocuments({ actorIds: { $in: ownerIds } }), 0);
  assert.equal(await AssessmentPairWork.countDocuments({ actorIds: { $in: ownerIds } }), 0);
  assert.equal(await AssessmentPairReport.countDocuments({ ownerId: { $in: ownerIds } }), 0);
}

export async function deleteLocalAcceptanceAssessment(subjects: Subjects, runId: string): Promise<void> {
  assertOwnedCohort(subjects, runId);
  const members = Object.values(subjects);
  // These are disposable fixture records in this process-owned database only.
  await AssessmentRun.deleteMany({ ownerId: { $in: members } });
  await AssessmentOperation.deleteMany({ ownerId: { $in: members } });
  await AssessmentDirect.deleteMany({ ownerId: { $in: members } });
  await AssessmentComparison.deleteMany({ actorIds: { $in: members } });
  await AssessmentPairWork.deleteMany({ actorIds: { $in: members } });
  await AssessmentPairReport.deleteMany({ ownerId: { $in: members } });
  await AssessmentParticipant.deleteMany({ _id: { $in: members }, cohortId: runId });
  await PairInvite.deleteMany({ creatorUserId: { $in: members } });
  await PairMembershipClaim.deleteMany({ userId: { $in: members } });
  await Pair.deleteMany({ members: { $all: members, $size: 2 } });
}
