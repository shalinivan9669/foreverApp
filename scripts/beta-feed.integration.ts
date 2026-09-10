import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { GET as feedGet } from '@/app/api/assessments/discovery/route';
import { POST as comparePost } from '@/app/api/assessments/compare/route';
import { betaDirectService } from '@/domain/services/assessmentDirect.service';
import { assessmentRunsService } from '@/domain/services/assessmentRuns.service';
import { getAssessmentPublication } from '@/domain/assessment/publication';
import { usersService } from '@/domain/services/users.service';
import { entryProfileService } from '@/domain/services/entryProfile.service';
import { mvpOnboardingService, MVP_ONBOARDING_QUESTIONS, MVP_ONBOARDING_CONTENT_REVISION, MVP_ONBOARDING_POLICY_VERSION } from '@/domain/services/mvpOnboarding.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import { accountDeletionService } from '@/domain/services/accountDeletion.service';
import { saveOwnMatchingCard, getMatchingPreferences, updateMatchingPreferences, blockMatchingUser, unblockMatchingUser, getMatchingFeed, createMatchingLike } from '@/domain/services/matching/matchingApplication.service';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { AssessmentDiscoverySession } from '@/models/AssessmentDiscoverySession';
import { AssessmentRun } from '@/models/AssessmentRun';
import { MatchingProfile } from '@/models/MatchingProfile';
import { CandidateDiscoveryProjection } from '@/models/CandidateDiscoveryProjection';
import { CandidatePresentationGrant } from '@/models/CandidatePresentationGrant';
import { DomainError } from '@/domain/errors';
import type { ApiSuccessEnvelope } from '@/lib/api/response';
import type { BetaComparisonDTO, BetaDirectPlan, BetaDiscoveryDTO } from '@/lib/dto/assessmentBeta.dto';
import { createLocalAcceptanceFixtures } from './lib/local-acceptance-fixtures';
import { prepareLocalAcceptanceBetaFeed } from './lib/local-acceptance-beta-feed';
import { requireMatchingTestDatabaseTarget } from './lib/matching-test-database';
const target = requireMatchingTestDatabaseTarget(), uri = new URL(target.uri), runId = /^\/vmeste_local_([a-f0-9]{12})_test$/.exec(uri.pathname)?.[1];
assert.ok(runId); assert.equal(uri.hostname, '127.0.0.1'); assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`); assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
let fixtures: Awaited<ReturnType<typeof createLocalAcceptanceFixtures>>;
const extraId = `local-acceptance-${runId}-c`, auditRequest = { requestId: randomUUID(), route: 'beta-feed-test', method: 'POST' };
const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 28 * 86400000).toISOString();
const plan: BetaDirectPlan = { templateId: 'DOM.S07', period: { startsAt: start, endsAt: end }, timezone: 'UTC', calendarComplete: true,
  availableIntervals: [{ startsAt: start, endsAt: end }], alternativeIntervals: [], offer: 'COOKING', acceptableOffers: ['COOKING', 'SHOPPING'], idealOffer: null, excludedOffers: [], conditionImportance: 'MUST', requireAppliedCriterion: false,
  willingness: true, alternativeOffer: null, willingAlternative: null, resource: { unit: 'minute', lineageId: 'test-own-week', capacity: 200, basis: 'TOTAL', ordinaryUse: 80 }, criterionAttemptMinutes: null, scheduleAttemptMinutes: null, organizationAttemptMinutes: null,
  willingCriterion: null, willingSchedule: null, provenance: 'USER_INPUT', disclosureVersion: 'beta-direct-predicate-v1' };
const request = (actor: 'a' | 'b', query = '', body?: object) => new NextRequest(`http://localhost:3106/api/assessments/${body ? 'compare' : 'discovery'}${query}`, { method: body ? 'POST' : 'GET', headers: { cookie: fixtures.sessionCookie(actor).split(';')[0], ...(body ? { origin: 'http://localhost:3106', 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function page(actor: 'a' | 'b' = 'a', cursor?: string, limit = 1): Promise<BetaDiscoveryDTO> {
  const response = await feedGet(request(actor, `?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); return (await response.json() as ApiSuccessEnvelope<BetaDiscoveryDTO>).data;
}
async function save(ownerId: string, discoveryOptIn = true, patch: Partial<BetaDirectPlan> = {}) {
  const before = await betaDirectService.get(ownerId);
  await betaDirectService.mutate(ownerId, { action: 'save', viewerToken: before.viewerToken, expectedRevision: before.revision, idempotencyKey: randomUUID(), plan: { ...plan, ...patch }, discoveryOptIn, pairUse: false });
}
async function seedThird() {
  await usersService.upsertCurrentUserProfile({ currentUserId: extraId, payload: { username: 'Третий синтетический участник', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
  await entryProfileService.save({ currentUserId: extraId, profile: { cohort: 'SOLO', age: 25, gender: 'male', city: 'Кызылорда', locationMode: 'DEVICE', coordinates: [65.51, 44.85] } });
  await mvpOnboardingService.mutate({ currentUserId: extraId, mutation: { action: 'start', contentRevision: MVP_ONBOARDING_CONTENT_REVISION, policyVersion: MVP_ONBOARDING_POLICY_VERSION, consent: { adultConfirmed: true, voluntaryParticipationConfirmed: true, privacyAcknowledged: true } } });
  for (const question of MVP_ONBOARDING_QUESTIONS) {
    const value = question.optional ? { kind: 'skipped' as const } : question.kind === 'boolean' ? { kind: 'boolean' as const, booleanValue: true } : question.kind === 'multi' ? { kind: 'multi' as const, optionIds: question.choices?.slice(0, question.minSelections ?? 1).map(choice => choice.id) ?? [] } : { kind: 'single' as const, optionId: question.choices?.[0]?.id };
    await mvpOnboardingService.mutate({ currentUserId: extraId, mutation: { action: 'answer', questionId: question.id, questionRevision: question.revision, capturePolicy: question.optional ? 'PRIVATE' : 'PAIR_MODEL_ONLY', value } });
  }
  await mvpOnboardingService.mutate({ currentUserId: extraId, mutation: { action: 'complete' } });
  await sessionRevocationService.getOrCreateVersion(extraId);
  const template = await MatchingProfile.findOne({ userId: fixtures.subjects.b }).lean(); assert.ok(template);
  for (let observation = 0; observation < 2; observation++) await saveOwnMatchingCard({ currentUserId: extraId, card: { ...template.card, ageRange: { min: 18, max: 99 }, maxDistanceKm: 100, active: true, soughtGender: 'ANY', actual: { relationshipIntent: 'LOOKING_FOR_LONG_TERM', childrenIntent: 'UNSURE', structurePreference: 0.2, socialActivityPreference: 0.1, cleaningPreference: 0.6, repairSkill: 0.8, relationshipPriority: 0.9 } }, idempotencyKey: randomUUID(), auditRequest });
  const preferences = await getMatchingPreferences({ currentUserId: extraId });
  await updateMatchingPreferences({ currentUserId: extraId, revision: preferences.revision, preferences: preferences.preferences.map(item => ({ factorKey: item.factorKey, target: 'allowedValues' in item.target ? { ...item.target, allowedValues: [...item.target.allowedValues] } : item.target, importance: item.importance, flexibility: item.flexibility, constraintMode: item.constraintMode, useAllowed: true })), idempotencyKey: randomUUID(), auditRequest });
}
let count = 0;
type QueryExecution = { queryPlanner: { winningPlan: object }; executionStats: { nReturned: number; totalDocsExamined: number; totalKeysExamined: number } };
async function check(id: string, name: string, work: () => Promise<void>) { process.stdout.write(`${JSON.stringify({ suite: 'beta-feed', status: 'running', stage: id })}\n`); await work(); count++; process.stdout.write(`${JSON.stringify({ suite: 'beta-feed', id, test: name, status: 'passed' })}\n`); }
async function main() {
  const info = console.info; console.info = () => undefined;
  try { fixtures = await createLocalAcceptanceFixtures(runId!, 'matching'); await seedThird(); } finally { console.info = info; }
  await prepareLocalAcceptanceBetaFeed(fixtures.subjects, runId!);
  await AssessmentParticipant.create({ _id: extraId, environment: 'ISOLATED_SYNTHETIC', cohortId: runId, deletionGeneration: 0 });
  for (const ownerId of [...Object.values(fixtures.subjects), extraId]) await save(ownerId);
  await check('BETA-061', 'HTTP feed uses actual authorized matching profiles and direct inputs', async () => {
    const result = await page('a', undefined, 10); assert.equal(result.cards.length, 2);
    assert.deepEqual(new Set(result.cards.map(card => card.candidateId)), new Set([fixtures.subjects.b, extraId]));
    assert.ok(result.cards.every(card => card.lane === 'CURRENT_SUPPORTED' && card.comparison.kind === 'CURRENT'));
  });
  await check('BETA-102', 'actual bounded feed geo preselection and opaque cursor lookup use indexes on representative synthetic rows', async () => {
    const requester = await MatchingProfile.findOne({ userId: fixtures.subjects.a }).lean(); assert.ok(requester);
    const projection = await CandidateDiscoveryProjection.findOne({ userId: fixtures.subjects.a }).lean(); assert.ok(projection?.location);
    const prefix = `local-acceptance-${runId}-explain-`;
    const representativeIds = Array.from({ length: 705 }, (_, index) => `${prefix}${index}`);
    try {
      await CandidateDiscoveryProjection.insertMany(representativeIds.map((userId, index) => ({ ...projection, _id: new mongoose.Types.ObjectId(), userId, location: { type: 'Point', coordinates: index < 205 ? [65.51, 44.85] : [-74, 40.7] } })));
      // Same predicate and bound as getMatchingFeed: explain executes the query,
      // including its actual spherical distance index, rather than listing indexes.
      const explain = await CandidateDiscoveryProjection.find({ userId: { $ne: fixtures.subjects.a }, active: true, requiredDataReady: true, relationshipIntent: 'SEEKING_RELATIONSHIP', age: { $gte: requester.desiredAgeRange.min, $lte: requester.desiredAgeRange.max },
        location: { $near: { $geometry: projection.location, $maxDistance: requester.maxDistanceKm * 1000 } } }).limit(200).lean<QueryExecution>().explain('executionStats');
      assert.equal(explain.executionStats.nReturned, 200); assert.ok(explain.executionStats.totalDocsExamined < representativeIds.length);
      assert.ok(explain.executionStats.totalKeysExamined > 0); assert.equal(JSON.stringify(explain.queryPlanner.winningPlan).includes('COLLSCAN'), false);
      assert.match(JSON.stringify(explain.queryPlanner.winningPlan), /candidate_discovery_location/);
    } finally { await CandidateDiscoveryProjection.deleteMany({ userId: { $in: representativeIds } }); }
    const first = await page('a', undefined, 1); assert.ok(first.nextCursor);
    const id = createHash('sha256').update(first.nextCursor).digest('hex');
    const cursor = await AssessmentDiscoverySession.findById(id).select('+upstreamCursor').lean(); assert.ok(cursor);
    const noiseIds = Array.from({ length: 300 }, () => randomUUID());
    try {
      await AssessmentDiscoverySession.insertMany(noiseIds.map(_id => ({ ...cursor, _id })));
      const explain = await AssessmentDiscoverySession.findOne({ _id: id, ownerId: fixtures.subjects.a, directRevision: cursor.directRevision, permissionRevision: cursor.permissionRevision, modelVersion: cursor.modelVersion, limit: 1, expiresAt: { $gt: new Date() } }).select('+upstreamCursor').lean<QueryExecution>().explain('executionStats');
      assert.ok(explain);
      assert.equal(explain.executionStats.nReturned, 1); assert.equal(explain.executionStats.totalDocsExamined, 1); assert.equal(explain.executionStats.totalKeysExamined, 1);
      assert.equal(JSON.stringify(explain.queryPlanner.winningPlan).includes('COLLSCAN'), false);
    } finally { await AssessmentDiscoverySession.deleteMany({ _id: { $in: noiseIds } }); }
  });
  let oldGrant = '';
  await check('BETA-066', 'opaque cursor pages do not repeat and bind actor limits and direct revision', async () => {
    const first = await page(); assert.equal(first.cards.length, 1); assert.ok(first.nextCursor); oldGrant = first.cards[0].candidateGrant;
    const second = await page('a', first.nextCursor); assert.equal(second.cards.length, 1); assert.notEqual(second.cards[0].candidateId, first.cards[0].candidateId); assert.equal(second.nextCursor, null);
    assert.equal((await feedGet(request('b', `?limit=1&cursor=${first.nextCursor}`))).status, 409);
    assert.equal((await feedGet(request('a', `?limit=2&cursor=${first.nextCursor}`))).status, 409);
    await save(fixtures.subjects.a, true, { resource: { ...plan.resource, capacity: 201 } });
    assert.equal((await feedGet(request('a', `?limit=1&cursor=${first.nextCursor}`))).status, 409);
  });
  await check('BETA-101', 'expired cursor grant and direct period are rejected while their MongoDB documents still exist', async () => {
    const admin = mongoose.connection.db!.admin();
    const previous = await admin.command({ getParameter: 1, ttlMonitorEnabled: 1 }); assert.equal(typeof previous.ttlMonitorEnabled, 'boolean');
    await admin.command({ setParameter: 1, ttlMonitorEnabled: false });
    try {
      const first = await page('a', undefined, 1); assert.ok(first.nextCursor);
      const cursorId = createHash('sha256').update(first.nextCursor).digest('hex');
      const expiredAt = new Date(Date.now() - 1000);
      await AssessmentDiscoverySession.updateOne({ _id: cursorId }, { $set: { expiresAt: expiredAt } });
      assert.ok(await AssessmentDiscoverySession.exists({ _id: cursorId, expiresAt: expiredAt }));
      assert.equal((await feedGet(request('a', `?limit=1&cursor=${first.nextCursor}`))).status, 409);
      assert.ok(await AssessmentDiscoverySession.exists({ _id: cursorId }));
      const candidate = first.cards[0]; assert.ok(candidate);
      const tokenHash = createHash('sha256').update(candidate.candidateGrant).digest('hex');
      // Native collection update models an elapsed immutable expiry without a
      // waiting clock or TTL deletion; normal runtime never edits issued expiry.
      const grantUpdate = await CandidatePresentationGrant.collection.updateOne({ tokenHash }, { $set: { expiresAt: expiredAt } }); assert.equal(grantUpdate.modifiedCount, 1);
      assert.ok(await CandidatePresentationGrant.exists({ tokenHash, expiresAt: expiredAt }));
      assert.notEqual((await comparePost(request('a', '', { candidateGrant: candidate.candidateGrant, actionIds: [] }))).status, 200);
      await assert.rejects(() => createMatchingLike({ currentUserId: fixtures.subjects.a, candidateId: candidate.candidateId, candidateGrant: candidate.candidateGrant, agreements: [true, true, true], answers: ['Синтетический ответ один', 'Синтетический ответ два'], idempotencyKey: randomUUID(), auditRequest }));
      assert.ok(await CandidatePresentationGrant.exists({ tokenHash }));
      const peer = await AssessmentDirect.findById(`beta:${fixtures.subjects.b}`).lean(); assert.ok(peer?.betaPlan);
      const period = { startsAt: new Date(Date.now() - 2 * 86400000).toISOString(), endsAt: new Date(Date.now() - 86400000).toISOString() };
      try {
        await AssessmentDirect.updateOne({ _id: peer._id }, { $set: { betaPlan: { ...peer.betaPlan, period, availableIntervals: [period], alternativeIntervals: [] } } });
        assert.ok((await page('a', undefined, 10)).cards.every(card => card.candidateId !== fixtures.subjects.b));
        assert.ok(await AssessmentDirect.exists({ _id: peer._id, 'betaPlan.period.endsAt': period.endsAt }));
      } finally { await AssessmentDirect.updateOne({ _id: peer._id }, { $set: { betaPlan: peer.betaPlan } }); }
    } finally { await admin.command({ setParameter: 1, ttlMonitorEnabled: previous.ttlMonitorEnabled }); }
  });
  await check('BETA-064', 'live current conditional unknown difference and disabled lanes remain separate', async () => {
    await save(fixtures.subjects.a, true, { alternativeOffer: 'SHOPPING', willingAlternative: true, organizationAttemptMinutes: 10 });
    await save(fixtures.subjects.b, true, { acceptableOffers: ['SHOPPING'] });
    const conditional = (await page('a', undefined, 10)).cards.find(value => value.candidateId === fixtures.subjects.b); assert.ok(conditional);
    assert.equal(conditional.lane, 'CONDITIONAL_PATH'); assert.notEqual(conditional.comparison.status, 'TARGET_SUPPORTED'); assert.equal(conditional.comparison.kind, 'CURRENT');
    await save(fixtures.subjects.b, true, { offer: null });
    assert.equal((await page('a', undefined, 10)).cards.find(value => value.candidateId === fixtures.subjects.b)?.lane, 'CLARIFY');
    await save(fixtures.subjects.b, true, { acceptableOffers: [] });
    assert.equal((await page('a', undefined, 10)).cards.find(value => value.candidateId === fixtures.subjects.b)?.lane, 'VISIBLE_DIFFERENCE');
    await save(fixtures.subjects.b, false);
    assert.ok((await page('a', undefined, 10)).cards.every(value => value.candidateId !== fixtures.subjects.b));
    await save(fixtures.subjects.a); await save(fixtures.subjects.b);
    assert.equal((await page('a', undefined, 10)).cards.find(value => value.candidateId === fixtures.subjects.b)?.lane, 'CURRENT_SUPPORTED');
  });
  await check('BETA-067', 'forged cursor and arbitrary peer id cannot reveal a candidate', async () => {
    assert.equal((await feedGet(request('a', `?limit=1&cursor=${'x'.repeat(43)}`))).status, 409);
    assert.equal((await comparePost(request('a', '', { candidateId: fixtures.subjects.b, actionIds: [] }))).status, 400);
    assert.equal((await comparePost(request('b', '', { candidateGrant: oldGrant, actionIds: [] }))).status, 404);
  });
  await check('BETA-062', 'candidate optout and cohort revocation close current and cached access', async () => {
    const before = await page('a', undefined, 10), candidate = before.cards.find(card => card.candidateId === fixtures.subjects.b); assert.ok(candidate);
    await save(fixtures.subjects.b, false);
    assert.ok((await page('a', undefined, 10)).cards.every(card => card.candidateId !== fixtures.subjects.b));
    const response = await comparePost(request('a', '', { candidateGrant: candidate.candidateGrant, actionIds: [] })); assert.equal(response.status, 200);
    assert.equal((await response.json() as ApiSuccessEnvelope<BetaComparisonDTO>).data.availability, 'UNAVAILABLE');
    await save(fixtures.subjects.b); await AssessmentParticipant.updateOne({ _id: extraId }, { $set: { membershipStatus: 'REVOKED' } });
    assert.ok((await page('a', undefined, 10)).cards.every(card => card.candidateId !== extraId));
    await AssessmentParticipant.updateOne({ _id: extraId }, { $set: { membershipStatus: 'ACTIVE' } });
  });
  await check('BETA-063', 'bidirectional existing social block overrides issued grant and beta lane', async () => {
    const before = await page('a', undefined, 10), candidate = before.cards.find(card => card.candidateId === fixtures.subjects.b); assert.ok(candidate);
    await blockMatchingUser({ currentUserId: fixtures.subjects.b, blockedUserId: fixtures.subjects.a, auditRequest });
    assert.ok((await page('a', undefined, 10)).cards.every(card => card.candidateId !== fixtures.subjects.b));
    assert.notEqual((await comparePost(request('a', '', { candidateGrant: candidate.candidateGrant, actionIds: [] }))).status, 200);
    await unblockMatchingUser({ currentUserId: fixtures.subjects.b, blockedUserId: fixtures.subjects.a, auditRequest });
  });
  await check('BETA-068', 'private source revision cannot change direct feed semantic cards', async () => {
    const semantic = (result: BetaDiscoveryDTO) => result.cards.map(({ candidateId, lane, comparison }) => ({ candidateId, lane, comparison }));
    const before = semantic(await page('a', undefined, 10));
    for (const [publicationId, component] of [['com-s04-knowledge-beta', 'K'], ['com-s04-task-beta', 'D'], ['com-s04-application-beta', 'A']] as const) {
      const published = getAssessmentPublication(publicationId); assert.ok(published);
      const beforeRun = await assessmentRunsService.get(extraId, publicationId);
      let ownRun = await assessmentRunsService.mutate(extraId, { action: 'start', publicationId, viewerToken: beforeRun.viewerToken, idempotencyKey: randomUUID(), ...(component === 'A' ? { period: { id: 'synthetic-completed-period', startsAt: new Date(Date.now() - 30 * 86400000).toISOString(), endsAt: new Date(Date.now() - 2 * 86400000).toISOString() } } : {}) });
      for (let step = 0; step < 32; step++) {
        const item = ownRun.items.find(value => value.available && !value.answered); if (!item) break;
        const shown = await assessmentRunsService.mutate(extraId, { action: 'present', publicationId, viewerToken: ownRun.viewerToken, expectedRevision: ownRun.revision, itemId: item.id, idempotencyKey: randomUUID() }); assert.ok(shown.presentation);
        const definition = published.items.find(value => value.id === item.id); assert.ok(definition);
        ownRun = await assessmentRunsService.mutate(extraId, { action: 'answer', publicationId, viewerToken: shown.viewerToken, expectedRevision: shown.revision, presentationId: shown.presentation.presentationId, idempotencyKey: randomUUID(), response: definition.kind === 'OPTION' ? { kind: 'OPTION', optionId: definition.options[0].id } : definition.kind === 'STRUCTURED' ? { kind: 'STRUCTURED', slots: Object.fromEntries(definition.slots!.map(slot => [slot.id, slot.options[0].id])) } : { kind: 'FACTS', values: Object.fromEntries(definition.fields.map(field => [field.id, true])), episode: { observedAt: new Date(Date.now() - 10 * 86400000).toISOString() } } });
        assert.deepEqual(semantic(await page('a', undefined, 10)), before);
      }
      ownRun = await assessmentRunsService.mutate(extraId, { action: 'finalize', publicationId, viewerToken: ownRun.viewerToken, expectedRevision: ownRun.revision, idempotencyKey: randomUUID() });
      assert.equal(ownRun.status, 'FINALIZED'); assert.equal(ownRun.matchingUse, false); assert.equal(ownRun.pairUse, false);
      const ownedComponent = ownRun.profile!.snapshot!.skills.find(skill => skill.skillId === 'COM.S04')![component]; assert.ok(ownedComponent.observationCount > 0);
      assert.deepEqual(semantic(await page('a', undefined, 10)), before);
    }
  });
  await check('BETA-070', 'real empty state has no fixture fallback', async () => {
    await save(fixtures.subjects.b, false); await save(extraId, false);
    const result = await page('a', undefined, 10); assert.deepEqual(result.cards, []); assert.equal(result.nextCursor, null);
  });
  await check('BETA-071', 'beta OFF leaves existing legacy allowed matching policy unchanged', async () => {
    const before = await getMatchingFeed({ currentUserId: fixtures.subjects.a, limit: 10 });
    process.env.ASSESSMENT_MODE = 'OFF';
    try { assert.equal((await feedGet(request('a', '?limit=10'))).status, 404); const after = await getMatchingFeed({ currentUserId: fixtures.subjects.a, limit: 10 }); assert.deepEqual(after.items.map(item => item.candidate.id), before.items.map(item => item.candidate.id)); }
    finally { delete process.env.ASSESSMENT_MODE; }
  });
  await check('BETA-069', 'real account deletion invalidates issued beta detail and existing contact grant', async () => {
    await save(fixtures.subjects.b);
    const candidate = (await page('a', undefined, 10)).cards.find(value => value.candidateId === fixtures.subjects.b); assert.ok(candidate);
    const sessionVersion = await sessionRevocationService.getOrCreateVersion(fixtures.subjects.b);
    await privacyRequestService.requestDeletion({ ownerUserId: fixtures.subjects.b, auditRequest });
    const deletion = await accountDeletionService.execute({ ownerUserId: fixtures.subjects.b, sessionVersion, auditRequest }); assert.equal(deletion.status, 'EXECUTED');
    assert.equal(await AssessmentDirect.countDocuments({ ownerId: fixtures.subjects.b }), 0);
    assert.ok((await page('a', undefined, 10)).cards.every(value => value.candidateId !== fixtures.subjects.b));
    assert.notEqual((await comparePost(request('a', '', { candidateGrant: candidate.candidateGrant, actionIds: [] }))).status, 200);
    await assert.rejects(() => createMatchingLike({ currentUserId: fixtures.subjects.a, candidateId: fixtures.subjects.b, candidateGrant: candidate.candidateGrant, agreements: [true, true, true], answers: ['Синтетический ответ один', 'Синтетический ответ два'], idempotencyKey: randomUUID(), auditRequest }));
  });
  process.stdout.write(`${JSON.stringify({ suite: 'beta-feed', status: 'passed', tests: count })}\n`);
}
main().catch((error: Error) => { process.stdout.write(`${JSON.stringify({ suite: 'beta-feed', status: 'failed', stage: `Failure ${error.name} ${error instanceof DomainError || error instanceof mongoose.mongo.MongoServerError ? error.code : ''} line ${/beta-feed\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1] ?? 'unknown'}` })}\n`); process.exitCode = 1; }).finally(async () => {
  if (fixtures) { const owners = [...Object.values(fixtures.subjects), extraId]; await AssessmentDirect.deleteMany({ ownerId: { $in: owners } }); await AssessmentParticipant.deleteMany({ _id: { $in: owners } }); await AssessmentDiscoverySession.deleteMany({ ownerId: { $in: owners } }); await AssessmentRun.deleteMany({ ownerId: { $in: owners } }); await fixtures.cleanup(); } else await mongoose.disconnect();
});
