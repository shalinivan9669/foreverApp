import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/assessments/runs/route';
import { GET as portfolioGET, POST as portfolioPOST } from '@/app/api/assessments/portfolio/route';
import { GET as ownerProfileGET } from '@/app/api/users/me/profile-summary/route';
import { POST as comparePOST } from '@/app/api/assessments/compare/route';
import { GET as settingsGET, POST as settingsPOST } from '@/app/api/assessments/settings/route';
import { calculateBetaComparison } from '@/domain/services/assessmentBetaComparison.service';
import originalCatalog from '@/domain/assessment/catalog/original_catalog.v0_1.json';
import { BETA_PUBLICATIONS } from '@/domain/assessment/content';
import { betaAppliedPredicate } from '@/domain/assessment/betaComparison';
import { assessmentRunsService, beginAssessmentFollowup, exportOwnerAssessmentData, getOwnerAssessmentProfile, materializeAssessment, resolveAssessmentSourceView } from '@/domain/services/assessmentRuns.service';
import { pairInviteService } from '@/domain/services/pairInvite.service';
import { pairsService } from '@/domain/services/pairs.service';
import { assessmentPublicationHash, getAssessmentPublication } from '@/domain/assessment/publication';
import type { AssessmentSettingsDTO } from '@/domain/assessment/admission';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { AssessmentPortfolioDTO, AssessmentPortfolioMutation } from '@/domain/assessment/planner';
import { DomainError } from '@/domain/errors';
import { usersService } from '@/domain/services/users.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { signJwt } from '@/lib/jwt';
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@/lib/api/response';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { ProfileSummaryDTO } from '@/lib/dto/factorProfile.dto';
import type { BetaComparisonDTO } from '@/lib/dto/assessmentBeta.dto';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentRun } from '@/models/AssessmentRun';
import { AssessmentPortfolio } from '@/models/AssessmentPortfolio';
import { AssessmentPractice } from '@/models/AssessmentPractice';
import { AssessmentJob } from '@/models/AssessmentOperations';
import { AssessmentRuntimeControl } from '@/models/AssessmentOperations';
import { assessmentTargetId, assessmentTransaction } from '@/domain/services/assessmentAccess.service';
import { User } from '@/models/User';
import { requireMatchingTestDatabaseTarget } from './lib/matching-test-database';
import { createLocalAcceptanceFixtures } from './lib/local-acceptance-fixtures';
import { prepareLocalAcceptanceBeta } from './lib/local-acceptance-beta';

