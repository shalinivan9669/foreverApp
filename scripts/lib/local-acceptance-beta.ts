import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';
import { assessmentRunsService, resolveAssessmentSourceView } from '@/domain/services/assessmentRuns.service';
import { betaDirectService } from '@/domain/services/assessmentDirect.service';
import { betaComparisonService } from '@/domain/services/assessmentBetaComparison.service';
import { assessmentPairService } from '@/domain/services/assessmentPair.service';
import { betaAppliedPredicate } from '@/domain/assessment/betaComparison';
import { getAssessmentPublication } from '@/domain/assessment/publication';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { BetaDirectPlan } from '@/lib/dto/assessmentBeta.dto';
import { AssessmentPairMutationSchema, type BetaAgreement } from '@/lib/dto/assessmentPair.dto';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentPairWork, AssessmentPairReport } from '@/models/AssessmentPairWork';
import { Pair } from '@/models/Pair';

type Subjects = { a: string; b: string };
function assertOwned(subjects: Subjects, runId: string) {
  assert.match(runId, /^[a-f0-9]{12}$/);
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.protocol, 'mongodb:'); assert.equal(uri.hostname, '127.0.0.1');
  assert.equal(uri.pathname, `/vmeste_local_${runId}_test`); assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`);
  assert.deepEqual(subjects, { a: `local-acceptance-${runId}-a`, b: `local-acceptance-${runId}-b` });
  assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true'); assert.notEqual(process.env.ASSESSMENT_MODE, 'PRIVATE_BETA');
}

/** Explicit disposable browser fixture: actual source capture, settings and direct services.
 * Existing synthetic assessment enrollment and the real Pair lifecycle must already exist.
 * Default leaves all proposals, signatures and reports to browser interaction.
 */
export async function prepareLocalAcceptanceBeta(subjects: Subjects, runId: string): Promise<void> {
  assertOwned(subjects, runId);
  assert.equal(await AssessmentParticipant.countDocuments({ _id: { $in: Object.values(subjects) }, environment: 'ISOLATED_SYNTHETIC', cohortId: runId }), 2);
  const pair = await Pair.findOne({ members: { $all: Object.values(subjects), $size: 2 }, status: 'active' }).lean(); assert.ok(pair);
  const now = new Date(), iso = (days: number, hour = 12) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour)).toISOString();
  const publicationId = 'dom-s07-application-beta', publication = getAssessmentPublication(publicationId); assert.ok(publication);
  for (const actor of ['a', 'b'] as const) {
    const ownerId = subjects[actor];
    const settings = await assessmentAdmissionService.get(ownerId);
    await assessmentAdmissionService.updateSettings(ownerId, { viewerToken: settings.viewerToken, expectedRevision: settings.revision, ownerAssessment: true, discovery: true, pairSharing: true, publicationIds: settings.availablePublicationIds });
    let view = await assessmentRunsService.get(ownerId, publicationId);
    assert.equal(view.status, 'NEW');
    view = await assessmentRunsService.mutate(ownerId, { action: 'start', publicationId, viewerToken: view.viewerToken, idempotencyKey: randomUUID(), period: { id: `beta-ready-completed-${runId}`, startsAt: iso(-30, 0), endsAt: iso(-2, 0) } });
    for (const item of publication.items) {
      view = await assessmentRunsService.mutate(ownerId, { action: 'present', publicationId, itemId: item.id, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() }); assert.ok(view.presentation);
      const response: AssessmentResponse = item.kind === 'FACTS' ? { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id,
        field.id.startsWith('NEG.') ? field.id.endsWith('.eligible') : actor === 'b' && field.id === 'planned' ? false : true,
      ])), episode: { observedAt: iso(-10, 12) } } : item.kind === 'OPTION' ? { kind: 'OPTION', optionId: item.options[0].id } : { kind: 'STRUCTURED', slots: Object.fromEntries(item.slots!.map(slot => [slot.id, slot.options[0].id])) };
      view = await assessmentRunsService.mutate(ownerId, { action: 'answer', publicationId, viewerToken: view.viewerToken, expectedRevision: view.revision, presentationId: view.presentation.presentationId, idempotencyKey: randomUUID(), response });
    }
    await assessmentRunsService.mutate(ownerId, { action: 'finalize', publicationId, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    const resolved = await resolveAssessmentSourceView(ownerId, { purpose: 'PAIR', relationshipId: String(pair._id) });
    assert.equal(betaAppliedPredicate(resolved.snapshot, 'DOM.S07'), actor === 'a' ? 'T' : 'F');
    const plan: BetaDirectPlan = { templateId: 'DOM.S07', period: { startsAt: iso(1, 0), endsAt: iso(29, 0) }, timezone: 'UTC', calendarComplete: true,
      availableIntervals: [{ startsAt: iso(2, actor === 'a' ? 12 : 15), endsAt: iso(2, actor === 'a' ? 13 : 16) }], alternativeIntervals: [{ startsAt: iso(3, 18), endsAt: iso(3, 19) }],
      offer: actor === 'a' ? 'COOKING' : 'SHOPPING', acceptableOffers: [actor === 'a' ? 'SHOPPING' : 'COOKING'], idealOffer: actor === 'a' ? 'SHOPPING' : 'COOKING', excludedOffers: [], conditionImportance: 'MUST', requireAppliedCriterion: true,
      willingness: true, alternativeOffer: null, willingAlternative: null, resource: { unit: 'minute', lineageId: `synthetic-own-budget-${actor}`, capacity: 300, basis: 'TOTAL', ordinaryUse: 180 },
      criterionAttemptMinutes: 90, scheduleAttemptMinutes: 15, organizationAttemptMinutes: null, willingCriterion: true, willingSchedule: true, provenance: 'USER_INPUT', disclosureVersion: 'beta-direct-predicate-v1' };
    const direct = await betaDirectService.get(ownerId);
    await betaDirectService.mutate(ownerId, { action: 'save', viewerToken: direct.viewerToken, expectedRevision: direct.revision, idempotencyKey: randomUUID(), plan, discoveryOptIn: true, pairUse: true });
  }
  const result = await betaComparisonService.calculate(subjects.a, { actionIds: [] });
  assert.notEqual(result.current?.status, 'TARGET_SUPPORTED');
  assert.ok(result.scenarios.some(scenario => scenario.result.status === 'TARGET_SUPPORTED' && scenario.actionIds.includes('B_CRITERION') && scenario.actionIds.includes('JOINT_SCHEDULE')));
  assert.equal(await AssessmentPairWork.countDocuments({ actorIds: { $in: Object.values(subjects) } }), 0);
  assert.equal(await AssessmentPairReport.countDocuments({ ownerId: { $in: Object.values(subjects) } }), 0);
}

/** Optional separate history fixture for report screens, after prepareLocalAcceptanceBeta.
 * Historical clock is injected only through the existing domain test hooks; no persisted report is invented.
 */
export async function prepareLocalAcceptanceBetaPairHistory(subjects: Subjects, runId: string): Promise<void> {
  assertOwned(subjects, runId);
  const today = new Date(), day = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10);
  const past = new Date(`${day(-3)}T00:00:00Z`);
  const agreement: BetaAgreement = { templateId: 'DOM.S07', title: 'Синтетическая история для проверки отдельных отчётов', actions: (['A', 'B'] as const).map(role => ({ role, task: 'Собственная часть синтетической задачи', criterion: 'Проверить окончание своей части', resourceMinutes: 20, noticeRole: role, planningRole: role, reminderRole: role, verificationRole: role })),
    schedule: { timezone: 'UTC', startsOn: day(-2), endsBefore: day(5), weekdays: [0, 1, 2, 3, 4, 5, 6], localTime: '12:00', durationMinutes: 30, ambiguousTimePolicy: 'REJECT', nonexistentTimePolicy: 'REJECT' }, completionCriterion: 'Каждый отдельно описывает приемлемость; молчание остаётся неизвестностью', reschedulePolicy: 'RECONFIRM_FUTURE', endPolicy: 'EITHER_CAN_STOP' };
  const before = await assessmentPairService.get(subjects.a, { now: past }); assert.ok(before.context);
  await assessmentPairService.mutate(subjects.a, AssessmentPairMutationSchema.parse({ action: 'propose', scenarioId: null, betaAgreement: agreement, context: before.context, expectedRevision: before.revision, idempotencyKey: randomUUID() }), { now: past });
  for (const ownerId of [subjects.a, subjects.b]) {
    const current = await assessmentPairService.get(ownerId, { now: past }); assert.ok(current.context); assert.ok(current.agreement);
    await assessmentPairService.mutate(ownerId, { action: 'confirm', context: current.context, expectedRevision: current.revision, expectedContentRevision: current.agreement.contentRevision, idempotencyKey: randomUUID() }, { now: past });
  }
}
