import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/assessments/dom-s07/route';
import { POST as legacyPost } from '@/app/api/measurements/[key]/route';
import { DOM_S07_PUBLICATION } from '@/domain/assessment/publication';
import type { AssessmentItem, AssessmentResponse } from '@/domain/assessment/contracts';
import { DomainError } from '@/domain/errors';
import { assessmentRunsService, materializeAssessment } from '@/domain/services/assessmentRuns.service';
import { getOwnerFactorProfileSummary } from '@/domain/services/factorProfileSummary.service';
import { productWorkspacePrivacy } from '@/domain/services/productWorkspacePrivacy.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { usersService } from '@/domain/services/users.service';
import { signJwt } from '@/lib/jwt';
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@/lib/api/response';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { MeasurementMutation, MeasurementTestDTO } from '@/lib/dto/measurementTests.dto';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentOperation, AssessmentRun } from '@/models/AssessmentRun';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { MeasurementTestSession } from '@/models/MeasurementTestSession';
import { User } from '@/models/User';
import { requireMatchingTestDatabaseTarget } from './lib/matching-test-database';
import type { WithoutAssessmentIntent } from './lib/assessment-test-intent';

// This runner accepts only the exact disposable replica set owned by
// local-acceptance.ts. It never loads dotenv, creates an impersonation endpoint,
// uses production credentials or drops an externally supplied database.
const target = requireMatchingTestDatabaseTarget();
const uri = new URL(target.uri);
const ownedRun = /^\/vmeste_local_([a-f0-9]{12})_test$/.exec(uri.pathname)?.[1];
assert.ok(ownedRun);
assert.equal(uri.protocol, 'mongodb:');
assert.equal(uri.hostname, '127.0.0.1');
assert.equal(uri.username, '');
assert.equal(uri.password, '');
assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${ownedRun}`);
assert.equal(process.env.MONGODB_URI, target.uri);
assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
const secret = process.env.JWT_SECRET;
assert.ok(secret && secret.length >= 32);
const suffix = randomBytes(6).toString('hex');
const subjects = Object.fromEntries(['a', 'b', 'pending', 'stale', 'deleted', 'legacy', 'unlisted'].map(role => [role, `assessment-${suffix}-${role}`]));
const cookies = new Map<string, string>();
const viewerTokens = new Map<string, string>();
type OwnerMutation = WithoutAssessmentIntent<AssessmentMutation>;
// NextRequest canonicalizes 127.0.0.1 URLs to localhost. Use the actual request
// authority for same-origin cookies while MongoDB remains literal loopback.
const origin = 'http://localhost:3106';
let stage = 'setup';
const completedIds = new Set<string>();
const report = (status: 'running' | 'passed' | 'failed', ids: readonly string[] = []) => {
  process.stdout.write(`${JSON.stringify({ suite: 'assessment', stage, status, acceptanceIds: ids, completedCases: completedIds.size })}\n`);
};
const step = async (ids: string[], label: string, work: () => Promise<void>): Promise<void> => {
  stage = `${ids.join(' ')} ${label}`.slice(0, 80);
  report('running', ids);
  await work();
  ids.forEach(id => completedIds.add(id));
  report('passed', ids);
};
const key = () => randomUUID();
const request = (owner: string | null, payload?: object, query = '', suppliedOrigin = origin) => new NextRequest(`${origin}/api/assessments/dom-s07${query}`, {
  method: payload ? 'POST' : 'GET',
  headers: { ...(owner ? { cookie: cookies.get(owner)! } : {}), ...(payload ? { 'content-type': 'application/json', origin: suppliedOrigin } : {}) },
  ...(payload ? { body: JSON.stringify({ viewerToken: owner ? viewerTokens.get(owner) : undefined, ...payload }) } : {}),
});
async function read(owner: string): Promise<AssessmentRunDTO> {
  const response = await GET(request(owner));
  const body = await response.json() as ApiSuccessEnvelope<AssessmentRunDTO> | ApiErrorEnvelope;
  if (!body.ok) throw new Error(`ASSESSMENT_HTTP_${response.status}_${body.error.code}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok(body.ok);
  viewerTokens.set(owner, body.data.viewerToken);
  return body.data;
}
async function mutate(owner: string, mutation: OwnerMutation): Promise<AssessmentRunDTO> {
  if (!viewerTokens.has(owner)) await read(owner);
  const response = await POST(request(owner, mutation));
  const body = await response.json() as ApiSuccessEnvelope<AssessmentRunDTO> | ApiErrorEnvelope;
  if (!body.ok) throw new Error(`ASSESSMENT_HTTP_${response.status}_${body.error.code}`);
  assert.equal(response.status, 200);
  assert.ok(body.ok);
  viewerTokens.set(owner, body.data.viewerToken);
  return body.data;
}
async function mutateService(owner: string, mutation: OwnerMutation, hooks?: Parameters<typeof assessmentRunsService.mutate>[2]): Promise<AssessmentRunDTO> {
  if (!viewerTokens.has(owner)) await read(owner);
  return assessmentRunsService.mutate(owner, { ...mutation, viewerToken: viewerTokens.get(owner)! }, hooks);
}
async function denied(owner: string | null, payload: object | undefined, status: number, code?: string): Promise<void> {
  const response = payload ? await POST(request(owner, payload)) : await GET(request(owner));
  assert.equal(response.status, status);
  const body = await response.json() as ApiErrorEnvelope;
  assert.equal(body.ok, false);
  if (code) assert.equal(body.error.code, code);
  assert.ok(!JSON.stringify(body).includes(subjects.a));
  assert.ok(!JSON.stringify(body).includes('presentationId'));
}
async function present(owner: string, itemId: string): Promise<AssessmentRunDTO> {
  const current = await read(owner);
  const next = await mutate(owner, { action: 'present', itemId, expectedRevision: current.revision, idempotencyKey: key() });
  assert.equal(next.presentation?.item.id, itemId);
  return next;
}
async function answer(owner: string, itemId: string, response: AssessmentResponse): Promise<AssessmentRunDTO> {
  const issued = await present(owner, itemId);
  assert.ok(issued.presentation);
  return mutate(owner, { action: 'answer', presentationId: issued.presentation.presentationId, expectedRevision: issued.revision, idempotencyKey: key(), response });
}
async function prepareSkipped(owner: string): Promise<AssessmentRunDTO> {
  await mutate(owner, { action: 'start', idempotencyKey: key() });
  for (const item of DOM_S07_PUBLICATION.items.filter(item => !item.dependsOn)) {
    await answer(owner, item.id, { kind: 'MISSING', reason: 'NO_EXPERIENCE' });
  }
  return read(owner);
}
const fullEpisode = (item: AssessmentItem, negativeOccurrence = false): AssessmentResponse => ({
  kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id,
    !field.id.startsWith('NEG.') || field.id.endsWith('.eligible')
      || (negativeOccurrence && field.id.startsWith('NEG.AGR.01.')),
  ])),
});
async function prepareFull(owner: string): Promise<AssessmentRunDTO> {
  await mutate(owner, { action: 'start', idempotencyKey: key() });
  for (const item of DOM_S07_PUBLICATION.items) {
    const response: AssessmentResponse = item.kind === 'FACTS'
      ? fullEpisode(item, item.rootSlot === 'meals-first')
      : { kind: 'OPTION', optionId: item.options[0].id };
    await answer(owner, item.id, response);
  }
  return read(owner);
}
const source = (ownerId: string) => AssessmentRun.findOne({ ownerId }).lean();

