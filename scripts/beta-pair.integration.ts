import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { NextRequest } from 'next/server';
import { GET as directGet, POST as directPost } from '@/app/api/assessments/direct/route';
import { betaComparisonService, calculateBetaComparison } from '@/domain/services/assessmentBetaComparison.service';
import { pairsService } from '@/domain/services/pairs.service';
import { exportOwnerAssessmentPairData } from '@/domain/services/assessmentPairPrivacy.service';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import { accountDeletionService } from '@/domain/services/accountDeletion.service';
import { assessmentPairService } from '@/domain/services/assessmentPair.service';
import { processAssessmentReminders, refreshAssessmentReminderInbox } from '@/domain/services/assessmentReminders.service';
import { type BetaDirectDTO, type BetaDirectPlan } from '@/lib/dto/assessmentBeta.dto';
import { AssessmentPairMutationSchema, type AssessmentPairMutation, type BetaAgreement } from '@/lib/dto/assessmentPair.dto';
import type { ApiSuccessEnvelope } from '@/lib/api/response';
import { AssessmentPairWork, AssessmentPairOccurrence, AssessmentPairReport } from '@/models/AssessmentPairWork';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { Notification } from '@/models/Notification';
import { toNotificationDTO } from '@/lib/dto/notification.dto';
import { AssessmentRuntimeControl } from '@/models/AssessmentOperations';
import { assessmentTargetId } from '@/domain/services/assessmentAccess.service';
import { createLocalAcceptanceFixtures } from './lib/local-acceptance-fixtures';
import { prepareLocalAcceptanceBeta, prepareLocalAcceptanceBetaPairHistory } from './lib/local-acceptance-beta';
import { deleteLocalAcceptanceAssessment, seedLocalAcceptanceAssessment } from './lib/local-acceptance-assessment';
import { requireMatchingTestDatabaseTarget } from './lib/matching-test-database';

