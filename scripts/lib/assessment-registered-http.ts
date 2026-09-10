import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { NextRequest } from 'next/server';
import { GET as settingsGet, POST as settingsPost } from '@/app/api/assessments/settings/route';
import { POST as registerPost } from '@/app/api/assessments/register/route';
import { POST as withdrawPost } from '@/app/api/assessments/withdraw/route';
import { GET as runGet, POST as runPost } from '@/app/api/assessments/runs/route';
import { GET as portfolioGet, POST as portfolioPost } from '@/app/api/assessments/portfolio/route';
import { GET as discoveryGet } from '@/app/api/assessments/discovery/route';
import { GET as pairGet } from '@/app/api/assessments/pair/route';
import { GET as directGet } from '@/app/api/assessments/direct/route';
import { POST as deletionRequestPost } from '@/app/api/privacy/deletion-request/route';
import { POST as deletionExecutePost } from '@/app/api/privacy/deletion-request/execute/route';
import mongoose from 'mongoose';
import { User } from '@/models/User';
import { SessionSubject } from '@/models/SessionSubject';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentRun } from '@/models/AssessmentRun';
import { AssessmentRuntimeControl } from '@/models/AssessmentOperations';
import { MeasurementTestSession } from '@/models/MeasurementTestSession';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { signJwt } from '@/lib/jwt';
import { assessmentMode, assessmentTargetId } from '@/domain/services/assessmentAccess.service';
import { setAssessmentStops } from '@/domain/services/assessmentOperations.service';
import type { AssessmentRecoveryEntry } from '@/domain/services/assessmentRecovery.service';
import { ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_TERMS_VERSION, type AssessmentSettingsDTO, type AssessmentRegistration } from '@/domain/assessment/admission';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { AssessmentPortfolioDTO } from '@/domain/assessment/planner';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentPairDTO } from '@/lib/dto/assessmentPair.dto';
import type { BetaDirectDTO, BetaDiscoveryDTO } from '@/lib/dto/assessmentBeta.dto';
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@/lib/api/response';
import type { OwnerDeletionRequestDTO } from '@/domain/services/privacyRequest.service';

type HttpResult<T> = { status: number; headers: Headers; envelope: ApiSuccessEnvelope<T> | ApiErrorEnvelope };
const routes: Record<string, (request: NextRequest) => Promise<Response>> = {
  'GET /api/assessments/settings': settingsGet, 'POST /api/assessments/settings': settingsPost,
  'POST /api/assessments/register': registerPost, 'POST /api/assessments/withdraw': withdrawPost,
  'GET /api/assessments/runs': runGet, 'POST /api/assessments/runs': runPost,
  'GET /api/assessments/portfolio': portfolioGet, 'POST /api/assessments/portfolio': portfolioPost,
  'GET /api/assessments/discovery': discoveryGet, 'GET /api/assessments/pair': pairGet,
  'GET /api/assessments/direct': directGet,
  'POST /api/privacy/deletion-request': deletionRequestPost,
  'POST /api/privacy/deletion-request/execute': deletionExecutePost,
};