async function main(): Promise<void> {
  await mongoose.connect(target.uri, { autoIndex: false });
  for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
  const previousInfo = console.info;
  console.info = () => undefined;
  try {
    for (const owner of Object.values(subjects)) {
      await usersService.upsertCurrentUserProfile({ currentUserId: owner, payload: { username: 'Синтетическая проверка анкеты', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
      const version = await sessionRevocationService.getOrCreateVersion(owner);
      cookies.set(owner, `session=${signJwt(owner, secret!, 3600, version)}`);
      if (owner !== subjects.unlisted) await AssessmentParticipant.create({ _id: owner, environment: 'ISOLATED_SYNTHETIC', cohortId: suffix });
    }
  } finally { console.info = previousInfo; }

  await step(['INT-013', 'INT-014', 'INT-015'], 'Session owner and issued receipts', async () => {
    await denied(null, undefined, 401);
    await denied(subjects.unlisted, undefined, 404);
    const crossOrigin = await POST(request(subjects.a, { action: 'start', idempotencyKey: key() }, '', 'https://foreign.invalid'));
    assert.equal(crossOrigin.status, 403);
    await mutate(subjects.a, { action: 'start', idempotencyKey: key() });
    await mutate(subjects.b, { action: 'start', idempotencyKey: key() });
    const issued = await present(subjects.a, 'meals-first-opportunity');
    assert.ok(issued.presentation);
    assert.ok(!JSON.stringify(issued.presentation).includes('rootSlot'));
    assert.ok(!JSON.stringify(issued.presentation).includes('factKey'));
    const b = await read(subjects.b);
    const aBefore = await source(subjects.a);
    const bBefore = await source(subjects.b);
    await denied(subjects.b, { action: 'present', itemId: 'knowledge-cycle', viewerToken: issued.viewerToken, expectedRevision: b.revision, idempotencyKey: key() }, 409);
    assert.deepEqual(await source(subjects.b), bBefore);
    await denied(subjects.b, { action: 'answer', presentationId: issued.presentation.presentationId, expectedRevision: b.revision, idempotencyKey: key(), response: { kind: 'OPTION', optionId: 'HAS_EPISODE' } }, 409);
    const queried = await GET(request(subjects.b, undefined, `?ownerId=${encodeURIComponent(subjects.a)}`));
    const own = await queried.json() as ApiSuccessEnvelope<AssessmentRunDTO>;
    assert.ok(own.ok);
    assert.deepEqual(own.data.answers, []);
    assert.deepEqual((await source(subjects.a))?.answers, aBefore?.answers);
    for (const field of ['ownerId', 'subjectId', 'rootId', 'method', 'phase', 'consent', 'score']) {
      await denied(subjects.b, { action: 'start', idempotencyKey: key(), [field]: 'forged' }, 400);
    }
    await denied(subjects.b, { action: 'answer', presentationId: 'never-issued', expectedRevision: b.revision, idempotencyKey: key(), response: { kind: 'MISSING', reason: 'SKIPPED' } }, 409);
    await denied(subjects.b, { action: 'present', itemId: 'meals-first-facts', expectedRevision: b.revision, idempotencyKey: key() }, 409);
  });

  await step(['INT-016', 'INT-017', 'INT-018'], 'Retries and concurrent edits', async () => {
    const issued = await present(subjects.a, 'meals-first-opportunity');
    assert.ok(issued.presentation);
    const mutation: OwnerMutation = { action: 'answer', presentationId: issued.presentation.presentationId, expectedRevision: issued.revision, idempotencyKey: key(), response: { kind: 'OPTION', optionId: 'HAS_EPISODE' } };
    const receiptsBefore = await AssessmentOperation.countDocuments({ ownerId: subjects.a });
    const responses = await Promise.all([mutate(subjects.a, mutation), mutate(subjects.a, mutation)]);
    assert.equal(responses[0].revision, responses[1].revision);
    assert.equal(responses[0].answers.filter(value => value.itemId === 'meals-first-opportunity').length, 1);
    assert.equal(await AssessmentOperation.countDocuments({ ownerId: subjects.a }), receiptsBefore + 1);
    await denied(subjects.a, { ...mutation, response: { kind: 'MISSING', reason: 'SKIPPED' } }, 409, 'IDEMPOTENCY_CONFLICT');
    const current = await present(subjects.a, 'meals-first-opportunity');
    assert.ok(current.presentation);
    const competing = await Promise.all([
      POST(request(subjects.a, { action: 'answer', presentationId: current.presentation.presentationId, expectedRevision: current.revision, idempotencyKey: key(), response: { kind: 'MISSING', reason: 'NO_EXPERIENCE' } })),
      POST(request(subjects.a, { action: 'answer', presentationId: current.presentation.presentationId, expectedRevision: current.revision, idempotencyKey: key(), response: { kind: 'OPTION', optionId: 'HAS_EPISODE' } })),
    ]);
    assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
    assert.equal((await read(subjects.a)).revision, current.revision + 1);
  });

  await step(['INT-022', 'INT-023'], 'Dependent branch and exposed correction', async () => {
    await answer(subjects.a, 'meals-first-opportunity', { kind: 'OPTION', optionId: 'HAS_EPISODE' });
    const child = DOM_S07_PUBLICATION.items.find(item => item.id === 'meals-first-facts')!;
    await answer(subjects.a, child.id, fullEpisode(child));
    const oldReceipt = await present(subjects.a, child.id);
    const skipped = await answer(subjects.a, 'meals-first-opportunity', { kind: 'MISSING', reason: 'NO_EXPERIENCE' });
    assert.ok(!skipped.answers.some(value => value.itemId === child.id));
    assert.equal(skipped.items.find(item => item.id === child.id)?.available, false);
    await answer(subjects.a, 'meals-first-opportunity', { kind: 'OPTION', optionId: 'HAS_EPISODE' });
    const reopened = await read(subjects.a);
    assert.ok(!reopened.answers.some(value => value.itemId === child.id));
    await denied(subjects.a, { action: 'answer', presentationId: oldReceipt.presentation!.presentationId, expectedRevision: reopened.revision, idempotencyKey: key(), response: fullEpisode(child) }, 409);
    await present(subjects.a, 'task-change');
    const correction = await answer(subjects.a, child.id, fullEpisode(child));
    assert.equal(correction.answers.find(value => value.itemId === child.id)?.phase, 'ASSISTED');
    const issued = await present(subjects.a, child.id);
    const hinted = await mutate(subjects.a, { action: 'hint', itemId: child.id, expectedRevision: issued.revision, idempotencyKey: key() });
    assert.equal(hinted.presentation?.phase, 'ASSISTED');
    assert.ok(hinted.presentation?.hint);
    await denied(subjects.a, { action: 'answer', presentationId: issued.presentation!.presentationId, expectedRevision: hinted.revision, idempotencyKey: key(), response: fullEpisode(child) }, 409);
  });

  await step(['INT-019', 'INT-026', 'INT-027'], 'Canonical source and actual profile bridge', async () => {
    const skipped = await prepareSkipped(subjects.pending);
    const empty = await mutate(subjects.pending, { action: 'finalize', expectedRevision: skipped.revision, idempotencyKey: key() });
    const insufficientProfile = await getOwnerFactorProfileSummary(subjects.pending);
    assert.equal(empty.calculation, 'READY');
    assert.equal(insufficientProfile?.assessments?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07')?.A.exactLevel, null);
    assert.deepEqual(insufficientProfile?.assessments?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07')?.A.possibleLevels, [0, 1, 2, 3]);
    const prepared = await prepareFull(subjects.b);
    const factorCount = await EvidenceEvent.countDocuments({ actorId: subjects.b });
    const competing = await Promise.all([key(), key()].map(idempotencyKey => POST(request(subjects.b, { action: 'finalize', expectedRevision: prepared.revision, idempotencyKey }))));
    assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
    assert.equal(await AssessmentRun.countDocuments({ ownerId: subjects.b, status: 'FINALIZED' }), 1);
    const summary = await getOwnerFactorProfileSummary(subjects.b);
    const current = await read(subjects.b);
    assert.deepEqual(summary?.assessments, current.profile);
    const household = summary?.assessments?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07');
    assert.ok(household);
    assert.equal(household.A.exactLevel, 3);
    assert.equal(household.A.observationCount, 4);
    assert.equal(household.K.exactLevel, null);
    assert.equal(household.D.exactLevel, null);
    assert.equal(household.CMinus.evidence.signedRate, -0.25);
    assert.equal(household.CMinus.canOffsetByPositiveSkills, false);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: subjects.b }), factorCount);
    assert.ok(summary!.factorProfile.cards.every(card => !card.factorKey.startsWith('DOM.')));
    const before = await source(subjects.b);
    const revised = await mutate(subjects.b, { action: 'revise', expectedRevision: current.revision, idempotencyKey: key() });
    assert.equal(revised.profile, null);
    const draftProfile = (await getOwnerFactorProfileSummary(subjects.b))?.assessments;
    assert.equal(draftProfile?.status, 'DRAFT');
    assert.equal(draftProfile?.snapshot, null);
    const afterCorrection = await answer(subjects.b, 'meals-first-opportunity', { kind: 'MISSING', reason: 'NO_EXPERIENCE' });
    const corrected = await mutate(subjects.b, { action: 'finalize', expectedRevision: afterCorrection.revision, idempotencyKey: key() });
    assert.equal(corrected.profile?.snapshot?.sourceId, before?._id);
    assert.equal(corrected.profile?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07')?.A.exactLevel, null);
    assert.deepEqual((await getOwnerFactorProfileSummary(subjects.b))?.assessments, corrected.profile);
    assert.equal(await AssessmentRun.countDocuments({ ownerId: subjects.b }), 1);
  });

  await step(['INT-020'], 'Source commit crash and retry', async () => {
    const current = await read(subjects.pending);
    await mutate(subjects.pending, { action: 'revise', expectedRevision: current.revision, idempotencyKey: key() });
    const prepared = await read(subjects.pending);
    await assert.rejects(() => mutateService(subjects.pending, { action: 'finalize', expectedRevision: prepared.revision, idempotencyKey: key() }, {
      afterSourceCommitted: async () => { throw new Error('SYNTHETIC_SOURCE_COMMIT_FAILURE'); },
    }), /SYNTHETIC_SOURCE_COMMIT_FAILURE/);
    const pending = await source(subjects.pending);
    assert.equal(pending?.status, 'FINALIZED');
    assert.equal(pending?.snapshot, null);
    assert.equal(pending?.materializedRevision, -1);
    const recovered = await mutate(subjects.pending, { action: 'retry' });
    assert.equal(recovered.calculation, 'READY');
    assert.equal(recovered.revision, pending?.revision);
    assert.equal(recovered.profile?.snapshot?.sourceId, pending?._id);
    assert.equal(await AssessmentRun.countDocuments({ ownerId: subjects.pending }), 1);
  });

  await step(['INT-021'], 'Delayed computation cannot overwrite correction', async () => {
    const prepared = await prepareSkipped(subjects.stale);
    await assert.rejects(() => mutateService(subjects.stale, { action: 'finalize', expectedRevision: prepared.revision, idempotencyKey: key() }, { afterSourceCommitted: async () => { throw new Error('SYNTHETIC_PENDING'); } }));
    const pending = await source(subjects.stale);
    assert.ok(pending);
    await assert.rejects(() => materializeAssessment(subjects.stale, { afterComputed: async () => {
      await mutateService(subjects.stale, { action: 'revise', expectedRevision: pending.revision, idempotencyKey: key() });
    } }), (error: Error) => error instanceof DomainError && error.code === 'SOURCE_STALE');
    const corrected = await source(subjects.stale);
    assert.equal(corrected?.status, 'DRAFT');
    assert.equal(corrected?.snapshot, null);
    assert.equal(corrected?.revision, pending.revision + 1);
    assert.ok(corrected);
    const granted = await mutate(subjects.stale, { action: 'permission', pairUse: true, expectedRevision: corrected.revision, idempotencyKey: key() });
    await assert.rejects(() => mutateService(subjects.stale, { action: 'finalize', expectedRevision: granted.revision, idempotencyKey: key() }, { afterSourceCommitted: async () => { throw new Error('SYNTHETIC_PENDING'); } }));
    const permissionPending = await source(subjects.stale);
    assert.ok(permissionPending);
    await assert.rejects(() => materializeAssessment(subjects.stale, { afterComputed: async () => {
      await mutateService(subjects.stale, { action: 'permission', pairUse: false, expectedRevision: permissionPending.revision, idempotencyKey: key() });
    } }), (error: Error) => error instanceof DomainError && error.code === 'SOURCE_STALE');
    const revoked = await source(subjects.stale);
    assert.equal(revoked?.pairUse, false);
    assert.equal(revoked?.snapshot, null);
    assert.equal(revoked?.permissionRevision, permissionPending.permissionRevision + 1);
    const recovered = await read(subjects.stale);
    assert.equal(recovered.revision, revoked?.revision);
    assert.equal(recovered.profile?.snapshot?.revision, revoked?.revision);
  });

  await step(['INT-028', 'INT-030'], 'Current permissions and owner export', async () => {
    const current = await read(subjects.b);
    const grant: OwnerMutation = { action: 'permission', pairUse: true, expectedRevision: current.revision, idempotencyKey: key() };
    const granted = await mutate(subjects.b, grant);
    assert.equal(granted.pairUse, true);
    const revoked = await mutate(subjects.b, { action: 'permission', pairUse: false, expectedRevision: granted.revision, idempotencyKey: key() });
    const replay = await mutate(subjects.b, grant);
    assert.equal(replay.pairUse, false);
    assert.equal(replay.permissionRevision, revoked.permissionRevision);
    const exported = await productWorkspacePrivacy.exportOwnerData(subjects.b);
    assert.equal(exported.assessments?.pairUse, false);
    assert.ok(exported.assessments?.answers.length);
    assert.ok(!JSON.stringify(exported).includes(subjects.a));
    const aRow = await source(subjects.a);
    assert.ok(aRow);
    process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'false';
    try {
      await denied(subjects.a, undefined, 404);
      await denied(subjects.a, { action: 'start', idempotencyKey: key() }, 404);
      const refreshedControls = await GET(request(subjects.a, undefined, '?view=controls')).then(response => response.json()) as ApiSuccessEnvelope<AssessmentRunDTO>;
      assert.ok(refreshedControls.ok);
      assert.equal(refreshedControls.data.viewerToken, viewerTokens.get(subjects.a));
      assert.deepEqual(refreshedControls.data.answers, []);
      assert.equal(refreshedControls.data.profile, null);
      assert.ok((await productWorkspacePrivacy.exportOwnerData(subjects.a)).assessments?.answers.length);
      const controlled = await mutate(subjects.a, { action: 'permission', pairUse: false, expectedRevision: aRow.revision, idempotencyKey: key() });
      assert.equal(controlled.pairUse, false);
      assert.equal((await getOwnerFactorProfileSummary(subjects.a))?.assessments, undefined);
    } finally { process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'true'; }
    await SessionPermissionReplayCheck();
  });

  await step(['INT-029'], 'Deletion tombstone defeats delayed worker', async () => {
    const prepared = await prepareSkipped(subjects.deleted);
    await assert.rejects(() => mutateService(subjects.deleted, { action: 'finalize', expectedRevision: prepared.revision, idempotencyKey: key() }, { afterSourceCommitted: async () => { throw new Error('SYNTHETIC_PENDING'); } }));
    const pending = await source(subjects.deleted);
    assert.ok(pending);
    await assert.rejects(() => materializeAssessment(subjects.deleted, { afterComputed: async () => {
      process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'false';
      try { await mutate(subjects.deleted, { action: 'delete', expectedRevision: pending.revision, idempotencyKey: key() }); }
      finally { process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'true'; }
    } }), (error: Error) => error instanceof DomainError && error.code === 'SOURCE_STALE');
    const deleted = await source(subjects.deleted);
    assert.equal(deleted?.status, 'DELETED');
    assert.equal(deleted?.snapshot, null);
    assert.deepEqual(deleted?.answers, []);
    assert.equal(deleted?.deletionGeneration, pending.deletionGeneration + 1);
    assert.equal((await AssessmentParticipant.findById(subjects.deleted).lean())?.deletionGeneration, deleted?.deletionGeneration);
    await materializeAssessment(subjects.deleted);
    assert.equal((await source(subjects.deleted))?.snapshot, null);
    assert.equal((await productWorkspacePrivacy.exportOwnerData(subjects.deleted)).assessments, null);
    await denied(subjects.deleted, { action: 'start', idempotencyKey: key() }, 409, 'SOURCE_UNAVAILABLE');
  });

  await step(['INT-032'], 'Legacy finalized test remains immutable', async () => {
    const legacy = async (mutation: MeasurementMutation, status = 200) => {
      const response = await legacyPost(new NextRequest(`${origin}/api/measurements/planning`, {
        method: 'POST', headers: { cookie: cookies.get(subjects.legacy)!, origin, 'content-type': 'application/json' }, body: JSON.stringify(mutation),
      }), { params: Promise.resolve({ key: 'planning' }) });
      assert.equal(response.status, status);
      return response.json() as Promise<ApiSuccessEnvelope<MeasurementTestDTO> | ApiErrorEnvelope>;
    };
    const started = await legacy({ action: 'start' });
    assert.ok(started.ok);
    const answers = started.data.test.questions.map(question => ({ questionId: question.id, choice: 1 }));
    const completed = await legacy({ action: 'finalize', expectedRevision: started.data.revision, answers, pairUse: true });
    assert.ok(completed.ok);
    const before = await MeasurementTestSession.findOne({ ownerId: subjects.legacy, testKey: 'planning' }).lean();
    const evidence = await EvidenceEvent.countDocuments({ actorId: subjects.legacy });
    process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'false';
    try {
      const reopened = await legacy({ action: 'start' });
      const retried = await legacy({ action: 'retry' });
      assert.ok(reopened.ok && retried.ok);
      assert.equal(reopened.data.status, 'FINALIZED');
      assert.equal(retried.data.status, 'FINALIZED');
      assert.equal(retried.data.finalizedAt, completed.data.finalizedAt);
      await legacy({ action: 'draft', expectedRevision: completed.data.revision, answers: answers.map(answer => ({ ...answer, choice: 3 })), pairUse: true }, 409);
    } finally { process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'true'; }
    assert.deepEqual((await MeasurementTestSession.findById(before!._id).lean())?.answers, before?.answers);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: subjects.legacy }), evidence);
  });
  stage = 'I02 integration complete';
  report('passed', [...completedIds].sort());
}

