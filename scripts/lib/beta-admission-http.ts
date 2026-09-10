import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { NextRequest } from 'next/server';
import { GET as settingsGet, POST as settingsPost } from '@/app/api/assessments/settings/route';
import { POST as registerPost } from '@/app/api/assessments/register/route';
import { POST as withdrawPost } from '@/app/api/assessments/withdraw/route';
import { GET as supportGet, POST as supportPost } from '@/app/api/assessments/support/route';
import { GET as runGet } from '@/app/api/assessments/runs/route';
import { User } from '@/models/User';
import { SessionSubject } from '@/models/SessionSubject';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentSupport } from '@/models/AssessmentOperations';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { signJwt } from '@/lib/jwt';
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@/lib/api/response';
import type { AssessmentSettingsDTO, AssessmentRegistration, AssessmentSupportDTO } from '@/domain/assessment/admission';

type Check = (id: string, assertion: string, work: () => Promise<void>, layer?: string) => Promise<void>;
const layer = 'HTTP_NEXT_ROUTE_EXPORT_ADAPTER_OWNED_MONGODB';
const routes: Record<string, (request: NextRequest) => Promise<Response>> = {
  'GET /api/assessments/settings': settingsGet, 'POST /api/assessments/settings': settingsPost,
  'POST /api/assessments/register': registerPost, 'POST /api/assessments/withdraw': withdrawPost,
  'GET /api/assessments/support': supportGet, 'POST /api/assessments/support': supportPost,
  'GET /api/assessments/runs': runGet,
};
/** Actual HTTP, Next route exports, guards, service and Mongo; deliberately no claim of real OAuth or real-target approval. */
export async function checkBetaAdmissionHttp(check: Check): Promise<void> {
  const ids = ['beta-http-adult-a', 'beta-http-adult-b', 'beta-http-young', 'beta-http-unlisted'];
  const cookies: string[] = [];
  for (const [index, ownerId] of ids.entries()) {
    const version = randomUUID();
    await User.updateOne({ id: ownerId }, { $set: { username: 'Синтетический участник', personal: { age: index === 2 ? 17 : 25 } } }, { upsert: true, setDefaultsOnInsert: false });
    await SessionSubject.updateOne({ subjectKey: privacySubjectHash(ownerId) }, { $set: { version, accountState: 'ACTIVE' } }, { upsert: true });
    if (index !== 3) await AssessmentParticipant.create({ _id: ownerId, environment: 'ISOLATED_SYNTHETIC', cohortId: 'owned-admission-http', membershipStatus: 'INVITED' });
    cookies.push(`session=${signJwt(ownerId, process.env.JWT_SECRET!, 3600, version)}`);
  }
  const server = createServer(async (request, response) => {
    try {
      const parts: Buffer[] = []; let length = 0;
      for await (const part of request) { const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part); length += bytes.length; if (length > 65536) { response.writeHead(413).end(); return; } parts.push(bytes); }
      const body = Buffer.concat(parts), url = `http://${request.headers.host}${request.url}`;
      const handler = routes[`${request.method} ${new URL(url).pathname}`];
      if (!handler) { response.writeHead(404).end(); return; }
      const headers = Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : value]]));
      const result = await handler(new NextRequest(url, { method: request.method, headers, ...(body.length ? { body } : {}) }));
      response.writeHead(result.status, Object.fromEntries(result.headers.entries())); response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: { code: 'ADAPTER_FAILED', message: 'Adapter failed' } })); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  // NextRequest canonicalizes loopback to localhost; keep the visible host and Origin identical.
  const port = address.port, origin = `http://localhost:${port}`, endpoint = `http://127.0.0.1:${port}`;
  async function request<T>(path: string, actor: number | null, body?: object, suppliedOrigin = origin) {
    const response = await fetch(`${endpoint}/api/assessments/${path}`, { method: body ? 'POST' : 'GET', headers: { Host: `localhost:${port}`, ...(actor !== null ? { Cookie: cookies[actor] } : {}), ...(body ? { Origin: suppliedOrigin, 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, envelope: await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope };
  }
  const accepted = <T>(result: { status: number; envelope: ApiSuccessEnvelope<T> | ApiErrorEnvelope }): T => { assert.equal(result.status, 200); assert.ok(result.envelope.ok, 'actual admission route must return a success envelope'); return result.envelope.data; };
  const rejected = <T>(result: { status: number; envelope: ApiSuccessEnvelope<T> | ApiErrorEnvelope }, status: number, code?: string) => {
    assert.equal(result.status, status, `Expected admission rejection ${code ?? 'VALIDATION'}; received ${result.envelope.ok ? 'OK' : result.envelope.error.code}`); assert.equal(result.envelope.ok, false); if (code && !result.envelope.ok) assert.equal(result.envelope.error.code, code);
  };
  const registration = (settings: AssessmentSettingsDTO): AssessmentRegistration => ({ viewerToken: settings.viewerToken, idempotencyKey: randomUUID(), termsAccepted: true, adultConfirmed: true,
    termsVersion: 'private-beta-terms-2026-09-10', informationVersion: 'private-beta-data-flow-2026-09-10', ownerAssessment: true, discovery: false, pairSharing: false });
  let current!: AssessmentSettingsDTO;
  try {
    await check('BETA-082', 'HTTP admission enforces session, same-origin, strict input, invitation and known adult scope', async () => {
      rejected(await request('settings', null), 401, 'AUTH_REQUIRED');
      const settingsResponse = await request<AssessmentSettingsDTO>('settings', 0); current = accepted(settingsResponse);
      assert.equal(current.admission, 'INVITED'); assert.equal(current.registration, null);
      assert.match(settingsResponse.headers.get('cache-control') ?? '', /no-store/);
      const body = registration(current);
      rejected(await request('register', 0, body, 'https://untrusted.example'), 403, 'REQUEST_ORIGIN_DENIED');
      rejected(await request('register', 0, { ...body, actorId: ids[1], consentAll: true }), 400);
      rejected(await request('register', 0, { ...body, adultConfirmed: false }), 400);
      const young = accepted(await request<AssessmentSettingsDTO>('settings', 2));
      rejected(await request('register', 2, registration(young)), 403, 'BETA_ADULT_SCOPE_REQUIRED');
      const unlisted = accepted(await request<AssessmentSettingsDTO>('settings', 3));
      assert.equal(unlisted.admission, 'UNAVAILABLE');
      rejected(await request('register', 3, registration(unlisted)), 404, 'NOT_FOUND');
      assert.equal((await AssessmentParticipant.findById(ids[0]).lean())?.membershipStatus, 'INVITED');
    }, layer);
    await check('BETA-084', 'HTTP registration retry is idempotent; settings persist separate purposes and reject foreign or stale intent', async () => {
      const body = registration(current);
      current = accepted(await request<AssessmentSettingsDTO>('register', 0, body));
      const repeated = accepted(await request<AssessmentSettingsDTO>('register', 0, body));
      assert.equal(repeated.revision, current.revision); assert.equal(repeated.registration?.acceptedAt, current.registration?.acceptedAt);
      assert.equal(current.admission, 'ACTIVE'); assert.equal(current.settings.discovery, false); assert.equal(current.settings.pairSharing, false);
      assert.equal('requestIntent' in current.registration!, false); assert.equal('sessionVersion' in current.registration!, false);
      rejected(await request('register', 0, { ...body, discovery: true }), 409, 'IDEMPOTENCY_CONFLICT');
      rejected(await request('settings', 1, { ...current.settings, viewerToken: current.viewerToken, expectedRevision: current.revision }), 409, 'VIEWER_CONTEXT_STALE');
      const prior = current;
      current = accepted(await request<AssessmentSettingsDTO>('settings', 0, { ...prior.settings, discovery: true, viewerToken: prior.viewerToken, expectedRevision: prior.revision }));
      assert.equal(current.settings.discovery, true); assert.equal(current.settings.pairSharing, false);
      assert.equal(current.registration?.acceptedAt, prior.registration?.acceptedAt);
      rejected(await request('settings', 0, { ...prior.settings, viewerToken: prior.viewerToken, expectedRevision: prior.revision }), 409, 'VIEWER_CONTEXT_STALE');
      rejected(await request('settings', 0, { ...current.settings, publicationIds: ['future-sensitive-module'], viewerToken: current.viewerToken, expectedRevision: current.revision }), 400, 'PURPOSE_NOT_APPROVED');
      const saved = accepted(await request<AssessmentSettingsDTO>('settings', 0)); assert.equal(saved.revision, current.revision); assert.equal(saved.settings.discovery, true);
    }, layer);
    await check('BETA-090', 'HTTP support creates only explicit text receipt, idempotent retry and isolated owner list', async () => {
      const body = { viewerToken: current.viewerToken, idempotencyKey: randomUUID(), category: 'CLARITY', message: 'Синтетический вопрос поддержки.' };
      const ticket = accepted(await request<AssessmentSupportDTO>('support', 0, body));
      const repeated = accepted(await request<AssessmentSupportDTO>('support', 0, body)); assert.equal(repeated.id, ticket.id);
      assert.equal(ticket.attachedResult, false); assert.deepEqual(Object.keys(ticket).sort(), ['attachedResult', 'category', 'createdAt', 'id', 'status']);
      assert.equal(await AssessmentSupport.countDocuments({ ownerId: ids[0] }), 1);
      const stored = await AssessmentSupport.findById(ticket.id).lean(); assert.equal(stored?.attachment, null);
      const own = accepted(await request<AssessmentSupportDTO[]>('support', 0)); assert.equal(own.length, 1); assert.equal(own[0].id, ticket.id);
      assert.equal(accepted(await request<AssessmentSupportDTO[]>('support', 1)).length, 0);
      rejected(await request('support', 1, body), 409, 'VIEWER_CONTEXT_STALE');
      rejected(await request('support', 0, { ...body, idempotencyKey: randomUUID(), answers: ['unrequested-payload'] }), 400);
    }, layer);
    await check('BETA-085', 'HTTP withdrawal revokes collection and stale settings while retaining owner controls and support receipt', async () => {
      const prior = current;
      current = accepted(await request<AssessmentSettingsDTO>('withdraw', 0, { viewerToken: prior.viewerToken, expectedRevision: prior.revision }));
      assert.equal(current.admission, 'REVOKED'); assert.equal(current.settings.ownerAssessment, false); assert.equal(current.settings.discovery, false);
      rejected(await request('runs?publicationId=com-s02-knowledge-beta', 0), 403, 'BETA_ENROLLMENT_REQUIRED');
      rejected(await request('settings', 0, { ...prior.settings, viewerToken: prior.viewerToken, expectedRevision: prior.revision }), 409, 'VIEWER_CONTEXT_STALE');
      rejected(await request('withdraw', 1, { viewerToken: current.viewerToken, expectedRevision: current.revision }), 409, 'VIEWER_CONTEXT_STALE');
      assert.equal(accepted(await request<AssessmentSettingsDTO>('settings', 0)).admission, 'REVOKED');
      assert.equal(accepted(await request<AssessmentSupportDTO[]>('support', 0)).length, 1);
      const previousMode = process.env.ASSESSMENT_MODE;
      try { process.env.ASSESSMENT_MODE = 'OFF'; assert.equal(accepted(await request<AssessmentSettingsDTO>('settings', 0)).mode, 'OFF'); rejected(await request('register', 1, registration(accepted(await request<AssessmentSettingsDTO>('settings', 1)))), 503, 'BETA_UNAVAILABLE'); }
      finally { process.env.ASSESSMENT_MODE = previousMode; }
    }, layer);
  } finally { await new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeIdleConnections(); }); }
}
