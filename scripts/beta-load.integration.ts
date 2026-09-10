import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { GET as runGet, POST as runPost } from '@/app/api/assessments/runs/route';
import { GET as profileGet } from '@/app/api/assessments/portfolio/route';
import { POST as comparePost } from '@/app/api/assessments/compare/route';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentRun, AssessmentOperation } from '@/models/AssessmentRun';
import { AssessmentPortfolio } from '@/models/AssessmentPortfolio';
import { AssessmentJob } from '@/models/AssessmentOperations';
import { User } from '@/models/User';
import { SessionSubject } from '@/models/SessionSubject';
import { Pair } from '@/models/Pair';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { signJwt } from '@/lib/jwt';
import { assessmentRunsService, assessmentIdentity } from '@/domain/services/assessmentRuns.service';
import { betaDirectService } from '@/domain/services/assessmentDirect.service';
import { assessmentTransaction, isAssessmentEnvironment } from '@/domain/services/assessmentAccess.service';
import { claimAssessmentJob, enqueueAssessmentProjection, executeAssessmentJob, fenceAssessmentJob } from '@/domain/services/assessmentJobs.service';
import { DomainError } from '@/domain/errors';
import type { AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { BetaDirectPlan, BetaComparisonDTO } from '@/lib/dto/assessmentBeta.dto';
import type { AssessmentPortfolioDTO } from '@/domain/assessment/planner';
import type { ApiSuccessEnvelope, ApiErrorEnvelope } from '@/lib/api/response';

const PROFILE = { version: 'beta-proposed-defaults-2026-09-10', virtualUsers: 25, offeredRequestsPerSecond: 10, steadySeconds: 120,
  goals: { saveP95Ms: 750, ownerProfileP95Ms: 1000, currentComparisonP95Ms: 2000, scenarioCompletionP95Ms: 30000 } } as const;
const PUBLICATION = 'com-s02-knowledge-beta';
type Kind = 'save' | 'profile' | 'current' | 'scenario';
type Sample = { kind: Kind; status: number; latencyMs: number; queueDelayMs: number; outcome: 'OK' | 'CONFLICT' | 'RATE_LIMIT' | 'AUTH' | 'SERVER' | 'NETWORK' | 'CLIENT' };
type Actor = { id: string; peerId: string; cookie: string; dto: AssessmentRunDTO; sourceId: string; presentationId: string; latestAcknowledgedRevision: number; acknowledgedKeys: string[] };
const actors: Actor[] = []; const workers: ChildProcess[] = []; const samples: Sample[] = [];
let stage = 'guard'; let unauthorizedDisclosures = 0; let maxInflight = 0; let inflight = 0;
const report = (value: object) => process.stdout.write(`${JSON.stringify({ suite: 'beta-load', status: 'running', ...value })}\n`);
const percentile = (values: number[], fraction: number) => values.length ? Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] * 100) / 100 : null;
const summary = (values: number[]) => ({ count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), max: values.length ? Math.max(...values) : null });
async function canonicalFutureEvidence(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    const parent = dirname(path); if (parent === path) throw error;
    return resolve(await canonicalFutureEvidence(parent), relative(parent, path));
  }
}
async function prepareLoadEvidence(): Promise<string> {
  const root = await realpath(process.cwd()), requested = resolve(process.env.BETA_EVIDENCE_DIR ?? join(tmpdir(), `vmeste-beta-load-${randomUUID()}`));
  const canonical = await canonicalFutureEvidence(requested);
  const outside = (path: string) => { const value = relative(root, path); return value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value); };
  if (!outside(canonical)) throw new Error('LOAD_EVIDENCE_MUST_BE_OUTSIDE_SOURCE_TREE');
  await mkdir(canonical, { recursive: true }); const directory = await realpath(canonical);
  if (!outside(directory)) throw new Error('LOAD_EVIDENCE_MUST_BE_OUTSIDE_SOURCE_TREE');
  return directory;
}
const now = new Date();
const at = (day: number, hour: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, hour)).toISOString();
function plan(role: 'A' | 'B', marker: string): BetaDirectPlan {
  return { templateId: 'DOM.S07', period: { startsAt: at(0, 0), endsAt: at(28, 0) }, timezone: 'UTC', calendarComplete: true,
    availableIntervals: [{ startsAt: at(2, role === 'A' ? 12 : 14), endsAt: at(2, role === 'A' ? 13 : 15) }],
    alternativeIntervals: [{ startsAt: at(2, 16), endsAt: at(2, 17) }], offer: 'COOKING', acceptableOffers: ['COOKING'], idealOffer: 'COOKING', excludedOffers: [],
    conditionImportance: 'MUST', requireAppliedCriterion: false, willingness: true, alternativeOffer: null, willingAlternative: null,
    resource: { unit: 'minute', lineageId: marker, capacity: 180, basis: 'TOTAL', ordinaryUse: 30 }, criterionAttemptMinutes: 10, scheduleAttemptMinutes: 10,
    organizationAttemptMinutes: 5, willingCriterion: true, willingSchedule: true, provenance: 'USER_INPUT', disclosureVersion: 'beta-direct-predicate-v1' };
}
async function seedActor(index: number, prefix: string): Promise<Actor> {
  const id = `${prefix}-${index}-owner`, peerId = `${prefix}-${index}-peer`; let version = '';
  for (const [role, subject] of [['A', id], ['B', peerId]] as const) {
    await User.updateOne({ id: subject }, { $set: { username: 'Синтетическая нагрузка', personal: { age: 25 } } }, { upsert: true, setDefaultsOnInsert: false });
    const sessionVersion = randomUUID(); if (subject === id) version = sessionVersion;
    await SessionSubject.updateOne({ subjectKey: privacySubjectHash(subject) }, { $set: { version: sessionVersion, accountState: 'ACTIVE' } }, { upsert: true });
    await AssessmentParticipant.create({ _id: subject, environment: 'ISOLATED_SYNTHETIC', cohortId: prefix });
    const direct = await betaDirectService.get(subject);
    await betaDirectService.mutate(subject, { action: 'save', expectedRevision: direct.revision, idempotencyKey: randomUUID(), viewerToken: direct.viewerToken, plan: plan(role, `LOAD_PRIVATE_${index}_${role}`), discoveryOptIn: false, pairUse: true });
  }
  const members: [string, string] = [id, peerId]; members.sort();
  await Pair.create({ members, key: members.join('|'), status: 'active', contextVersion: 'pair-context-v1' });
  // One canonical finalized source feeds profile reads; the independent K form is the mutable workload.
  const observationId = 'com-s02-application-beta';
  let observation = await assessmentRunsService.get(id, observationId);
  observation = await assessmentRunsService.mutate(id, { action: 'start', publicationId: observationId, viewerToken: observation.viewerToken, idempotencyKey: randomUUID(), period: { id: 'load-observation-window', startsAt: at(-28, 0), endsAt: at(0, 0) } });
  while (observation.items.some(item => item.available && !item.answered)) {
    const item = observation.items.find(value => value.available && !value.answered)!;
    observation = await assessmentRunsService.mutate(id, { action: 'present', publicationId: observationId, itemId: item.id, viewerToken: observation.viewerToken, expectedRevision: observation.revision, idempotencyKey: randomUUID() });
    observation = await assessmentRunsService.mutate(id, { action: 'answer', publicationId: observationId, presentationId: observation.presentation!.presentationId, viewerToken: observation.viewerToken, expectedRevision: observation.revision, idempotencyKey: randomUUID(), response: { kind: 'MISSING', reason: 'NO_EXPERIENCE' } });
  }
  await assessmentRunsService.mutate(id, { action: 'finalize', publicationId: observationId, viewerToken: observation.viewerToken, expectedRevision: observation.revision, idempotencyKey: randomUUID() });
  let dto = await assessmentRunsService.get(id, PUBLICATION);
  dto = await assessmentRunsService.mutate(id, { action: 'start', publicationId: PUBLICATION, viewerToken: dto.viewerToken, idempotencyKey: randomUUID() });
  dto = await assessmentRunsService.mutate(id, { action: 'present', publicationId: PUBLICATION, itemId: dto.items[0].id, viewerToken: dto.viewerToken, expectedRevision: dto.revision, idempotencyKey: randomUUID() });
  const source = await AssessmentRun.findOne({ ownerId: id, publicationId: PUBLICATION }).lean(); assert.ok(source);
  return { id, peerId, cookie: `session=${signJwt(id, process.env.JWT_SECRET!, 3600, version)}`, dto, sourceId: source._id, presentationId: dto.presentation!.presentationId, latestAcknowledgedRevision: dto.revision, acknowledgedKeys: [] };
}
async function main() {
  assert.ok(isAssessmentEnvironment()); assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
  const evidenceDirectory = await prepareLoadEvidence();
  const uri = new URL(process.env.MONGODB_URI!); assert.equal(uri.toString(), new URL(process.env.MATCHING_TEST_MONGODB_URI!).toString());
  assert.match(uri.pathname, /^\/vmeste_local_[a-f0-9]{12}_test$/); assert.ok((process.env.JWT_SECRET?.length ?? 0) >= 32);
  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
  const prefix = `load-${randomUUID()}`; stage = 'seed';
  for (let index = 0; index < PROFILE.virtualUsers; index++) { actors.push(await seedActor(index, prefix)); if (index % 5 === 4) report({ stage, actors: index + 1 }); }
  // Warm-up source jobs are completed before the measured offered load begins.
  await AssessmentJob.updateMany({ ownerId: { $in: actors.map(actor => actor.id) }, state: 'PENDING' }, { $set: { state: 'DONE' } });
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const part of req) chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
      const body = Buffer.concat(chunks); if (body.length > 65536) { res.writeHead(413).end(); return; }
      const request = new NextRequest(`http://${req.headers.host}${req.url}`, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : value]])), ...(body.length ? { body } : {}) });
      const response = req.url?.startsWith('/api/assessments/runs') ? await (req.method === 'POST' ? runPost(request) : runGet(request))
        : req.url === '/api/assessments/portfolio' ? await profileGet(request) : req.url === '/api/assessments/compare' ? await comparePost(request) : new Response(null, { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries())); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500).end('{"ok":false,"error":{"code":"ADAPTER_ERROR"}}'); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string'); const port = address.port;
  async function http<T>(actor: Actor, path: string, body?: object) {
    return new Promise<{ status: number; body: ApiSuccessEnvelope<T> | ApiErrorEnvelope; serialized: string }>((done, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', headers: { Host: `localhost:${port}`, Cookie: actor.cookie, ...(body ? { 'content-type': 'application/json', Origin: `http://localhost:${port}` } : {}) }, signal: AbortSignal.timeout(30000) }, response => {
        const chunks: Buffer[] = []; response.on('data', (part: Buffer) => chunks.push(part)); response.once('error', reject);
        response.once('end', () => { try { const serialized = Buffer.concat(chunks).toString('utf8'); done({ status: response.statusCode ?? 0, body: JSON.parse(serialized) as ApiSuccessEnvelope<T> | ApiErrorEnvelope, serialized }); } catch { reject(new Error('LOAD_RESPONSE_INVALID')); } });
      }); request.once('error', reject); if (body) request.write(JSON.stringify(body)); request.end();
    });
  }
  const queueSamples: Array<{ elapsedMs: number; pending: number; oldestAgeMs: number }> = [];
  const queue = async (elapsedMs: number) => { const filter = { ownerId: { $in: actors.map(actor => actor.id) }, state: { $in: ['PENDING', 'RUNNING'] } }; const oldest = await AssessmentJob.findOne(filter).sort({ createdAt: 1 }).lean(); queueSamples.push({ elapsedMs, pending: await AssessmentJob.countDocuments(filter), oldestAgeMs: oldest ? Date.now() - oldest.createdAt.getTime() : 0 }); };
  try {
    stage = 'http-warmup';
    const warm = await http<BetaComparisonDTO>(actors[0], '/api/assessments/compare', { actionIds: ['JOINT_SCHEDULE'] });
    assert.equal(warm.status, 200); assert.ok(warm.body.ok && warm.body.data.current && warm.body.data.scenarios.length > 0, 'warm-up executes a real conditional schedule plan');
    for (let index = 0; index < 2; index++) workers.push(spawn(process.execPath, ['--import', 'tsx', 'scripts/beta-worker.ts'], { env: process.env, windowsHide: true, stdio: 'ignore' }));
    const lanes = actors.map(() => Promise.resolve()); const started = performance.now(); const total = PROFILE.offeredRequestsPerSecond * PROFILE.steadySeconds; const kinds: Kind[] = ['save', 'profile', 'current', 'scenario'];
    const run = async (index: number, due: number) => {
      const actor = actors[index % actors.length], kind = kinds[index % kinds.length]; const began = performance.now(); inflight++; maxInflight = Math.max(maxInflight, inflight);
      const key = randomUUID();
      try {
        const response = kind === 'save' ? await http<AssessmentRunDTO>(actor, '/api/assessments/runs', { action: 'answer', publicationId: PUBLICATION, viewerToken: actor.dto.viewerToken, presentationId: actor.presentationId, expectedRevision: actor.dto.revision, idempotencyKey: key, response: { kind: 'MISSING', reason: index % 2 ? 'SKIPPED' : 'NO_EXPERIENCE' } })
          : kind === 'profile' ? await http<AssessmentPortfolioDTO>(actor, '/api/assessments/portfolio') : await http<BetaComparisonDTO>(actor, '/api/assessments/compare', { actionIds: kind === 'scenario' ? ['JOINT_SCHEDULE'] : [] });
        const outcome: Sample['outcome'] = response.status >= 200 && response.status < 300 ? 'OK' : response.status === 409 ? 'CONFLICT' : response.status === 429 ? 'RATE_LIMIT' : [401, 403].includes(response.status) ? 'AUTH' : response.status >= 500 ? 'SERVER' : 'CLIENT';
        samples.push({ kind, status: response.status, latencyMs: performance.now() - began, queueDelayMs: began - due, outcome });
        if (kind === 'save' && response.body.ok) { actor.dto = response.body.data as AssessmentRunDTO; actor.latestAcknowledgedRevision = actor.dto.revision; actor.acknowledgedKeys.push(assessmentIdentity(actor.sourceId, key)); }
        if ((kind === 'current' || kind === 'scenario') && /LOAD_PRIVATE_|"answers"|"sourceSetIdentity"|"certificate"|"negative"/.test(response.serialized)) unauthorizedDisclosures++;
      } catch { samples.push({ kind, status: 0, latencyMs: performance.now() - began, queueDelayMs: began - due, outcome: 'NETWORK' }); }
      finally { inflight--; }
    };
    stage = 'steady'; await queue(0); report({ stage, profile: PROFILE, transport: 'real TCP HTTP adapter calling actual Next route exports; not production Next hosting measurement', virtualUsers: actors.length, workers: 2 });
    for (let index = 0; index < total; index++) {
      const due = started + index * 1000 / PROFILE.offeredRequestsPerSecond; await delay(Math.max(0, due - performance.now()));
      const lane = index % actors.length; lanes[lane] = lanes[lane].then(() => run(index, due));
      if (index > 0 && index % 300 === 0) { await queue(performance.now() - started); report({ stage, offered: index, completed: samples.length, elapsedSeconds: Math.round((performance.now() - started) / 1000) }); }
    }
    await delay(Math.max(0, started + PROFILE.steadySeconds * 1000 - performance.now()));
    await Promise.all(lanes); const elapsedMs = performance.now() - started; await queue(elapsedMs); stage = 'verification';
    let lostAcknowledgedWrites = 0;
    for (const actor of actors) { const source = await AssessmentRun.findById(actor.sourceId).lean(); if (!source || source.revision < actor.latestAcknowledgedRevision) lostAcknowledgedWrites++;
      const persisted = await AssessmentOperation.countDocuments({ _id: { $in: actor.acknowledgedKeys }, ownerId: actor.id }); lostAcknowledgedWrites += actor.acknowledgedKeys.length - persisted; }
    const duplicates = await AssessmentRun.aggregate<{ count: number }>([{ $match: { ownerId: { $in: actors.map(actor => actor.id) } } }, { $group: { _id: { ownerId: '$ownerId', publicationId: '$publicationId', version: '$publicationVersion' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
    const drainStart = Date.now(); let remaining = 1;
    while (remaining && Date.now() - drainStart < 30000) { remaining = await AssessmentJob.countDocuments({ ownerId: { $in: actors.map(actor => actor.id) }, state: { $in: ['PENDING', 'RUNNING'] } }); if (remaining) await delay(250); }
    const recoveryLagMs = Date.now() - drainStart; await queue(elapsedMs + recoveryLagMs);
    let staleWorkerOverwrite = 0; const portfolios = await AssessmentPortfolio.find({ ownerId: { $in: actors.map(actor => actor.id) } }).lean();
    for (const row of portfolios) if (row.materializedRevision > row.sourceSetRevision || (remaining === 0 && row.materializedRevision !== row.sourceSetRevision)) staleWorkerOverwrite++;
    // Adversarial expired fence check alongside the load result, independent of successful write counts.
    for (const worker of workers) worker.kill(); await Promise.all(workers.map(worker => worker.exitCode !== null ? Promise.resolve() : new Promise<void>(done => worker.once('exit', () => done())))); workers.length = 0;
    await assessmentTransaction(session => enqueueAssessmentProjection({ ownerId: actors[0].id, sourceSetRevision: 999999, deletionGeneration: 0 }, session));
    const old = await claimAssessmentJob('load-old-worker'); assert.ok(old); await AssessmentJob.updateOne({ _id: old._id }, { $set: { leaseExpiresAt: new Date(0) } }); const replacement = await claimAssessmentJob('load-new-worker'); assert.ok(replacement);
    try { await assessmentTransaction(session => fenceAssessmentJob(old, session)); staleWorkerOverwrite++; } catch (error) { assert.ok(error instanceof DomainError && error.code === 'JOB_LEASE_LOST'); }
    await executeAssessmentJob(replacement);
    const byKind = Object.fromEntries(kinds.map(kind => [kind, { all: summary(samples.filter(sample => sample.kind === kind).map(sample => sample.latencyMs)), successful: summary(samples.filter(sample => sample.kind === kind && sample.outcome === 'OK').map(sample => sample.latencyMs)) }]));
    const errorCategories = Object.fromEntries(['OK', 'CONFLICT', 'RATE_LIMIT', 'AUTH', 'SERVER', 'NETWORK', 'CLIENT'].map(outcome => [outcome, samples.filter(sample => sample.outcome === outcome).length]));
    const result = { id: 'BETA-107', profile: PROFILE, environment: { node: process.version, platform: process.platform, architecture: process.arch, database: 'owned loopback MongoDB replica set', http: 'TCP route-export adapter', workerProcesses: 2 },
      offered: total, completed: samples.length, steadyDurationMs: elapsedMs, offeredPerSecond: PROFILE.offeredRequestsPerSecond, achievedPerSecond: samples.length / (elapsedMs / 1000), maximumConcurrentRequests: maxInflight,
      latencyMs: byKind, schedulerQueueDelayMs: summary(samples.map(sample => sample.queueDelayMs)), errorCategories, queueSamples, recoveryLagMs,
      correctness: { lostAcknowledgedWrites, duplicateCanonicalSources: duplicates.length, staleWorkerOverwrite, knownUnauthorizedPayloadDisclosures: unauthorizedDisclosures }, limitations: ['Synthetic profile, not SLA/capacity proof', 'Production Next routing/hosting and native browser measured by separate acceptance', 'Scenario endpoint runs bounded computation synchronously; latency is end-to-end completion, not fictitious async queue time'] };
    report({ stage: 'result', ...result });
    const evidencePath = join(evidenceDirectory, 'BETA_LOAD_RESULT.json');
    await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    report({ stage: `result-file:${evidencePath}` });
    assert.equal(samples.length, total); assert.equal(lostAcknowledgedWrites, 0); assert.equal(duplicates.length, 0); assert.equal(staleWorkerOverwrite, 0); assert.equal(unauthorizedDisclosures, 0); assert.equal(remaining, 0);
    assert.equal(errorCategories.SERVER + errorCategories.NETWORK + errorCategories.AUTH + errorCategories.CLIENT, 0);
    for (const kind of kinds) assert.ok(byKind[kind].successful.count > 0, `successful ${kind} latency denominator is nonempty`);
    assert.ok(byKind.save.successful.p95! <= PROFILE.goals.saveP95Ms); assert.ok(byKind.profile.successful.p95! <= PROFILE.goals.ownerProfileP95Ms); assert.ok(byKind.current.successful.p95! <= PROFILE.goals.currentComparisonP95Ms); assert.ok(byKind.scenario.successful.p95! <= PROFILE.goals.scenarioCompletionP95Ms);
    report({ stage: 'completed', status: 'PASSED', id: 'BETA-107', assertion: '25 VU 10 offered HTTP requests per second for 120 seconds; measured goals and persisted integrity assertions' });
  } finally {
    for (const worker of workers) if (worker.exitCode === null) worker.kill();
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    const ids = actors.flatMap(actor => [actor.id, actor.peerId]); const db = mongoose.connection.db!;
    for (const collection of ['assessment_runs', 'assessment_operations', 'assessment_direct', 'assessment_portfolios', 'assessment_practices', 'assessment_jobs']) await db.collection(collection).deleteMany({ ownerId: { $in: ids } });
    await AssessmentParticipant.deleteMany({ _id: { $in: ids } }); await Pair.deleteMany({ members: { $in: ids } }); await User.deleteMany({ id: { $in: ids } }); await SessionSubject.deleteMany({ subjectKey: { $in: ids.map(privacySubjectHash) } });
  }
}
main().catch(error => { const reason = error instanceof DomainError ? error.code : error instanceof mongoose.mongo.MongoServerError ? `DATABASE_CODE_${error.code}` : error instanceof Error ? `${error.name} line ${/beta-load\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1] ?? 'unavailable'}` : 'LOAD_FAILED'; report({ stage: `${stage}: ${reason}`, status: 'failed' }); process.exitCode = 1; }).finally(() => mongoose.disconnect());