async function SessionPermissionReplayCheck(): Promise<void> {
  // Replay must re-run the existing session guard, even for an earlier successful
  // idempotency key. This is an actual session revision mutation in the test DB.
  const successful: OwnerMutation = { action: 'start', idempotencyKey: key() };
  await mutate(subjects.stale, successful);
  await sessionRevocationService.revokeAll(subjects.stale);
  await denied(subjects.stale, successful, 401);
}

void main().catch((error: Error) => {
  report('failed');
  const location = /assessment\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1] ?? 'unavailable';
  const code = error instanceof DomainError && /^[A-Z_]+$/.test(error.code) ? error.code : error.name.replace(/[^A-Za-z]/g, '');
  const diagnostic = /^ASSESSMENT_HTTP_[A-Z_0-9]+$/.test(error.message) ? error.message : code;
  process.stdout.write(`${JSON.stringify({ suite: 'assessment', stage: `Failure ${diagnostic} line ${location}`, status: 'failed' })}\n`);
  process.exitCode = 1;
}).finally(async () => {
  // local-acceptance owns and removes the entire newly-created database process.
  // Restrict even this best-effort owner cleanup to the exact synthetic subjects.
  await User.deleteMany({ id: { $in: Object.values(subjects) } }).catch(() => undefined);
  await mongoose.disconnect();
});