const target = requireMatchingTestDatabaseTarget(), uri = new URL(target.uri);
const runId = /^\/vmeste_local_([a-f0-9]{12})_test$/.exec(uri.pathname)?.[1];
assert.ok(runId); assert.equal(uri.hostname, '127.0.0.1'); assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`);
assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
type Actor = 'a' | 'b';
type Fixtures = Awaited<ReturnType<typeof createLocalAcceptanceFixtures>>;
type PairInput<T = AssessmentPairMutation> = T extends AssessmentPairMutation ? Omit<T, 'expectedRevision' | 'idempotencyKey' | 'context'> : never;
let fixtures: Fixtures;
const now = new Date(), day = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10);
const plan: BetaDirectPlan = {
  templateId: 'DOM.S07', period: { startsAt: `${day(0)}T00:00:00.000Z`, endsAt: `${day(28)}T00:00:00.000Z` }, timezone: 'UTC', calendarComplete: true,
  availableIntervals: [{ startsAt: `${day(2)}T12:00:00.000Z`, endsAt: `${day(2)}T13:00:00.000Z` }], alternativeIntervals: [],
  offer: 'COOKING', acceptableOffers: ['COOKING', 'SHOPPING'], idealOffer: 'SHOPPING', excludedOffers: [], conditionImportance: 'MUST', requireAppliedCriterion: false,
  willingness: true, alternativeOffer: null, willingAlternative: null, resource: { unit: 'minute', lineageId: 'own-test-budget', capacity: 120, basis: 'TOTAL', ordinaryUse: 60 },
  criterionAttemptMinutes: null, scheduleAttemptMinutes: null, organizationAttemptMinutes: null, willingCriterion: null, willingSchedule: null, provenance: 'USER_INPUT', disclosureVersion: 'beta-direct-predicate-v1',
};
const agreement: BetaAgreement = {
  templateId: 'DOM.S07', title: 'Синтетическая договорённость',
  actions: [
    { role: 'A', task: 'Собственная часть выбранной задачи', criterion: 'Проверить окончание своей части', resourceMinutes: 20, noticeRole: 'A', planningRole: 'A', reminderRole: 'A', verificationRole: 'A' },
    { role: 'B', task: 'Независимая добровольная часть', criterion: 'Проверить окончание своей части', resourceMinutes: 20, noticeRole: 'B', planningRole: 'B', reminderRole: 'B', verificationRole: 'B' },
  ],
  schedule: { timezone: 'UTC', startsOn: day(2), endsBefore: day(9), weekdays: [0, 1, 2, 3, 4, 5, 6], localTime: '12:00', durationMinutes: 30, ambiguousTimePolicy: 'REJECT', nonexistentTimePolicy: 'REJECT' },
  completionCriterion: 'Каждый отдельно описывает наблюдение; молчание означает неизвестность', reschedulePolicy: 'RECONFIRM_FUTURE', endPolicy: 'EITHER_CAN_STOP',
};
const request = (actor: Actor, body?: object) => new NextRequest('http://localhost:3106/api/assessments/direct', {
  method: body ? 'POST' : 'GET', headers: { cookie: fixtures.sessionCookie(actor).split(';')[0], ...(body ? { origin: 'http://localhost:3106', 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
});
async function direct(actor: Actor): Promise<BetaDirectDTO> { const response = await directGet(request(actor)); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); const body = await response.json() as ApiSuccessEnvelope<BetaDirectDTO>; return body.data; }
async function save(actor: Actor) { const before = await direct(actor); const response = await directPost(request(actor, { action: 'save', viewerToken: before.viewerToken, expectedRevision: before.revision, idempotencyKey: randomUUID(), plan, discoveryOptIn: true, pairUse: true })); assert.equal(response.status, 200); return direct(actor); }
async function mutate(actor: Actor, input: PairInput, at = now) {
  const before = await assessmentPairService.get(fixtures.subjects[actor], { now: at }); assert.ok(before.context);
  return assessmentPairService.mutate(fixtures.subjects[actor], AssessmentPairMutationSchema.parse({ ...input, context: before.context, expectedRevision: before.revision, idempotencyKey: randomUUID() }), { now: at });
}
let count = 0;
async function check(id: string, name: string, work: () => Promise<void>) { process.stdout.write(`${JSON.stringify({ suite: 'beta-pair', status: 'running', stage: id })}\n`); await work(); count++; process.stdout.write(`${JSON.stringify({ suite: 'beta-pair', id, test: name, status: 'passed' })}\n`); }
async function main() {
  const info = console.info; console.info = () => undefined;
  try { fixtures = await createLocalAcceptanceFixtures(runId!, 'assessment'); } finally { console.info = info; }
  await AssessmentPairOccurrence.createIndexes();
  await check('BETA-041', 'HTTP own direct input binds token and persists real authored resource', async () => {
    const a = await direct('a'), b = await direct('b');
    const denied = await directPost(request('b', { action: 'save', viewerToken: a.viewerToken, expectedRevision: b.revision, idempotencyKey: randomUUID(), plan, discoveryOptIn: true, pairUse: true }));
    assert.equal(denied.status, 409); assert.equal(await AssessmentDirect.countDocuments({ ownerId: fixtures.subjects.b }), 0);
    assert.deepEqual((await save('a')).plan, plan); await save('b');
    const result = await betaComparisonService.calculate(fixtures.subjects.a, { actionIds: [] });
    assert.equal(result.current?.status, 'TARGET_SUPPORTED');
  });
  await check('BETA-060', 'prepared beta comparison cannot survive a real own direct revision race', async () => {
    await assert.rejects(() => calculateBetaComparison(fixtures.subjects.a, null, [], false, { afterPrepared: async () => { await save('a'); } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    assert.equal((await betaComparisonService.calculate(fixtures.subjects.a, { actionIds: [] })).current?.status, 'TARGET_SUPPORTED');
  });
  await check('BETA-072', 'two independent version confirmations create recurrence without skill source', async () => {
    const proposed = await mutate('a', { action: 'propose', scenarioId: null, betaAgreement: agreement });
    assert.equal(proposed.agreement?.status, 'NEEDS_TWO_CONFIRMATIONS'); assert.equal(proposed.occurrences?.length, 0);
    const one = await mutate('a', { action: 'confirm', expectedContentRevision: 1 }); assert.equal(one.agreement?.status, 'NEEDS_TWO_CONFIRMATIONS');
    const both = await mutate('b', { action: 'confirm', expectedContentRevision: 1 }); assert.equal(both.agreement?.status, 'ACTIVE'); assert.equal(both.occurrences?.length, 7);
    assert.equal(both.agreement?.currentSkillChanged, false);
  });
  await check('BETA-074', 'own private note cannot change peer DTO or shared content hash', async () => {
    const peerBefore = await assessmentPairService.get(fixtures.subjects.b);
    const before = await AssessmentPairWork.findOne({ pairId: fixtures.assessmentPairId }).lean();
    await mutate('a', { action: 'own-note', note: 'Личная синтетическая заметка' });
    const after = await AssessmentPairWork.findOne({ pairId: fixtures.assessmentPairId }).lean();
    assert.equal(after?.contentHash, before?.contentHash); assert.deepEqual(await assessmentPairService.get(fixtures.subjects.b), peerBefore);
    assert.equal((await assessmentPairService.get(fixtures.subjects.a)).ownNote, 'Личная синтетическая заметка');
  });
  await check('BETA-079', 'durable inbox reminder deduplicates concurrent workers and cancels own optout', async () => {
    for (const actor of ['a', 'b'] as const) await mutate(actor, { action: 'reminders', settings: { enabled: true, timezone: 'UTC', quietStartHour: 0, quietEndHour: 0, leadMinutes: 10 } });
    const dueAt = new Date(`${day(2)}T11:55:00Z`);
    await Promise.all([processAssessmentReminders(dueAt, 20), processAssessmentReminders(dueAt, 20)]);
    const rows = await Notification.find({ userId: { $in: Object.values(fixtures.subjects) }, type: 'BETA_PAIR_REMINDER' }).lean(); assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map(row => `${row.userId}:${row.dedupeKey}`)).size, 2);
    for (const row of rows) {
      const dto = toNotificationDTO(row);
      assert.equal(dto.title, 'Ваше напоминание'); assert.equal(dto.message, 'Можно открыть выбранную вами договорённость, когда будет удобно.');
      assert.equal(dto.action.href, '/assessments/pair'); assert.doesNotMatch(JSON.stringify(dto), /Синтетическая договорённость|Собственная часть|Личная синтетическая заметка|DOM\.S07|GOOD|NEEDS_CHANGE/);
    }
    await mutate('a', { action: 'reminders', settings: { enabled: false, timezone: 'UTC', quietStartHour: 0, quietEndHour: 0, leadMinutes: 10 } });
    assert.equal(await Notification.countDocuments({ userId: fixtures.subjects.a, type: 'BETA_PAIR_REMINDER' }), 0);
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { stoppedEffects: ['NOTIFICATIONS'], recoveryReconciled: true } }, { upsert: true });
    await refreshAssessmentReminderInbox(fixtures.subjects.b, dueAt);
    assert.equal(await Notification.countDocuments({ userId: fixtures.subjects.b, type: 'BETA_PAIR_REMINDER' }), 0);
    assert.equal((await processAssessmentReminders(dueAt, 20)).inserted, 0);
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { stoppedEffects: [] } });
  });
  const elapsed = new Date(`${day(2)}T13:00:00Z`);
  await check('BETA-075', 'elapsed occurrence without answer remains unknown', async () => {
    const result = await assessmentPairService.get(fixtures.subjects.a, { now: elapsed });
    assert.ok(result.occurrences?.some(value => value.state === 'ELAPSED_UNKNOWN'));
    assert.ok(result.reports.every(value => value.status === 'SHARED_DATA_INCOMPLETE' && value.own === null));
  });
  await check('BETA-077', 'two independent reports preserve disagreement and hide private direction', async () => {
    const occurrence = await AssessmentPairOccurrence.findOne({ pairId: fixtures.assessmentPairId }).sort({ startsAt: 1 }).lean(); assert.ok(occurrence);
    await mutate('a', { action: 'report', periodId: occurrence._id, category: 'GOOD', shared: true }, elapsed);
    await mutate('b', { action: 'report', periodId: occurrence._id, category: 'NEEDS_CHANGE', shared: false }, elapsed);
    const privateView = (await assessmentPairService.get(fixtures.subjects.a, { now: elapsed })).reports.find(value => value.periodId === occurrence._id);
    assert.equal(privateView?.status, 'SHARED_DATA_INCOMPLETE'); assert.equal(privateView?.B, null);
    await mutate('b', { action: 'report', periodId: occurrence._id, category: 'NEEDS_CHANGE', shared: true }, elapsed);
    const shared = (await assessmentPairService.get(fixtures.subjects.a, { now: elapsed })).reports.find(value => value.periodId === occurrence._id);
    assert.equal(shared?.A, 'GOOD'); assert.equal(shared?.B, 'NEEDS_CHANGE'); assert.equal(shared?.status, 'AT_LEAST_ONE_REQUESTS_CHANGE');
  });
  const afterSecond = new Date(`${day(3)}T13:00:00Z`);
  await check('BETA-078', 'own comparable occurrences show category trend and corrections replace the same observation', async () => {
    const occurrences = await AssessmentPairOccurrence.find({ pairId: fixtures.assessmentPairId }).sort({ startsAt: 1 }).lean();
    await mutate('a', { action: 'report', periodId: occurrences[0]._id, category: 'ACCEPTABLE', shared: true }, elapsed);
    const newer = await mutate('a', { action: 'report', periodId: occurrences[1]._id, category: 'GOOD', shared: false }, afterSecond);
    assert.equal(newer.reports.find(value => value.periodId === occurrences[1]._id)?.ownTrend, 'IMPROVED_REPORTED_CATEGORY');
    assert.equal(newer.agreement?.currentSkillChanged, false);
    const corrected = await mutate('a', { action: 'report', periodId: occurrences[1]._id, category: 'ACCEPTABLE', shared: false }, afterSecond);
    assert.equal(corrected.reports.find(value => value.periodId === occurrences[1]._id)?.ownTrend, 'SAME_REPORTED_CATEGORY');
    assert.equal(await AssessmentPairReport.countDocuments({ pairId: fixtures.assessmentPairId, ownerId: fixtures.subjects.a }), 2);
  });
  await check('BETA-073', 'future material revision resets signatures and preserves past occurrence version', async () => {
    const old = await AssessmentPairOccurrence.findOne({ pairId: fixtures.assessmentPairId }).sort({ startsAt: 1 }).lean(); assert.ok(old);
    const edited = await mutate('a', { action: 'revise', scenarioId: null, betaAgreement: { ...agreement, title: 'Пересмотр будущего', schedule: { ...agreement.schedule, timezone: 'Asia/Qyzylorda', startsOn: day(4), endsBefore: day(10) } } }, afterSecond);
    assert.equal(edited.agreement?.contentRevision, 2); assert.deepEqual(edited.agreement?.confirmations, { A: false, B: false });
    const kept = await AssessmentPairOccurrence.findById(old._id).lean(); assert.equal(kept?.state, 'PLANNED'); assert.equal(kept?.contentRevision, 1); assert.equal(kept?.contentHash, old.contentHash);
    assert.equal(edited.occurrences?.find(value => value.id === old._id)?.timezone, 'UTC');
    assert.equal(await AssessmentPairOccurrence.countDocuments({ pairId: fixtures.assessmentPairId, contentRevision: 1, state: 'CANCELLED' }), 5);
  });
  await check('BETA-081', 'one participant can stop without violation or acceptance for peer', async () => {
    const revoked = await mutate('b', { action: 'revoke' }, afterSecond);
    assert.equal(revoked.agreement, null);
    const row = await AssessmentPairWork.findOne({ pairId: fixtures.assessmentPairId }).lean(); assert.equal(row?.revoked, true); assert.deepEqual(row?.confirmations, []);
    assert.equal(await AssessmentPairReport.countDocuments({ pairId: fixtures.assessmentPairId }), 3);
  });
  await check('BETA-080', 'ending actual Pair closes new work and reminder effects while owner controls remain', async () => {
    await mutate('a', { action: 'propose', scenarioId: null, betaAgreement: { ...agreement, schedule: { ...agreement.schedule, startsOn: day(4), endsBefore: day(10) } } }, afterSecond);
    await mutate('a', { action: 'confirm', expectedContentRevision: 3 }, afterSecond);
    const before = await mutate('b', { action: 'confirm', expectedContentRevision: 3 }, afterSecond); assert.ok(before.context);
    await pairsService.endPair({ pairId: fixtures.assessmentPairId!, currentUserId: fixtures.subjects.b });
    const countBefore = await AssessmentPairOccurrence.countDocuments({ pairId: fixtures.assessmentPairId });
    assert.equal((await assessmentPairService.get(fixtures.subjects.a)).availability, 'UNAVAILABLE');
    await assert.rejects(() => assessmentPairService.mutate(fixtures.subjects.a, { action: 'confirm', expectedContentRevision: 3, expectedRevision: before.revision, idempotencyKey: randomUUID(), context: before.context! }));
    assert.equal((await processAssessmentReminders(new Date(`${day(4)}T11:55:00Z`), 20)).inserted, 0);
    assert.equal(await AssessmentPairOccurrence.countDocuments({ pairId: fixtures.assessmentPairId }), countBefore);
    assert.ok((await assessmentPairService.getControls(fixtures.subjects.a, fixtures.assessmentPairId!)).context);
    const own = await exportOwnerAssessmentPairData(fixtures.subjects.a); assert.equal(own.reports.length, 2); assert.ok(own.ownAgreementControls.some(value => value.ownNote === 'Личная синтетическая заметка'));
  });
  await check('BETA-051', 'real beta-ready source services establish separate current and joint conditional pair views', async () => {
    await deleteLocalAcceptanceAssessment(fixtures.subjects, runId!);
    fixtures.assessmentPairId = await seedLocalAcceptanceAssessment(fixtures.subjects, runId!);
    await prepareLocalAcceptanceBeta(fixtures.subjects, runId!);
    const one = await betaComparisonService.calculate(fixtures.subjects.a, { actionIds: ['B_CRITERION'] });
    assert.ok(one.scenarios.every(value => value.result.status !== 'TARGET_SUPPORTED'));
    const both = await betaComparisonService.calculate(fixtures.subjects.a, { actionIds: ['B_CRITERION', 'JOINT_SCHEDULE'] });
    assert.ok(both.scenarios.some(value => value.result.status === 'TARGET_SUPPORTED')); assert.deepEqual(one.current, both.current);
    await prepareLocalAcceptanceBetaPairHistory(fixtures.subjects, runId!);
    const history = await assessmentPairService.get(fixtures.subjects.a); assert.equal(history.agreement?.status, 'ACTIVE'); assert.ok(history.occurrences?.some(value => value.state === 'ELAPSED_UNKNOWN'));
    assert.ok(history.reports.every(value => !value.ownRecorded && value.status === 'SHARED_DATA_INCOMPLETE'));
  });
  await check('BETA-060', 'beta comparison rejects permission withdrawal committed after calculation before return', async () => {
    const previous = await assessmentAdmissionService.get(fixtures.subjects.b);
    await assert.rejects(() => calculateBetaComparison(fixtures.subjects.a, null, ['B_CRITERION', 'JOINT_SCHEDULE'], false, { afterPrepared: async () => {
      await assessmentAdmissionService.updateSettings(fixtures.subjects.b, { ...previous.settings, pairSharing: false, viewerToken: previous.viewerToken, expectedRevision: previous.revision });
    } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    const withdrawn = await betaComparisonService.calculate(fixtures.subjects.a, {}); assert.equal(withdrawn.availability, 'UNAVAILABLE'); assert.deepEqual(withdrawn.scenarios, []);
    const current = await assessmentAdmissionService.get(fixtures.subjects.b);
    await assessmentAdmissionService.updateSettings(fixtures.subjects.b, { ...previous.settings, viewerToken: current.viewerToken, expectedRevision: current.revision });
  });
  await check('BETA-060', 'beta comparison rejects account session generation changed before return', async () => {
    const previous = await sessionRevocationService.getOrCreateVersion(fixtures.subjects.b);
    await assert.rejects(() => calculateBetaComparison(fixtures.subjects.a, null, ['B_CRITERION', 'JOINT_SCHEDULE'], false, { afterPrepared: async () => { await sessionRevocationService.revokeAll(fixtures.subjects.b); } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    assert.equal(await sessionRevocationService.isActive(fixtures.subjects.b, previous), false);
    assert.equal((await betaComparisonService.calculate(fixtures.subjects.a, {})).availability, 'AVAILABLE');
  });
  await check('BETA-060', 'beta comparison rejects real Pair pause and does not reuse it after resume', async () => {
    await assert.rejects(() => calculateBetaComparison(fixtures.subjects.a, null, ['B_CRITERION', 'JOINT_SCHEDULE'], false, { afterPrepared: async () => { await pairsService.pausePair({ pairId: fixtures.assessmentPairId!, currentUserId: fixtures.subjects.b }); } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    const paused = await betaComparisonService.calculate(fixtures.subjects.a, {}); assert.equal(paused.availability, 'UNAVAILABLE'); assert.deepEqual(paused.scenarios, []);
    await pairsService.resumePair({ pairId: fixtures.assessmentPairId!, currentUserId: fixtures.subjects.a });
    assert.equal((await betaComparisonService.calculate(fixtures.subjects.a, {})).availability, 'AVAILABLE');
  });
  await check('BETA-069', 'account deletion before comparison return cancels actual issued reminders and future intents for both sides', async () => {
    // Fresh signatures bind the post-revocation account/context versions.
    await prepareLocalAcceptanceBetaPairHistory(fixtures.subjects, runId!);
    for (const actor of ['a', 'b'] as const) await mutate(actor, { action: 'reminders', settings: { enabled: true, timezone: 'UTC', quietStartHour: 0, quietEndHour: 0, leadMinutes: 10 } });
    const upcoming = await AssessmentPairOccurrence.findOne({ pairId: fixtures.assessmentPairId, state: 'PLANNED', startsAt: { $gt: new Date() } }).sort({ startsAt: 1 }).lean(); assert.ok(upcoming);
    const due = new Date(upcoming.startsAt.getTime() - 5 * 60000);
    assert.equal((await processAssessmentReminders(due, 30)).inserted, 2);
    assert.equal(await Notification.countDocuments({ userId: { $in: Object.values(fixtures.subjects) }, type: 'BETA_PAIR_REMINDER' }), 2);
    const b = fixtures.subjects.b, version = await sessionRevocationService.getOrCreateVersion(b);
    await privacyRequestService.requestDeletion({ ownerUserId: b });
    await assert.rejects(() => calculateBetaComparison(fixtures.subjects.a, null, ['B_CRITERION', 'JOINT_SCHEDULE'], false, { afterPrepared: async () => {
      const deletion = await accountDeletionService.execute({ ownerUserId: b, sessionVersion: version, auditRequest: { method: 'TEST', route: '/owned-beta-pair/delete' } }); assert.equal(deletion.status, 'EXECUTED');
    } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    await refreshAssessmentReminderInbox(fixtures.subjects.a, due);
    assert.equal(await Notification.countDocuments({ userId: { $in: Object.values(fixtures.subjects) }, type: 'BETA_PAIR_REMINDER' }), 0);
    assert.equal(await AssessmentPairOccurrence.countDocuments({ actorIds: b }), 0);
    assert.equal((await processAssessmentReminders(due, 30)).inserted, 0);
    assert.equal((await assessmentPairService.get(fixtures.subjects.a)).availability, 'UNAVAILABLE');
  });
  process.stdout.write(`${JSON.stringify({ suite: 'beta-pair', status: 'PASSED', tests: count })}\n`);
}
main().catch((error: Error) => { process.stdout.write(`${JSON.stringify({ suite: 'beta-pair', status: 'failed', stage: `Failure ${error.name} ${error instanceof DomainError || error instanceof mongoose.mongo.MongoServerError ? error.code : ''} line ${/beta-pair\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1] ?? 'unknown'}` })}\n`); process.exitCode = 1; }).finally(async () => {
  if (fixtures) {
    await AssessmentPairOccurrence.deleteMany({ actorIds: { $in: Object.values(fixtures.subjects) } });
    await AssessmentDirect.deleteMany({ ownerId: { $in: Object.values(fixtures.subjects) } });
    await Notification.deleteMany({ userId: { $in: Object.values(fixtures.subjects) }, type: 'BETA_PAIR_REMINDER' });
    await fixtures.cleanup();
  } else await mongoose.disconnect();
});