const target = requireMatchingTestDatabaseTarget();
const url = new URL(target.uri);
assert.equal(url.protocol, 'mongodb:'); assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/vmeste_local_[a-f0-9]{12}_test$/); assert.equal(url.username, ''); assert.equal(url.password, '');
assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
assert.ok(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
const suffix = randomBytes(6).toString('hex');
const owner = `beta-sources-${suffix}`, other = `beta-sources-other-${suffix}`;
const cookies = new Map<string, string>();
const origin = 'http://localhost:3106';
const period = { id: `beta-august-${suffix}`, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-29T00:00:00.000Z' };
const cases: Array<{ ids: string[]; assertion: string }> = [];
let stage = 'setup';
let extraFixtures: Awaited<ReturnType<typeof createLocalAcceptanceFixtures>> | undefined;
type WithoutViewer<T> = T extends T ? Omit<T, 'viewerToken'> : never;
const request = (actor: string, path: string, payload?: object) => new NextRequest(`${origin}${path}`, { method: payload ? 'POST' : 'GET', headers: { cookie: cookies.get(actor)!, ...(payload ? { 'content-type': 'application/json', origin } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
async function body<T>(response: Response): Promise<T> {
  const result = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!result.ok) throw new Error(`HTTP_${response.status}_${result.error.code}`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); return result.data;
}
const read = (publicationId: string, actor = owner) => GET(request(actor, `/api/assessments/runs?publicationId=${publicationId}`)).then(response => body<AssessmentRunDTO>(response));
async function mutate(view: AssessmentRunDTO, mutation: WithoutViewer<AssessmentMutation>, actor = owner): Promise<AssessmentRunDTO> {
  return body<AssessmentRunDTO>(await POST(request(actor, '/api/assessments/runs', { publicationId: view.publication.id, viewerToken: view.viewerToken, ...mutation })));
}
async function fill(publicationId: string, negative = false): Promise<AssessmentRunDTO> {
  let view = await read(publicationId); const publication = getAssessmentPublication(publicationId)!;
  view = await mutate(view, { action: 'start', idempotencyKey: randomUUID(), ...(publication.metadata?.samplingFrame === 'SELECTED_DESCRIBED_EPISODES' ? { period } : {}) });
  assert.equal(view.publication.contentHash, assessmentPublicationHash(publication));
  for (const item of publication.items) {
    view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }); assert.ok(view.presentation);
    const response: AssessmentResponse = item.kind === 'OPTION' ? { kind: 'OPTION', optionId: item.options[0].id } : item.kind === 'STRUCTURED' ? { kind: 'STRUCTURED', slots: Object.fromEntries(item.slots!.map(slot => [slot.id, slot.options[0].id])) } : { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, field.id === 'planned' && negative ? false : field.id.startsWith('NEG.') ? field.id.endsWith('.eligible') || negative && field.id.startsWith('NEG.AGR.01.') : true])), episode: { observedAt: '2026-08-10T00:00:00.000Z' } };
    view = await mutate(view, { action: 'answer', presentationId: view.presentation.presentationId, response, expectedRevision: view.revision, idempotencyKey: randomUUID() });
  }
  return view;
}
const finalize = (view: AssessmentRunDTO) => mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() });
async function step(ids: string[], assertion: string, work: () => Promise<void>) { stage = assertion; await work(); cases.push({ ids, assertion }); process.stdout.write(`${JSON.stringify({ suite: 'beta-sources', status: 'passed', stage, acceptanceIds: ids })}\n`); }
async function main() {
  await mongoose.connect(target.uri, { autoIndex: false });
  for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
  const info = console.info; console.info = () => undefined;
  try { for (const actor of [owner, other]) { await usersService.upsertCurrentUserProfile({ currentUserId: actor, payload: { username: 'Проверка источников', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } }); const version = await sessionRevocationService.getOrCreateVersion(actor); cookies.set(actor, `session=${signJwt(actor, process.env.JWT_SECRET!, 3600, version)}`); await AssessmentParticipant.create({ _id: actor, environment: 'ISOLATED_SYNTHETIC', cohortId: suffix }); } } finally { console.info = info; }
  await step(['BETA-009', 'BETA-010', 'BETA-011', 'BETA-019', 'BETA-087'], 'HTTP A1+negative then independent K3 retains application and period', async () => {
    const a = await finalize(await fill('dom-s07-application-beta', true)); const before = a.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!;
    assert.equal(before.A.exactLevel, 1); assert.equal(before.CMinus.evidence.signedRate, -1);
    const k = await finalize(await fill('dom-s07-knowledge-beta')); const after = k.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!;
    assert.equal(after.K.exactLevel, 3); assert.deepEqual(after.A, before.A); assert.deepEqual(after.CMinus, before.CMinus);
    assert.deepEqual((await getOwnerAssessmentProfile(owner))?.snapshot, k.profile!.snapshot);
    const d = await finalize(await fill('dom-s07-task-beta')); assert.equal(d.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.D.exactLevel, 3);
  });
  const ownerSummary = await body<ProfileSummaryDTO>(await ownerProfileGET(request(owner, '/api/users/me/profile-summary')));
  const unavailable = ownerSummary.assessments?.unavailableSkills; assert.ok(unavailable); assert.equal(unavailable.length, 51);
  const absentDefinitions = originalCatalog.skills.filter(definition => !['DOM.S07', 'COM.S02', 'COM.S04'].includes(definition.id));
  assert.equal(absentDefinitions.length, 51);
  for (const definition of absentDefinitions) await step(['BETA-017'], `owner HTTP unavailable definition ${definition.id} preserves meaning and unknown without a level`, async () => {
    const row = unavailable.find(row => row.definition.id === definition.id); assert.ok(row);
    assert.deepEqual(row.definition, definition); assert.equal(row.availableRubric, false); assert.equal(row.status, 'UNKNOWN'); assert.equal(row.reason, 'UNAVAILABLE_RUBRIC');
    assert.equal(Object.hasOwn(row, 'exactLevel'), false); assert.equal(ownerSummary.assessments!.snapshot!.skills.some(skill => skill.skillId === definition.id), false);
  });
  await step(['BETA-020', 'BETA-021', 'BETA-094'], 'independent runs finalize concurrently; committed sources survive before materialization crash', async () => {
    const d = await fill('com-s02-task-beta'), k = await fill('com-s02-knowledge-beta');
    for (const view of [d, k]) assert.ok(view.revision > 0);
    const results = await Promise.allSettled([d, k].map(view => assessmentRunsService.mutate(owner, { action: 'finalize', publicationId: view.publication.id, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() }, { afterSourceCommitted: async () => { throw new Error('TEST_COMMIT_CRASH'); } })));
    assert.ok(results.every(result => result.status === 'rejected'));
    assert.equal(await AssessmentRun.countDocuments({ ownerId: owner, publicationId: { $in: [d.publication.id, k.publication.id] }, status: 'FINALIZED' }), 2);
    assert.ok(await AssessmentJob.countDocuments({ ownerId: owner, state: 'PENDING' }) > 0);
    await materializeAssessment(owner);
    const profile = (await getOwnerAssessmentProfile(owner))!.snapshot!; assert.equal(profile.skills.find(skill => skill.skillId === 'COM.S02')!.D.exactLevel, 3); assert.equal(profile.skills.find(skill => skill.skillId === 'COM.S02')!.K.exactLevel, 3);
    assert.equal(profile.skills.find(skill => skill.skillId === 'COM.S02')!.A.exactLevel, null);
    const portfolio = await AssessmentPortfolio.findById(owner).lean(); assert.equal(portfolio?.materializedRevision, portfolio?.sourceSetRevision);
    const taskOnly = await finalize(await fill('com-s04-task-beta'));
    assert.ok(taskOnly.profile!.snapshot!.skills.find(skill => skill.skillId === 'COM.S04')!.D.observationCount > 0);
    assert.equal(taskOnly.profile!.snapshot!.skills.find(skill => skill.skillId === 'COM.S04')!.A.exactLevel, null);
    assert.equal(betaAppliedPredicate(taskOnly.profile!.snapshot, 'COM.S04'), 'U');
  });
  await step(['BETA-010', 'BETA-014', 'BETA-018'], 'all nine registered forms use authenticated HTTP and Mongo persistence', async () => {
    for (const publication of BETA_PUBLICATIONS) { const run = await read(publication.id); if (run.status === 'NEW') await finalize(await fill(publication.id)); }
    assert.equal(await AssessmentRun.countDocuments({ ownerId: owner, status: 'FINALIZED' }), 9);
    const view = await body<AssessmentPortfolioDTO>(await portfolioGET(request(owner, '/api/assessments/portfolio'))); assert.equal(view.publications.filter(publication => publication.runStatus === 'FINALIZED').length, 9); assert.equal(view.profile.status, 'READY');
  });
  await step(['BETA-022', 'BETA-028'], 'correction replaces exactly one source and negative result; private purpose before composition', async () => {
    let view = await read('dom-s07-application-beta'); view = await mutate(view, { action: 'revise', expectedRevision: view.revision, idempotencyKey: randomUUID() }); const item = getAssessmentPublication(view.publication.id)!.items[0];
    view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'MISSING', reason: 'SKIPPED' }, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    view = await finalize(view); const skill = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!;
    assert.equal(skill.A.exactLevel, null); assert.equal(skill.A.observationCount, 3); assert.equal(skill.CMinus.evidence.yes, 3); assert.equal(skill.K.exactLevel, 3); assert.equal(skill.D.exactLevel, 3);
    assert.equal((await resolveAssessmentSourceView(owner, { purpose: 'MATCHING' })).snapshot, null);
  });
  await step(['BETA-009', 'BETA-021'], 'source-set CAS rejects source arriving after compute; viewer token bound across forms/owners', async () => {
    await AssessmentPortfolio.updateOne({ _id: owner }, { $set: { materializedRevision: -1 } });
    await assert.rejects(materializeAssessment(owner, { afterComputed: async () => { const view = await read('com-s02-task-beta'); await assessmentRunsService.mutate(owner, { publicationId: view.publication.id, action: 'matching-permission', matchingUse: true, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() }, { afterSourceCommitted: async () => { throw new Error('TEST_COMMIT_CRASH'); } }).catch(error => { assert.equal((error as Error).message, 'TEST_COMMIT_CRASH'); }); } }), error => error instanceof DomainError && error.code === 'SOURCE_STALE');
    await materializeAssessment(owner);
    const a = await read('dom-s07-task-beta'), b = await read('com-s02-task-beta');
    const mismatch = await POST(request(owner, '/api/assessments/runs', { action: 'revise', publicationId: b.publication.id, viewerToken: a.viewerToken, expectedRevision: b.revision, idempotencyKey: randomUUID() })); assert.equal(mismatch.status, 409);
    const foreign = await POST(request(other, '/api/assessments/runs', { action: 'start', publicationId: a.publication.id, viewerToken: a.viewerToken, idempotencyKey: randomUUID() })); assert.equal(foreign.status, 409);
    let otherK = await read('dom-s07-knowledge-beta', other), otherD = await read('dom-s07-task-beta', other);
    otherK = await mutate(otherK, { action: 'start', idempotencyKey: randomUUID() }, other); otherD = await mutate(otherD, { action: 'start', idempotencyKey: randomUUID() }, other);
    const knowledge = getAssessmentPublication(otherK.publication.id)!.items[0]; otherK = await mutate(otherK, { action: 'present', itemId: knowledge.id, expectedRevision: otherK.revision, idempotencyKey: randomUUID() }, other);
    const swapped = await POST(request(other, '/api/assessments/runs', { action: 'answer', publicationId: otherD.publication.id, viewerToken: otherD.viewerToken, expectedRevision: otherD.revision, presentationId: otherK.presentation!.presentationId, response: { kind: 'OPTION', optionId: knowledge.options[0].id }, idempotencyKey: randomUUID() }));
    assert.equal(swapped.status, 409); assert.equal((await read(otherD.publication.id, other)).answers.length, 0);
  });
  await step(['BETA-036'], 'HTTP STRUCTURED parent replacement removes child answer and issued receipt permanently', async () => {
    let view = await read('dom-s07-task-beta', other); const published = getAssessmentPublication(view.publication.id)!;
    const parent = published.items[0], child = published.items[1];
    const response = (item: typeof parent): AssessmentResponse => ({ kind: 'STRUCTURED', slots: Object.fromEntries(item.slots!.map(slot => [slot.id, slot.options[0].id])) });
    view = await mutate(view, { action: 'present', itemId: parent.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: response(parent), expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    view = await mutate(view, { action: 'present', itemId: child.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    const childReceipt = view.presentation!.presentationId;
    view = await mutate(view, { action: 'answer', presentationId: childReceipt, response: response(child), expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    assert.ok(view.answers.some(answer => answer.itemId === child.id));
    view = await mutate(view, { action: 'present', itemId: parent.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'MISSING', reason: 'NO_OPPORTUNITY' }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    assert.equal(view.items.find(item => item.id === child.id)?.available, false); assert.equal(view.answers.some(answer => answer.itemId === child.id), false);
    view = await mutate(view, { action: 'present', itemId: parent.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: response(parent), expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    assert.equal(view.items.find(item => item.id === child.id)?.available, true); assert.equal(view.answers.some(answer => answer.itemId === child.id), false);
    const stale = await POST(request(other, '/api/assessments/runs', { action: 'answer', publicationId: view.publication.id, viewerToken: view.viewerToken, expectedRevision: view.revision, presentationId: childReceipt, response: response(child), idempotencyKey: randomUUID() }));
    assert.equal(stale.status, 409);
    const persisted = await AssessmentRun.findOne({ ownerId: other, publicationId: published.id }).lean();
    assert.equal(persisted?.presentations.some(receipt => receipt.presentationId === childReceipt), false); assert.equal(persisted?.answers.some(answer => answer.itemId === child.id), false);
  });
  await step(['BETA-030'], 'explanation in one publication marks later form answers assisted', async () => {
    let k = await read('dom-s07-knowledge-beta', other); const item = getAssessmentPublication(k.publication.id)!.items[0];
    k = await mutate(k, { action: 'hint', itemId: item.id, expectedRevision: k.revision, idempotencyKey: randomUUID() }, other); assert.equal(k.presentation!.phase, 'ASSISTED');
    let a = await read('dom-s07-application-beta', other); a = await mutate(a, { action: 'start', period, idempotencyKey: randomUUID() }, other);
    a = await mutate(a, { action: 'present', itemId: getAssessmentPublication(a.publication.id)!.items[0].id, expectedRevision: a.revision, idempotencyKey: randomUUID() }, other); assert.equal(a.presentation!.phase, 'ASSISTED');
  });
  await step(['BETA-023', 'BETA-088'], 'owner episode reference deduplicates real saved answers and unknown eligibility keeps occurrence without exact rate', async () => {
    let view = await read('dom-s07-application-beta', other); const published = getAssessmentPublication(view.publication.id)!;
    const first = published.items[0];
    view = await mutate(view, { action: 'present', itemId: first.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    const values = Object.fromEntries(first.fields.map(field => [field.id, field.id === 'NEG.AGR.01.eligible' ? null : true]));
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'FACTS', values, episode: { observedAt: '2026-08-10T00:00:00.000Z' } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    view = await mutate(view, { action: 'present', itemId: published.items[1].id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    const episode = view.knownEpisodes?.[0]; assert.ok(episode); assert.equal(episode.observedAt, '2026-08-10T00:00:00.000Z');
    const invalid = await POST(request(other, '/api/assessments/runs', { action: 'answer', publicationId: view.publication.id, viewerToken: view.viewerToken, expectedRevision: view.revision, presentationId: view.presentation!.presentationId, response: { kind: 'FACTS', values, episode: { observedAt: episode.observedAt, sameEpisodeRootId: `${owner}:foreign-root` } }, idempotencyKey: randomUUID() }));
    assert.equal(invalid.status, 400);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'FACTS', values, episode: { observedAt: episode.observedAt, sameEpisodeRootId: episode.rootId } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    for (const item of published.items.slice(2)) { view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other); view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'MISSING', reason: 'NO_OPPORTUNITY' }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, other); }
    view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, other);
    const skill = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!;
    assert.equal(skill.A.observationCount, 1); assert.equal(skill.A.result.criteria[0].evidence.denominator, 1);
    assert.equal(skill.CMinus.evidence.unknownEligibility, 1);
    assert.equal(skill.CMinus.occurrenceState, 'REPORTED_OCCURRENCE'); assert.equal(skill.CMinus.evidence.signedRate, null);
  });
  await step(['BETA-031'], 'deleting explanation source erases payload and new publication declares unknown exposure origin', async () => {
    const old = await read('dom-s07-knowledge-beta', other);
    assert.ok((await AssessmentPortfolio.findById(other).lean())?.exposures.some(exposure => exposure.publicationId === old.publication.id));
    await mutate(old, { action: 'delete', expectedRevision: old.revision, idempotencyKey: randomUUID() }, other);
    const erased = await AssessmentRun.findOne({ ownerId: other, publicationId: old.publication.id }).lean();
    assert.equal(erased?.answers.length, 0); assert.equal(erased?.assistedItemIds.length, 0);
    assert.equal((await AssessmentPortfolio.findById(other).lean())?.exposures.some(exposure => exposure.publicationId === old.publication.id), false);
    let fresh = await read('com-s04-knowledge-beta', other);
    fresh = await mutate(fresh, { action: 'start', idempotencyKey: randomUUID() }, other);
    assert.equal(fresh.exposureHistory, 'UNKNOWN_AFTER_DELETION');
    fresh = await mutate(fresh, { action: 'present', itemId: getAssessmentPublication(fresh.publication.id)!.items[0].id, expectedRevision: fresh.revision, idempotencyKey: randomUUID() }, other);
    assert.equal(fresh.presentation!.phase, 'ASSISTED'); assert.ok(fresh.presentation!.hint);
  });
  await step(['BETA-011', 'BETA-028'], 'operator publication stop excludes source before evaluation and retains controls/export', async () => {
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $setOnInsert: { recoveryReconciled: true }, $addToSet: { disabledPublicationIds: 'dom-s07-knowledge-beta' } }, { upsert: true });
    try {
      const retired = await GET(request(owner, '/api/assessments/runs?publicationId=dom-s07-knowledge-beta'));
      assert.equal(retired.status, 409);
      const filtered = await getOwnerAssessmentProfile(owner);
      assert.equal(filtered!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.K.exactLevel, null);
      const controls = await body<AssessmentRunDTO>(await GET(request(owner, '/api/assessments/runs?publicationId=dom-s07-knowledge-beta&view=controls')));
      assert.equal(controls.answers.length, 0);
      assert.ok((await exportOwnerAssessmentData(owner))?.runs.find(run => run.publicationId === 'dom-s07-knowledge-beta'));
    } finally { await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $pull: { disabledPublicationIds: 'dom-s07-knowledge-beta' } }); }
  });
  await step(['BETA-035', 'BETA-038'], 'goal and persisted practice/report change no actual source set', async () => {
    let view = await body<AssessmentPortfolioDTO>(await portfolioGET(request(owner, '/api/assessments/portfolio')));
    const change = async (mutation: WithoutViewer<AssessmentPortfolioMutation>) => body<AssessmentPortfolioDTO>(await portfolioPOST(request(owner, '/api/assessments/portfolio', { ...mutation, viewerToken: view.viewerToken })));
    view = await change({ action: 'goal', goal: 'COUPLE', expectedRevision: view.revision, idempotencyKey: randomUUID() }); assert.equal(view.goal, 'COUPLE');
    const before = await resolveAssessmentSourceView(owner, { purpose: 'OWNER' });
    view = await change({ action: 'practice-start', skillId: 'COM.S04', goal: 'Подготовить личную фразу паузы', mode: 'SOLO_REHEARSAL', expectedRevision: view.revision, idempotencyKey: randomUUID() });
    const practice = view.practices[0]; assert.equal(practice.status, 'STARTED');
    view = await change({ action: 'practice-report', practiceId: practice.id, practiceRevision: practice.revision, status: 'ATTEMPTED', note: 'Личная репетиция', observedAt: null, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    assert.equal(view.practices[0].status, 'ATTEMPTED'); assert.equal(await AssessmentPractice.countDocuments({ ownerId: owner }), 1);
    const after = await resolveAssessmentSourceView(owner, { purpose: 'OWNER' }); assert.equal(after.sourceSetRevision, before.sourceSetRevision); assert.equal(after.sourceSetIdentity, before.sourceSetIdentity); assert.deepEqual(after.snapshot, before.snapshot);
  });
  await step(['BETA-024', 'BETA-025'], 'unfinished followup preserves A then completed unknown new window is unknown with history', async () => {
    let view = await read('com-s02-application-beta'); const before = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'COM.S02')!.A;
    view = await mutate(view, { action: 'followup', period: { id: `beta-september-${suffix}`, startsAt: '2026-08-29T00:00:00.000Z', endsAt: '2026-09-09T00:00:00.000Z' }, expectedRevision: view.revision, idempotencyKey: randomUUID() });
    assert.deepEqual(view.profile!.snapshot!.skills.find(skill => skill.skillId === 'COM.S02')!.A, before);
    for (const item of getAssessmentPublication(view.publication.id)!.items) { view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }); view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'MISSING', reason: 'NO_OPPORTUNITY' }, expectedRevision: view.revision, idempotencyKey: randomUUID() }); }
    view = await finalize(view); const after = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'COM.S02')!.A; assert.equal(after.exactLevel, null); assert.equal(after.history?.length, 2); assert.equal(after.history?.[1].exactLevel, 3);
  });
  await step(['BETA-029'], 'OFF keeps owner export and scoped deletion controls', async () => {
    process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'false'; const oldMode = process.env.ASSESSMENT_MODE; process.env.ASSESSMENT_MODE = 'OFF';
    try { const exported = await exportOwnerAssessmentData(owner); assert.equal(exported?.runs.length, 9); assert.equal(exported?.practices.length, 1); const controls = await body<AssessmentRunDTO>(await GET(request(owner, '/api/assessments/runs?publicationId=dom-s07-knowledge-beta&view=controls'))); assert.equal(controls.answers.length, 0); const removed = await mutate(controls, { action: 'delete', expectedRevision: controls.revision, idempotencyKey: randomUUID() }); assert.equal(removed.status, 'DELETED'); assert.equal((await exportOwnerAssessmentData(owner))?.runs.length, 8); } finally { process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'true'; if (oldMode === undefined) delete process.env.ASSESSMENT_MODE; else process.env.ASSESSMENT_MODE = oldMode; }
  });
  await step(['BETA-038', 'BETA-039'], 'HTTP practice report then new real self report changes profile and invalidates prepared beta conditional result', async () => {
    const ownedRunId = /^\/vmeste_local_([a-f0-9]{12})_test$/.exec(url.pathname)![1];
    const previousInfo = console.info; console.info = () => undefined;
    try { extraFixtures = await createLocalAcceptanceFixtures(ownedRunId, 'assessment'); } finally { console.info = previousInfo; }
    await prepareLocalAcceptanceBeta(extraFixtures.subjects, ownedRunId);
    const a = extraFixtures.subjects.a, b = extraFixtures.subjects.b;
    cookies.set(a, extraFixtures.sessionCookie('a').split(';')[0]); cookies.set(b, extraFixtures.sessionCookie('b').split(';')[0]);
    const compare = async (actionIds: string[]) => body<BetaComparisonDTO>(await comparePOST(request(a, '/api/assessments/compare', { actionIds })));
    const before = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId: extraFixtures.assessmentPairId! });
    assert.equal(before.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 1);
    const oldJoint = await compare(['JOINT_SCHEDULE']); assert.ok(oldJoint.scenarios.every(scenario => scenario.result.status !== 'TARGET_SUPPORTED'));
    const oldConditional = await compare(['B_CRITERION', 'JOINT_SCHEDULE']); assert.ok(oldConditional.scenarios.some(scenario => scenario.result.status === 'TARGET_SUPPORTED'));
    const oldMatching = await calculateBetaComparison(a, b, ['B_CRITERION', 'JOINT_SCHEDULE']); assert.equal(oldMatching.availability, 'AVAILABLE');
    let portfolio = await body<AssessmentPortfolioDTO>(await portfolioGET(request(b, '/api/assessments/portfolio')));
    portfolio = await body<AssessmentPortfolioDTO>(await portfolioPOST(request(b, '/api/assessments/portfolio', { action: 'practice-start', skillId: 'DOM.S07', mode: 'OWN_ACTION', goal: 'Личный бытовой цикл', viewerToken: portfolio.viewerToken, expectedRevision: portfolio.revision, idempotencyKey: randomUUID() })));
    const practice = portfolio.practices[0];
    portfolio = await body<AssessmentPortfolioDTO>(await portfolioPOST(request(b, '/api/assessments/portfolio', { action: 'practice-report', practiceId: practice.id, practiceRevision: practice.revision, status: 'ATTEMPTED', note: 'Собственная попытка; измерение отдельно', observedAt: null, viewerToken: portfolio.viewerToken, expectedRevision: portfolio.revision, idempotencyKey: randomUUID() })));
    assert.equal(portfolio.practices[0].status, 'ATTEMPTED');
    const practiced = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId: extraFixtures.assessmentPairId! });
    assert.equal(practiced.sourceSetIdentity, before.sourceSetIdentity); assert.deepEqual(await compare(['B_CRITERION', 'JOINT_SCHEDULE']), oldConditional);
    assert.deepEqual(await calculateBetaComparison(a, b, ['B_CRITERION', 'JOINT_SCHEDULE']), oldMatching);
    await assert.rejects(() => calculateBetaComparison(a, null, ['B_CRITERION', 'JOINT_SCHEDULE'], false, { afterPrepared: async () => {
      const publicationId = 'dom-s07-application-beta', publication = getAssessmentPublication(publicationId)!;
      let view = await read(publicationId, b);
      const nextPeriod = { id: `after-practice-${suffix}`, startsAt: view.period!.endsAt, endsAt: new Date().toISOString() };
      assert.ok(Date.parse(practice.startedAt) < Date.parse(nextPeriod.endsAt));
      view = await mutate(view, { action: 'followup', period: nextPeriod, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
      for (const item of publication.items) {
        view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
        view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, field.id.startsWith('NEG.') ? field.id.endsWith('.eligible') : true])), episode: { observedAt: practice.startedAt } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
      }
      view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
      const applied = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A;
      assert.equal(applied.exactLevel, 3); assert.equal(applied.phase, 'FOLLOWUP'); assert.equal(applied.provenance?.period.id, nextPeriod.id);
    } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    const after = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId: extraFixtures.assessmentPairId! });
    assert.notEqual(after.sourceSetIdentity, before.sourceSetIdentity);
    const actualSummary = await body<ProfileSummaryDTO>(await ownerProfileGET(request(b, '/api/users/me/profile-summary')));
    assert.equal(actualSummary.assessments!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 3);
    assert.ok((await compare(['JOINT_SCHEDULE'])).scenarios.some(scenario => scenario.result.status === 'TARGET_SUPPORTED'));
  });
  await step(['BETA-068', 'BETA-084', 'BETA-087'], 'permitted beta source private NEG correction preserves external identity and full comparison through draft answer finalize', async () => {
    assert.ok(extraFixtures);
    const a = extraFixtures.subjects.a, b = extraFixtures.subjects.b, relationshipId = extraFixtures.assessmentPairId!;
    const publicationId = 'dom-s07-application-beta', publication = getAssessmentPublication(publicationId)!;
    const compare = async () => body<BetaComparisonDTO>(await comparePOST(request(a, '/api/assessments/compare', { actionIds: ['JOINT_SCHEDULE'] })));
    let view = await read(publicationId, b); assert.equal(view.status, 'FINALIZED');
    const beforePair = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId });
    const beforeMatching = await resolveAssessmentSourceView(b, { purpose: 'MATCHING' });
    const beforeDTO = await compare(); assert.equal(beforeDTO.availability, 'AVAILABLE');
    const beforeRevision = view.revision;
    const assertUnchanged = async () => {
      const pair = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId });
      const matching = await resolveAssessmentSourceView(b, { purpose: 'MATCHING' });
      assert.equal(pair.sourceSetIdentity, beforePair.sourceSetIdentity); assert.equal(matching.sourceSetIdentity, beforeMatching.sourceSetIdentity);
      assert.equal(pair.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.provenance?.componentVersion, beforePair.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.provenance?.componentVersion);
      assert.deepEqual(await compare(), beforeDTO);
    };
    view = await mutate(view, { action: 'revise', expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
    assert.equal(view.retainedCompletedSource, 'CORRECTION'); await assertUnchanged();
    const held = await AssessmentRun.findOne({ ownerId: b, publicationId }).lean(); assert.equal(held?.previousSource?.revision, beforeRevision);
    for (const item of publication.items) {
      const previous = view.answers.find(answer => answer.itemId === item.id)!.response; assert.equal(previous.kind, 'FACTS'); if (previous.kind !== 'FACTS') throw new Error('FACTS_FIXTURE_REQUIRED');
      view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b); await assertUnchanged();
      view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { ...previous, values: Object.fromEntries(Object.entries(previous.values).map(([key, value]) => [key, key.startsWith('NEG.AGR.01.') ? true : value])) }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b); await assertUnchanged();
    }
    const prepared = await calculateBetaComparison(a, null, ['JOINT_SCHEDULE'], false, { afterPrepared: async () => { view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, b); } });
    assert.deepEqual(prepared, beforeDTO); await assertUnchanged();
    assert.equal(view.retainedCompletedSource, undefined);
    const ownerSkill = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!;
    assert.equal(ownerSkill.A.exactLevel, 3); assert.equal(ownerSkill.CMinus.evidence.signedRate, -1);
    const committed = await AssessmentRun.findOne({ ownerId: b, publicationId }).lean(); assert.equal(committed?.previousSource, null); assert.ok(committed!.revision > beforeRevision);
  });
  await step(['BETA-022', 'BETA-060'], 'positive beta correction keeps prior source while draft then replaces actual evidence and stales prepared comparison', async () => {
    assert.ok(extraFixtures);
    const a = extraFixtures.subjects.a, b = extraFixtures.subjects.b, relationshipId = extraFixtures.assessmentPairId!;
    const publicationId = 'dom-s07-application-beta', publication = getAssessmentPublication(publicationId)!;
    const before = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId });
    let view = await read(publicationId, b);
    await assert.rejects(() => calculateBetaComparison(a, null, ['JOINT_SCHEDULE'], false, { afterPrepared: async () => {
      view = await mutate(view, { action: 'revise', expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
      assert.equal(view.retainedCompletedSource, 'CORRECTION');
      for (const item of publication.items) {
        const previous = view.answers.find(answer => answer.itemId === item.id)!.response; assert.equal(previous.kind, 'FACTS'); if (previous.kind !== 'FACTS') throw new Error('FACTS_FIXTURE_REQUIRED');
        view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
        view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { ...previous, values: { ...previous.values, planned: false } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
      }
      const draft = await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId }); assert.equal(draft.sourceSetIdentity, before.sourceSetIdentity);
      view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, b);
    } }), (error: Error) => error instanceof DomainError && error.code === 'ASSESSMENT_COMPARISON_STALE');
    assert.equal(view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 1);
    assert.notEqual((await resolveAssessmentSourceView(b, { purpose: 'PAIR', relationshipId })).sourceSetIdentity, before.sourceSetIdentity);
    const fresh = await body<BetaComparisonDTO>(await comparePOST(request(a, '/api/assessments/compare', { actionIds: ['JOINT_SCHEDULE'] })));
    assert.ok(fresh.scenarios.every(scenario => scenario.result.status !== 'TARGET_SUPPORTED'));
  });
  await step(['BETA-009', 'BETA-023', 'BETA-082'], 'explicit scope expansion opens real supplementary form and two publications count one referenced episode once', async () => {
    assert.ok(extraFixtures); const actor = extraFixtures.subjects.a;
    const publicationId = 'dom-s07-application-clarification-beta';
    let settings = await body<AssessmentSettingsDTO>(await settingsGET(request(actor, '/api/assessments/settings')));
    const originalScope = settings.settings.publicationIds.filter(id => id !== publicationId);
    settings = await body<AssessmentSettingsDTO>(await settingsPOST(request(actor, '/api/assessments/settings', { ...settings.settings, publicationIds: originalScope, viewerToken: settings.viewerToken, expectedRevision: settings.revision })));
    assert.equal((await GET(request(actor, `/api/assessments/runs?publicationId=${publicationId}`))).status, 403);
    const hidden = await body<AssessmentPortfolioDTO>(await portfolioGET(request(actor, '/api/assessments/portfolio'))); assert.equal(hidden.publications.some(publication => publication.id === publicationId), false);
    settings = await body<AssessmentSettingsDTO>(await settingsGET(request(actor, '/api/assessments/settings')));
    assert.equal(settings.settings.publicationIds.includes(publicationId), false); assert.equal(settings.availablePublicationIds.includes(publicationId), true);
    await body<AssessmentSettingsDTO>(await settingsPOST(request(actor, '/api/assessments/settings', { ...settings.settings, publicationIds: [...settings.settings.publicationIds, publicationId], viewerToken: settings.viewerToken, expectedRevision: settings.revision })));
    const base = await read('dom-s07-application-beta', actor), basePublication = getAssessmentPublication(base.publication.id)!;
    const baseline = base.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A;
    assert.equal(baseline.observationCount, 4); assert.equal(baseline.result.criteria[0].evidence.assessedFamilies.length, 2);
    let view = await read(publicationId, actor); const published = getAssessmentPublication(publicationId)!;
    view = await mutate(view, { action: 'start', period: base.period!, idempotencyKey: randomUUID() }, actor);
    assert.notEqual(view.runId, base.runId); assert.notEqual(view.publication.contentHash, base.publication.contentHash);
    view = await mutate(view, { action: 'present', itemId: published.items[0].id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    const previous = base.answers.find(answer => answer.itemId === basePublication.items[0].id)!.response;
    assert.equal(previous.kind, 'FACTS'); if (previous.kind !== 'FACTS' || !previous.episode) throw new Error('FACTS_FIXTURE_REQUIRED');
    const reference = view.knownEpisodes?.find(episode => episode.label === basePublication.items[0].title); assert.ok(reference);
    assert.equal(reference.publicationTitle, base.publication.title);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { ...previous, episode: { observedAt: reference.observedAt, sameEpisodeRootId: reference.rootId } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await mutate(view, { action: 'present', itemId: published.items[1].id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'MISSING', reason: 'NO_OPPORTUNITY' }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    const combined = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A;
    assert.equal(combined.observationCount, 4); assert.equal(combined.result.criteria[0].evidence.denominator, 4); assert.equal(combined.result.criteria[0].evidence.assessedFamilies.length, 2); assert.equal(combined.exactLevel, baseline.exactLevel);
    assert.equal(combined.provenance?.sourceIds.length, 2); assert.equal((await read(base.publication.id, actor)).revision, base.revision);
  });
  await step(['BETA-023', 'BETA-028', 'BETA-084'], 'real private cross-publication counterexample changes owner composition but permitted pair and matching remain unchanged', async () => {
    assert.ok(extraFixtures); const actor = extraFixtures.subjects.a, relationshipId = extraFixtures.assessmentPairId!;
    let view = await read('dom-s07-application-clarification-beta', actor);
    view = await mutate(view, { action: 'permission', pairUse: false, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await mutate(view, { action: 'matching-permission', matchingUse: false, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await read(view.publication.id, actor);
    const before = await resolveAssessmentSourceView(actor, { purpose: 'MATCHING' });
    const comparison = await body<BetaComparisonDTO>(await comparePOST(request(actor, '/api/assessments/compare', { actionIds: ['B_CRITERION', 'JOINT_SCHEDULE'] })));
    view = await mutate(view, { action: 'revise', expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    const item = getAssessmentPublication(view.publication.id)!.items[0], old = view.answers.find(answer => answer.itemId === item.id)!.response;
    assert.equal(old.kind, 'FACTS'); if (old.kind !== 'FACTS') throw new Error('FACTS_FIXTURE_REQUIRED');
    view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { ...old, values: { ...old.values, planned: false } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    const ownerApplied = view.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A;
    assert.equal(ownerApplied.observationCount, 4); assert.equal(ownerApplied.exactLevel, null); assert.ok(ownerApplied.provenance!.disputedFactCount > 0);
    const external = await resolveAssessmentSourceView(actor, { purpose: 'MATCHING' }); assert.equal(external.sourceSetIdentity, before.sourceSetIdentity); assert.equal(external.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 3);
    assert.equal((await resolveAssessmentSourceView(actor, { purpose: 'PAIR', relationshipId })).snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 3);
    assert.deepEqual(await body<BetaComparisonDTO>(await comparePOST(request(actor, '/api/assessments/compare', { actionIds: ['B_CRITERION', 'JOINT_SCHEDULE'] }))), comparison);
  });
  await step(['BETA-027'], 'real original and beta DOM sources with same period remain separate incompatible instrument scopes', async () => {
    assert.ok(extraFixtures); const actor = extraFixtures.subjects.a;
    const beta = await read('dom-s07-application-beta', actor), publication = getAssessmentPublication('dom-s07-household-pilot')!;
    let legacy = await read(publication.id, actor);
    legacy = await mutate(legacy, { action: 'start', period: beta.period!, idempotencyKey: randomUUID() }, actor);
    for (const item of publication.items) {
      legacy = await mutate(legacy, { action: 'present', itemId: item.id, expectedRevision: legacy.revision, idempotencyKey: randomUUID() }, actor);
      const response: AssessmentResponse = item.kind === 'OPTION' ? { kind: 'OPTION', optionId: item.options[0].id } : { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, field.id.startsWith('NEG.') ? field.id.endsWith('.eligible') : true])), episode: { observedAt: beta.knownEpisodes![0].observedAt } };
      legacy = await mutate(legacy, { action: 'answer', presentationId: legacy.presentation!.presentationId, response, expectedRevision: legacy.revision, idempotencyKey: randomUUID() }, actor);
    }
    legacy = await mutate(legacy, { action: 'finalize', expectedRevision: legacy.revision, idempotencyKey: randomUUID() }, actor);
    const applied = legacy.profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A;
    assert.equal(applied.observationCount, 4); assert.equal(applied.history?.length, 2); assert.equal(applied.history?.filter(entry => !entry.comparable).length, 1);
    assert.notEqual(publication.contextKey, getAssessmentPublication(beta.publication.id)!.contextKey);
    const supplementary = await read('dom-s07-application-clarification-beta', actor);
    assert.equal(supplementary.knownEpisodes?.some(episode => episode.publicationTitle === legacy.publication.title), false);
  });
  await step(['BETA-011'], 'saved publication hash mismatch stops owner HTTP instead of silently substituting current content', async () => {
    assert.ok(extraFixtures); const actor = extraFixtures.subjects.a, publicationId = 'dom-s07-household-pilot';
    const saved = await AssessmentRun.findOne({ ownerId: actor, publicationId }).lean(); assert.ok(saved);
    try {
      await AssessmentRun.updateOne({ _id: saved._id }, { $set: { contentHash: '0'.repeat(64) } });
      const response = await GET(request(actor, `/api/assessments/runs?publicationId=${publicationId}`));
      assert.equal(response.status, 409); const rejected = await response.json() as ApiErrorEnvelope; assert.equal(rejected.error.code, 'CONTENT_VERSION_UNAVAILABLE');
      const unchanged = await AssessmentRun.findById(saved._id).lean(); assert.equal(unchanged?.revision, saved.revision); assert.deepEqual(unchanged?.answers, saved.answers);
      assert.ok((await exportOwnerAssessmentData(actor))?.runs.some(run => run.publicationId === publicationId));
    } finally { await AssessmentRun.updateOne({ _id: saved._id }, { $set: { contentHash: saved.contentHash } }); }
  });
  await step(['BETA-029'], 'deleting current original source cannot fall back to restricted beta source or private clarification', async () => {
    assert.ok(extraFixtures); const actor = extraFixtures.subjects.a;
    let beta = await read('dom-s07-application-beta', actor);
    beta = await mutate(beta, { action: 'permission', pairUse: false, expectedRevision: beta.revision, idempotencyKey: randomUUID() }, actor);
    await mutate(beta, { action: 'matching-permission', matchingUse: false, expectedRevision: beta.revision, idempotencyKey: randomUUID() }, actor);
    assert.ok((await resolveAssessmentSourceView(actor, { purpose: 'MATCHING' })).snapshot);
    let original = await read('dom-s07-household-pilot', actor);
    original = await mutate(original, { action: 'delete', expectedRevision: original.revision, idempotencyKey: randomUUID() }, actor); assert.equal(original.status, 'DELETED');
    assert.equal((await resolveAssessmentSourceView(actor, { purpose: 'MATCHING' })).snapshot, null);
    assert.equal((await resolveAssessmentSourceView(actor, { purpose: 'PAIR', relationshipId: extraFixtures.assessmentPairId! })).snapshot, null);
    assert.ok((await getOwnerAssessmentProfile(actor))?.snapshot); assert.equal(await AssessmentRun.countDocuments({ ownerId: actor, status: 'FINALIZED' }), 2);
  });
  await step(['BETA-026'], 'actual Pair replacement excludes prior pair scoped HTTP completed application from new pair and discovery', async () => {
    assert.ok(extraFixtures); const actor = extraFixtures.subjects.b, peer = extraFixtures.subjects.a, oldPair = extraFixtures.assessmentPairId!, publicationId = 'dom-s07-application-beta';
    const priorIndividual = await read(publicationId, actor);
    await assessmentTransaction(session => beginAssessmentFollowup(actor, session, new Date(), publicationId, oldPair));
    let view = await read(publicationId, actor);
    const observedAt = new Date((Date.parse(view.period!.startsAt) + Date.parse(view.period!.endsAt)) / 2).toISOString();
    for (const item of getAssessmentPublication(publicationId)!.items) {
      view = await mutate(view, { action: 'present', itemId: item.id, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
      view = await mutate(view, { action: 'answer', presentationId: view.presentation!.presentationId, response: { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, field.id.startsWith('NEG.') ? field.id.endsWith('.eligible') : true])), episode: { observedAt } }, expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    }
    view = await mutate(view, { action: 'finalize', expectedRevision: view.revision, idempotencyKey: randomUUID() }, actor);
    assert.equal((await resolveAssessmentSourceView(actor, { purpose: 'PAIR', relationshipId: oldPair })).snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 3);
    await pairsService.endPair({ pairId: oldPair, currentUserId: actor });
    const issued = await pairInviteService.create({ currentUserId: actor });
    await pairInviteService.accept({ currentUserId: peer, token: issued.token });
    const waiting = await pairInviteService.ownerStatus({ currentUserId: actor, inviteId: issued.invite.id }); assert.ok(waiting.partner?.publicId);
    const formed = await pairInviteService.confirm({ currentUserId: actor, inviteId: issued.invite.id, partnerPublicId: waiting.partner.publicId });
    assert.notEqual(formed.pairId, oldPair); extraFixtures.assessmentPairId = formed.pairId;
    for (const options of [{ purpose: 'PAIR' as const, relationshipId: formed.pairId }, { purpose: 'MATCHING' as const }]) {
      const allowed = (await resolveAssessmentSourceView(actor, options)).snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A;
      assert.equal(allowed.provenance?.contextIdentity, 'INDIVIDUAL'); assert.deepEqual(allowed.provenance?.period, priorIndividual.period);
      assert.ok(allowed.history!.every(entry => entry.contextIdentity === 'INDIVIDUAL')); assert.notEqual(allowed.provenance!.period.id, view.period!.id);
    }
    assert.equal((await read(publicationId, actor)).profile!.snapshot!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 3);
    const compared = await body<BetaComparisonDTO>(await comparePOST(request(actor, '/api/assessments/compare', { actionIds: [] })));
    assert.notEqual(compared.current?.status, 'TARGET_SUPPORTED');
  });
  process.stdout.write(`${JSON.stringify({ suite: 'beta-sources', status: 'passed', checks: cases.length, cases })}\n`);
}
void main().catch((error: Error) => { const location = /beta-sources\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1] ?? 'unknown'; const code = error instanceof DomainError ? error.code : /^HTTP_[A-Z_0-9]+$/.test(error.message) ? error.message : error.name; process.stdout.write(`${JSON.stringify({ suite: 'beta-sources', status: 'failed', stage: `${stage} ${code} line ${location}`, code, location })}\n`); process.exitCode = 1; }).finally(async () => { await User.deleteMany({ id: { $in: [owner, other] } }).catch(() => undefined); if (extraFixtures) await extraFixtures.cleanup(); else await mongoose.disconnect(); });