/** Real HTTP, production Next handlers, signed sessions and Mongo transactions; not a Discord OAuth or browser-render test. */
export async function checkRegisteredAssessmentHttp(runId: string): Promise<void> {
  assert.match(runId, /^[a-f0-9]{12}$/);
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.hostname, '127.0.0.1'); assert.equal(uri.pathname, `/vmeste_registered_${runId}_test`);
  assert.equal(uri.searchParams.get('replicaSet'), `vmesteRegistered${runId}`);
  assert.equal(process.env.ASSESSMENT_MODE, undefined); assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, undefined);
  await connectToDatabase();
  const ids = ['existing', 'new', 'young', 'paused', 'former-beta', 'missing-receipt', 'synthetic'].map(name => `registered-${runId}-${name}`);
  const cookies: string[] = [];
  for (const [index, ownerId] of ids.entries()) {
    const version = randomUUID();
    await User.updateOne({ id: ownerId }, { $set: { username: 'Синтетический участник', ...(index !== 1 ? { personal: { age: index === 2 ? 17 : 25 } } : {}) } }, { upsert: true, setDefaultsOnInsert: false });
    await SessionSubject.updateOne({ subjectKey: privacySubjectHash(ownerId) }, { $set: { version, accountState: 'ACTIVE' } }, { upsert: true });
    cookies.push(`session=${signJwt(ownerId, process.env.JWT_SECRET!, 3600, version)}`);
  }
  const legacyId = createHash('sha256').update(`${ids[0]}:conversation`).digest('hex');
  await MeasurementTestSession.create({ _id: legacyId, ownerId: ids[0], testKey: 'conversation', contentRevision: 1, registryVersion: 7, status: 'FINALIZED', revision: 2, answers: [{ questionId: 'pause', choice: 3 }, { questionId: 'misunderstanding', choice: 3 }], pairUse: false, materializedRevision: 2, finalizedAt: new Date() });
  const legacyBefore = JSON.stringify(await MeasurementTestSession.findById(legacyId).lean());
  const usersBefore = await User.countDocuments();
  assert.equal(await AssessmentParticipant.countDocuments(), 0);

  const server = createServer(async (request, response) => {
    try {
      const parts: Buffer[] = []; let length = 0;
      for await (const part of request) {
        const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part); length += bytes.length;
        if (length > 65536) { response.writeHead(413).end(); return; }
        parts.push(bytes);
      }
      const body = Buffer.concat(parts), url = `http://${request.headers.host}${request.url}`;
      const handler = routes[`${request.method} ${new URL(url).pathname}`];
      if (!handler) { response.writeHead(404).end(); return; }
      const headers = Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : value]]));
      const result = await handler(new NextRequest(url, { method: request.method, headers, ...(body.length ? { body } : {}) }));
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: { code: 'ADAPTER_FAILED', message: 'Adapter failed' } })); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port, origin = `http://localhost:${port}`, endpoint = `http://127.0.0.1:${port}`;
  async function request<T>(path: string, actor: number | null, body?: object, suppliedOrigin = origin): Promise<HttpResult<T>> {
    const response = await fetch(`${endpoint}${path.startsWith('/api/') ? path : `/api/assessments/${path}`}`, {
      method: body ? 'POST' : 'GET', headers: { Host: `localhost:${port}`, ...(actor !== null ? { Cookie: cookies[actor] } : {}), ...(body ? { Origin: suppliedOrigin, 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, envelope: await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope };
  }
  const accepted = <T>(result: HttpResult<T>): T => {
    assert.equal(result.status, 200, `REGISTERED_HTTP_${result.status}_${result.envelope.ok ? 'OK' : result.envelope.error.code}`);
    assert.ok(result.envelope.ok, 'REGISTERED_SUCCESS_ENVELOPE_REQUIRED'); return result.envelope.data;
  };
  const rejected = <T>(result: HttpResult<T>, status: number, code?: string) => {
    assert.equal(result.status, status, `REGISTERED_EXPECTED_${status}_RECEIVED_${result.status}_${result.envelope.ok ? 'OK' : result.envelope.error.code}`);
    assert.equal(result.envelope.ok, false); if (code && !result.envelope.ok) assert.equal(result.envelope.error.code, code);
  };
  const registration = (settings: AssessmentSettingsDTO): AssessmentRegistration => ({ viewerToken: settings.viewerToken, idempotencyKey: randomUUID(), termsAccepted: true, adultConfirmed: true,
    termsVersion: ASSESSMENT_TERMS_VERSION, informationVersion: ASSESSMENT_INFORMATION_VERSION, ownerAssessment: true, discovery: false, pairSharing: false });
  const receipts: string[] = [];
  async function check(name: string, work: () => Promise<void>) {
    try { await work(); receipts.push(name); process.stdout.write(`${JSON.stringify({ suite: 'assessment-registered', check: name, status: 'PASS' })}\n`); }
    catch (error) {
      const detail = error instanceof Error && /^REGISTERED_[A-Z_0-9]+$/.test(error.message) ? error.message : 'ASSERTION_FAILED';
      const location = error instanceof Error ? error.stack?.split('\n').find(line => line.includes('assessment-registered-http.ts:'))?.trim() : undefined;
      process.stderr.write(`${JSON.stringify({ suite: 'assessment-registered', check: name, status: 'FAIL', detail, location })}\n`); throw error;
    }
  }
  let owner!: AssessmentSettingsDTO, peer!: AssessmentSettingsDTO;
  const publicationId = 'com-s02-knowledge-beta';
  let view!: AssessmentRunDTO;
  const readRun = (actor: number) => request<AssessmentRunDTO>(`runs?publicationId=${publicationId}`, actor);
  async function mutateRun(command: AssessmentMutation) { view = accepted(await request<AssessmentRunDTO>('runs', 0, command)); return view; }
  try {
    await check('default_registered_existing_and_new_accounts_without_invitation', async () => {
      assert.equal(assessmentMode(), 'REGISTERED');
      rejected(await request('settings', null), 401, 'AUTH_REQUIRED');
      const settings = await request<AssessmentSettingsDTO>('settings', 0); owner = accepted(settings);
      peer = accepted(await request<AssessmentSettingsDTO>('settings', 1));
      assert.equal(owner.mode, 'REGISTERED'); assert.equal(owner.admission, 'ELIGIBLE'); assert.equal(peer.admission, 'ELIGIBLE');
      assert.equal(owner.registration, null); assert.equal(owner.settings.ownerAssessment, false);
      assert.equal(owner.settings.discovery, false); assert.equal(owner.settings.pairSharing, false);
      assert.match(settings.headers.get('cache-control') ?? '', /no-store/);
      assert.equal(await AssessmentParticipant.countDocuments(), 0, 'Reading availability must not opt a user in');
    });
    await check('session_origin_explicit_choice_adult_and_subject_guards', async () => {
      const body = registration(owner);
      rejected(await request('register', 0, body, 'https://untrusted.example'), 403, 'REQUEST_ORIGIN_DENIED');
      rejected(await request('register', 0, { ...body, actorId: ids[1] }), 400);
      rejected(await request('register', 0, { ...body, adultConfirmed: false }), 400);
      rejected(await request('register', 0, { ...body, termsAccepted: false }), 400);
      rejected(await request('register', 1, body), 409, 'VIEWER_CONTEXT_STALE');
      const young = accepted(await request<AssessmentSettingsDTO>('settings', 2));
      rejected(await request('register', 2, registration(young)), 403, 'BETA_ADULT_SCOPE_REQUIRED');
      assert.equal(await AssessmentParticipant.countDocuments(), 0);
    });
    await check('explicit_selfregistration_is_idempotent_and_preserves_legacy_data', async () => {
      const body = registration(owner);
      owner = accepted(await request<AssessmentSettingsDTO>('register', 0, body));
      const replay = accepted(await request<AssessmentSettingsDTO>('register', 0, body));
      assert.equal(owner.admission, 'ACTIVE'); assert.equal(replay.revision, owner.revision);
      assert.equal(replay.registration?.acceptedAt, owner.registration?.acceptedAt);
      assert.equal(owner.settings.ownerAssessment, true); assert.equal(owner.settings.discovery, false); assert.equal(owner.settings.pairSharing, false);
      rejected(await request('register', 0, { ...body, discovery: true }), 409, 'IDEMPOTENCY_CONFLICT');
      const peerBody = registration(peer);
      const concurrent = await Promise.all([request<AssessmentSettingsDTO>('register', 1, peerBody), request<AssessmentSettingsDTO>('register', 1, peerBody)]);
      peer = accepted(concurrent[0]); assert.equal(accepted(concurrent[1]).revision, peer.revision);
      assert.equal(await AssessmentParticipant.countDocuments({ _id: { $in: ids.slice(0, 2) }, environment: 'REGISTERED', membershipStatus: 'ACTIVE' }), 2);
      assert.equal(await User.countDocuments(), usersBefore);
      assert.equal(JSON.stringify(await MeasurementTestSession.findById(legacyId).lean()), legacyBefore);
    });
    await check('new_catalog_and_optional_contexts_accessible_without_beta_gates', async () => {
      const portfolio = accepted(await request<AssessmentPortfolioDTO>('portfolio', 0));
      assert.ok(portfolio.publications.some(publication => publication.id === publicationId));
      assert.deepEqual([...new Set(portfolio.publications.map(publication => publication.skillId))].sort(), ['COM.S02', 'COM.S04', 'DOM.S07']);
      const feed = accepted(await request<BetaDiscoveryDTO>('discovery', 0)); assert.deepEqual(feed.cards, []);
      const pair = accepted(await request<AssessmentPairDTO>('pair', 0)); assert.equal(pair.availability, 'UNAVAILABLE');
      const direct = accepted(await request<BetaDirectDTO>('direct', 0)); assert.equal(direct.plan, null);
      // Missing pair/conditions remain meaningful empty states, not invitation failures.
      assert.equal(portfolio.profile.snapshot, null);
    });
    await check('form_start_cannot_read_or_mutate_another_owners_run', async () => {
      view = accepted(await readRun(0)); assert.equal(view.status, 'NEW');
      await mutateRun({ action: 'start', publicationId, viewerToken: view.viewerToken, idempotencyKey: randomUUID() });
      assert.equal(view.status, 'DRAFT');
      rejected(await request('runs', 1, { action: 'start', publicationId, viewerToken: view.viewerToken, idempotencyKey: randomUUID() }), 409, 'VIEWER_CONTEXT_STALE');
      rejected(await request(`runs?publicationId=${publicationId}&ownerId=${ids[0]}`, 1), 400);
      const other = accepted(await readRun(1)); assert.equal(other.status, 'NEW'); assert.deepEqual(other.answers, []);
      assert.equal(await AssessmentRun.countDocuments({ ownerId: ids[1] }), 0);
    });
    await check('complete_form_review_finalize_and_separate_evidence_profile', async () => {
      let answered = 0;
      while (view.items.some(item => item.available && !item.answered)) {
        const next = view.items.find(item => item.available && !item.answered)!;
        await mutateRun({ action: 'present', publicationId, viewerToken: view.viewerToken, expectedRevision: view.revision, itemId: next.id, idempotencyKey: randomUUID() });
        const presentation = view.presentation; assert.ok(presentation);
        const item = presentation.item;
        assert.equal(item.method, 'KNOWLEDGE');
        const response: AssessmentResponse = item.kind === 'OPTION' ? { kind: 'OPTION', optionId: item.options[0].id }
          : item.kind === 'STRUCTURED' ? { kind: 'STRUCTURED', slots: Object.fromEntries(item.slots!.map(slot => [slot.id, slot.options[0].id])) }
            : { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, true])) };
        await mutateRun({ action: 'answer', publicationId, viewerToken: view.viewerToken, expectedRevision: view.revision, presentationId: presentation.presentationId, idempotencyKey: randomUUID(), response });
        answered++; assert.ok(answered <= 30, 'REGISTERED_FORM_MUST_BE_BOUNDED');
      }
      assert.ok(answered > 2, 'The full module must contain more than the old two-question test');
      view = accepted(await readRun(0));
      assert.equal(view.status, 'DRAFT'); assert.equal(view.answers.length, answered);
      assert.ok(view.answers.every(answer => answer.summary.length > 0), 'Owner can review all saved answers before finalization');
      const body: AssessmentMutation = { action: 'finalize', publicationId, viewerToken: view.viewerToken, expectedRevision: view.revision, idempotencyKey: randomUUID() };
      await mutateRun(body); const revision = view.revision;
      await mutateRun(body); assert.equal(view.revision, revision);
      view = accepted(await readRun(0)); assert.equal(view.status, 'FINALIZED'); assert.equal(view.calculation, 'READY');
      const portfolio = accepted(await request<AssessmentPortfolioDTO>('portfolio', 0));
      assert.equal(portfolio.profile.status, 'READY');
      const skill = portfolio.profile.snapshot?.skills.find(item => item.skillId === 'COM.S02'); assert.ok(skill);
      assert.ok(skill.K.observationCount > 0); assert.equal(skill.A.observationCount, 0); assert.equal(skill.D.observationCount, 0);
      assert.equal(skill.A.exactLevel, null); assert.equal(skill.D.exactLevel, null);
      assert.equal(view.matchingUse, false); assert.equal(view.pairUse, false);
      assert.equal(JSON.stringify(await MeasurementTestSession.findById(legacyId).lean()), legacyBefore);
      assert.equal(accepted(await request<AssessmentPortfolioDTO>('portfolio', 1)).profile.snapshot, null);
    });
    await check('permission_revocation_and_withdrawal_never_auto_reenable', async () => {
      const prior = accepted(await request<AssessmentSettingsDTO>('settings', 0));
      owner = accepted(await request<AssessmentSettingsDTO>('settings', 0, { ...prior.settings, discovery: true, pairSharing: true, viewerToken: prior.viewerToken, expectedRevision: prior.revision }));
      assert.equal(owner.settings.discovery, true); assert.equal(owner.settings.pairSharing, true);
      owner = accepted(await request<AssessmentSettingsDTO>('settings', 0, { ...owner.settings, discovery: false, pairSharing: false, viewerToken: owner.viewerToken, expectedRevision: owner.revision }));
      const saved = accepted(await readRun(0)); assert.equal(saved.matchingUse, false); assert.equal(saved.pairUse, false);
      owner = accepted(await request<AssessmentSettingsDTO>('withdraw', 0, { viewerToken: owner.viewerToken, expectedRevision: owner.revision }));
      assert.equal(owner.admission, 'REVOKED'); assert.equal(owner.settings.ownerAssessment, false);
      rejected(await readRun(0), 403, 'BETA_ENROLLMENT_REQUIRED');
      for (let repeat = 0; repeat < 2; repeat++) assert.equal(accepted(await request<AssessmentSettingsDTO>('settings', 0)).admission, 'REVOKED');
      assert.equal(await AssessmentRun.countDocuments({ ownerId: ids[0], status: 'FINALIZED' }), 1);
      owner = accepted(await request<AssessmentSettingsDTO>('register', 0, registration(owner)));
      assert.equal(owner.admission, 'ACTIVE'); assert.equal(owner.settings.discovery, false); assert.equal(owner.settings.pairSharing, false);
    });
    await check('explicit_off_submission_stop_and_recovery_fence_remain_effective', async () => {
      const unused = accepted(await request<AssessmentSettingsDTO>('settings', 3));
      process.env.ASSESSMENT_MODE = 'OFF';
      try {
        assert.equal(accepted(await request<AssessmentSettingsDTO>('settings', 0)).mode, 'OFF');
        rejected(await request('register', 3, registration(unused)), 503, 'BETA_UNAVAILABLE');
        rejected(await readRun(0), 404, 'NOT_FOUND');
      } finally { delete process.env.ASSESSMENT_MODE; }
      await setAssessmentStops(['SUBMISSIONS'], true);
      try { rejected(await request('register', 3, registration(unused)), 503, 'BETA_PAUSED'); }
      finally { await setAssessmentStops(['SUBMISSIONS'], false); }
      await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { recoveryReconciled: false } });
      try {
        rejected(await request('settings', 0), 503, 'BETA_RECOVERY_RECONCILIATION_REQUIRED');
        rejected(await request('register', 3, registration(unused)), 503);
      } finally { await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { recoveryReconciled: true } }); }
      const runtime = await AssessmentRuntimeControl.findById(assessmentTargetId()).lean(); assert.ok(runtime);
      await AssessmentRuntimeControl.deleteOne({ _id: runtime._id });
      try {
        rejected(await request('settings', 0), 503, 'BETA_RECOVERY_RECONCILIATION_REQUIRED');
        rejected(await readRun(0), 503);
      } finally { await AssessmentRuntimeControl.create(runtime); }
      assert.equal(await AssessmentParticipant.countDocuments({ _id: ids[3] }), 0);
      assert.equal(accepted(await request<AssessmentSettingsDTO>('settings', 3)).admission, 'ELIGIBLE');
      assert.equal(await User.countDocuments(), usersBefore);
    });
    await check('old_receipts_renew_explicitly_and_synthetic_accounts_never_promote', async () => {
      const oldChoices = { ownerAssessment: true, discovery: true, pairSharing: true, publicationIds: [publicationId] };
      await AssessmentParticipant.create({ _id: ids[4], environment: 'PRIVATE_BETA', cohortId: 'former-beta', targetId: assessmentTargetId(), membershipStatus: 'ACTIVE', settings: oldChoices,
        registration: { termsVersion: 'private-beta-terms-2026-09-10', informationVersion: 'private-beta-data-flow-2026-09-10', acceptedAt: new Date().toISOString(), adultPolicy: 'SELF_DECLARED_18_PLUS', choices: oldChoices, operationKey: randomUUID(), requestIntent: 'previous-intent', sessionVersion: 'previous-session' } });
      await AssessmentParticipant.create({ _id: ids[5], environment: 'REGISTERED', cohortId: 'registered-users', targetId: assessmentTargetId(), membershipStatus: 'ACTIVE', settings: oldChoices, registration: null });
      await AssessmentParticipant.create({ _id: ids[6], environment: 'ISOLATED_SYNTHETIC', cohortId: 'synthetic', targetId: assessmentTargetId(), membershipStatus: 'ACTIVE', settings: oldChoices, registration: null });
      for (const actor of [4, 5]) {
        const before = accepted(await request<AssessmentSettingsDTO>('settings', actor)); assert.equal(before.admission, 'ELIGIBLE');
        rejected(await request('portfolio', actor), 403, 'BETA_ENROLLMENT_REQUIRED');
        const renewed = accepted(await request<AssessmentSettingsDTO>('register', actor, registration(before)));
        assert.equal(renewed.admission, 'ACTIVE'); assert.equal(renewed.registration?.termsVersion, ASSESSMENT_TERMS_VERSION);
        assert.equal(renewed.settings.discovery, false); assert.equal(renewed.settings.pairSharing, false);
        assert.equal((await AssessmentParticipant.findById(ids[actor]).lean())?.environment, 'REGISTERED');
        assert.ok(accepted(await request<AssessmentPortfolioDTO>('portfolio', actor)).publications.length > 0);
      }
      const synthetic = accepted(await request<AssessmentSettingsDTO>('settings', 6)); assert.equal(synthetic.admission, 'UNAVAILABLE');
      rejected(await request('register', 6, registration(synthetic)), 403, 'BETA_ENROLLMENT_REQUIRED');
      assert.equal((await AssessmentParticipant.findById(ids[6]).lean())?.environment, 'ISOLATED_SYNTHETIC');
    });
    await check('owner_source_deletion_and_prior_revocation_journal_without_extra_config', async () => {
      assert.equal(process.env.ASSESSMENT_RECOVERY_MONGODB_URI, undefined);
      const current = accepted(await readRun(0));
      rejected(await request('runs', 1, { action: 'delete', publicationId, viewerToken: current.viewerToken, expectedRevision: current.revision, idempotencyKey: randomUUID() }), 409, 'VIEWER_CONTEXT_STALE');
      const deleted = accepted(await request<AssessmentRunDTO>('runs', 0, { action: 'delete', publicationId, viewerToken: current.viewerToken, expectedRevision: current.revision, idempotencyKey: randomUUID() }));
      assert.equal(deleted.status, 'DELETED'); assert.deepEqual(deleted.answers, []);
      const row = await AssessmentRun.findOne({ ownerId: ids[0], publicationId }).lean();
      assert.equal(row?.status, 'DELETED'); assert.deepEqual(row?.answers, []); assert.equal(row?.snapshot, null);
      assert.equal(accepted(await request<AssessmentPortfolioDTO>('portfolio', 0)).profile.snapshot, null);
      assert.equal(await User.countDocuments(), usersBefore);
      const journal = await mongoose.connection.db!.collection<AssessmentRecoveryEntry>('assessment_registered_revocations').findOne({ _id: privacySubjectHash(`assessment-registered-revocation:${ids[0]}`) });
      assert.ok(journal); assert.equal(journal.deleted, false, 'Deleting one source is not deleting the account');
      assert.equal('answers' in journal, false); assert.equal('ownerId' in journal, false);
      assert.equal(JSON.stringify(await MeasurementTestSession.findById(legacyId).lean()), legacyBefore);
    });
    await check('explicit_account_deletion_removes_only_that_owners_data_and_revokes_session', async () => {
      const peerRun = accepted(await readRun(1));
      accepted(await request<AssessmentRunDTO>('runs', 1, { action: 'start', publicationId, viewerToken: peerRun.viewerToken, idempotencyKey: randomUUID() }));
      const requested = accepted(await request<{ request: OwnerDeletionRequestDTO }>('/api/privacy/deletion-request', 1, {}));
      assert.equal(requested.request.status, 'PENDING_CONFIRMATION');
      rejected(await request('/api/privacy/deletion-request/execute', 1, { confirmation: 'wrong' }), 400);
      const executed = accepted(await request<{ request: OwnerDeletionRequestDTO; deleted: boolean }>('/api/privacy/deletion-request/execute', 1, { confirmation: 'DELETE_ACCOUNT' }));
      assert.equal(executed.deleted, true); assert.equal(executed.request.status, 'EXECUTED');
      assert.equal(await User.countDocuments({ id: ids[1] }), 0);
      assert.equal(await AssessmentParticipant.countDocuments({ _id: ids[1] }), 0);
      assert.equal(await AssessmentRun.countDocuments({ ownerId: ids[1] }), 0);
      const journal = await mongoose.connection.db!.collection<AssessmentRecoveryEntry>('assessment_registered_revocations').findOne({ _id: privacySubjectHash(`assessment-registered-revocation:${ids[1]}`) });
      assert.equal(journal?.deleted, true);
      for (const collection of ['assessment_portfolios', 'assessment_practices', 'assessment_jobs']) assert.equal(await mongoose.connection.db!.collection(collection).countDocuments({ ownerId: ids[1] }), 0);
      rejected(await request('settings', 1), 401);
      assert.equal(accepted(await request<AssessmentSettingsDTO>('settings', 0)).admission, 'ACTIVE');
      assert.equal(await User.countDocuments(), usersBefore - 1);
      assert.equal(JSON.stringify(await MeasurementTestSession.findById(legacyId).lean()), legacyBefore);
    });
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-registered', status: 'PASS', checks: receipts.length, layer: 'HTTP_NEXT_ROUTE_EXPORT_ADAPTER_OWNED_MONGODB', defaultMode: 'REGISTERED', actualDiscordOAuth: 'NOT_RUN' })}\n`);
  } finally {
    await new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeIdleConnections(); });
  }
}
