import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, realpath, readFile, rm, copyFile, symlink, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentRun } from '@/models/AssessmentRun';
import { AssessmentPortfolio } from '@/models/AssessmentPortfolio';
import { AssessmentJob, AssessmentSupport, AssessmentRuntimeControl, AssessmentOpsEvent } from '@/models/AssessmentOperations';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';
import { assessmentPurposeAllowed, assessmentTargetId, assessmentTransaction, isAssessmentEnabled, requireAssessmentOwner } from '@/domain/services/assessmentAccess.service';
import { claimAssessmentJob, enqueueAssessmentProjection, executeAssessmentJob, fenceAssessmentJob, recordAssessmentOps } from '@/domain/services/assessmentJobs.service';
import { assessmentHealth, deliverAssessmentAlert, inviteAssessmentParticipant, migrateAssessmentAdditive, revokeAssessmentParticipant, setAssessmentStops } from '@/domain/services/assessmentOperations.service';
import { assessmentRunsService } from '@/domain/services/assessmentRuns.service';
import { accountDeletionService } from '@/domain/services/accountDeletion.service';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import { AssessmentRegistrationSchema, AssessmentSettingsMutationSchema } from '@/domain/assessment/admission';
import { captureBetaBackup, restoreBetaBackup } from './lib/beta-restore';
import { checkBetaAdmissionHttp } from './lib/beta-admission-http';

const receipts: Array<{ id: string; assertion: string; status: 'PASS'; layer: string }> = [];
async function check(id: string, assertion: string, work: () => Promise<void>, layer = 'MONGODB_OWNED_REPLICA_SET') {
  await work(); receipts.push({ id, assertion, status: 'PASS', layer });
  process.stdout.write(`${JSON.stringify({ suite: 'beta-ops', id, assertion, status: 'PASS', layer })}\n`);
}
const denied = async (work: () => Promise<object | void>, code?: string) => assert.rejects(work, error => error instanceof DomainError && (!code || error.code === code));
async function freePort() { const server = createServer(); await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string'); await new Promise<void>(done => server.close(() => done())); return address.port; }
async function seed(ownerId: string) {
  await User.updateOne({ id: ownerId }, { $set: { username: 'Синтетическая проверка' } }, { upsert: true });
  await SessionSubject.updateOne({ subjectKey: privacySubjectHash(ownerId) }, { $set: { version: randomUUID(), accountState: 'ACTIVE' } }, { upsert: true });
  await AssessmentParticipant.create({ _id: ownerId, environment: 'ISOLATED_SYNTHETIC', cohortId: 'owned-ops', membershipStatus: 'INVITED' });
}
async function register(ownerId: string) {
  const current = await assessmentAdmissionService.get(ownerId);
  return assessmentAdmissionService.register(ownerId, { viewerToken: current.viewerToken, idempotencyKey: randomUUID(), termsAccepted: true, adultConfirmed: true,
    termsVersion: current.termsVersion as 'assessment-terms-2026-09-10', informationVersion: current.informationVersion as 'assessment-data-flow-2026-09-10', ownerAssessment: true, discovery: false, pairSharing: false });
}
async function pendingSource(ownerId: string) {
  const publicationId = 'com-s02-knowledge-beta';
  let dto = await assessmentRunsService.get(ownerId, publicationId);
  dto = await assessmentRunsService.mutate(ownerId, { action: 'start', publicationId, idempotencyKey: randomUUID(), viewerToken: dto.viewerToken });
  while (dto.items.some(item => item.available && !item.answered)) {
    const item = dto.items.find(candidate => candidate.available && !candidate.answered)!;
    dto = await assessmentRunsService.mutate(ownerId, { action: 'present', publicationId, itemId: item.id, expectedRevision: dto.revision, idempotencyKey: randomUUID(), viewerToken: dto.viewerToken });
    dto = await assessmentRunsService.mutate(ownerId, { action: 'answer', publicationId, presentationId: dto.presentation!.presentationId, expectedRevision: dto.revision, idempotencyKey: randomUUID(), viewerToken: dto.viewerToken, response: { kind: 'MISSING', reason: 'SKIPPED' } });
  }
  await assert.rejects(() => assessmentRunsService.mutate(ownerId, { action: 'finalize', publicationId, expectedRevision: dto.revision, idempotencyKey: randomUUID(), viewerToken: dto.viewerToken }, { afterSourceCommitted: async () => { throw new Error('OWNED_CRASH_AFTER_COMMIT'); } }), /OWNED_CRASH_AFTER_COMMIT/);
  const source = await AssessmentRun.findOne({ ownerId, publicationId }).lean(); assert.equal(source?.status, 'FINALIZED'); assert.equal(source?.materializedRevision, -1);
  return source!;
}
async function runChildResult(args: string[]): Promise<{ code: number | null; output: string; diagnostic: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', ...args], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', diagnostic = ''; child.stdout.on('data', (data: Buffer) => { output += data.toString(); }); child.stderr.on('data', (data: Buffer) => { diagnostic += data.toString(); });
  const result = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
  return { code: result, output, diagnostic };
}
async function runChild(args: string[]): Promise<string> {
  const result = await runChildResult(args); assert.equal(result.code, 0, 'Owned executable process exited successfully'); return result.output;
}
async function suite(primaryUri: string, restoreUri: string, unavailableUri: string) {
  await mongoose.connect(primaryUri, { autoIndex: false });
  for (const model of Object.values(mongoose.models)) await model.createCollection();
  await check('BETA-103', 'migration dry run changes no runtime control; interrupted additive apply resumes and repeats', async () => {
    const dry = await migrateAssessmentAdditive(false); assert.equal(dry.apply, false); assert.equal(await AssessmentRuntimeControl.countDocuments(), 0);
    let interrupted = false;
    await assert.rejects(() => migrateAssessmentAdditive(true, async () => { if (!interrupted) { interrupted = true; throw new Error('OWNED_MIGRATION_CRASH'); } }), /OWNED_MIGRATION_CRASH/);
    await migrateAssessmentAdditive(true); const counts = (await mongoose.connection.db!.collection('assessment_jobs').indexes()).length;
    await migrateAssessmentAdditive(true); assert.equal((await mongoose.connection.db!.collection('assessment_jobs').indexes()).length, counts);
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { recoveryReconciled: true } });
  });
  const a = 'beta-ops-owner-a'; const b = 'beta-ops-owner-b'; const deleted = 'beta-ops-deleted'; const revoked = 'beta-ops-revoked';
  await checkBetaAdmissionHttp(check);
  for (const owner of [a, b, deleted, revoked]) await seed(owner);
  await check('BETA-082', 'unlisted owner and forged registration membership cannot enter private mode', async () => {
    const before = process.env.ASSESSMENT_MODE; process.env.ASSESSMENT_MODE = 'PRIVATE_BETA';
    assert.equal(isAssessmentEnabled(), false); await denied(() => requireAssessmentOwner(a), 'NOT_FOUND');
    process.env.ASSESSMENT_MODE = before; await denied(() => requireAssessmentOwner('unlisted'), 'NOT_FOUND');
    const settings = await assessmentAdmissionService.get(a);
    assert.equal(AssessmentRegistrationSchema.safeParse({ ...settings, isBeta: true, actorId: b }).success, false);
  });
  await check('BETA-083', 'synthetic toggle and local test target fail PRIVATE_BETA startup guard', async () => {
    process.env.ASSESSMENT_MODE = 'PRIVATE_BETA'; process.env.ASSESSMENT_BETA_APPROVALS_PATH = 'missing-approval.json'; assert.equal(isAssessmentEnabled(), false);
    process.env.ASSESSMENT_MODE = 'SYNTHETIC'; delete process.env.ASSESSMENT_BETA_APPROVALS_PATH;
  });
  await check('BETA-084', 'one persisted choice, idempotent registration response-loss retry, separate purposes and no future scope', async () => {
    const current = await assessmentAdmissionService.get(a);
    const request = { viewerToken: current.viewerToken, idempotencyKey: randomUUID(), termsAccepted: true as const, adultConfirmed: true as const,
      termsVersion: 'assessment-terms-2026-09-10' as const, informationVersion: 'assessment-data-flow-2026-09-10' as const, ownerAssessment: true, discovery: false, pairSharing: false };
    const first = await assessmentAdmissionService.register(a, request); const repeat = await assessmentAdmissionService.register(a, request);
    assert.equal(first.revision, repeat.revision); assert.equal(first.registration?.acceptedAt, repeat.registration?.acceptedAt);
    const participant = await requireAssessmentOwner(a); assert.equal(assessmentPurposeAllowed(participant, 'OWNER', 'com-s02-knowledge-beta'), true);
    assert.equal(assessmentPurposeAllowed(participant, 'MATCHING'), false); assert.equal(assessmentPurposeAllowed(participant, 'PAIR'), false); assert.equal(assessmentPurposeAllowed(participant, 'OWNER', 'future-sensitive-module'), false);
    assert.equal(AssessmentSettingsMutationSchema.safeParse({ ...repeat.settings, viewerToken: repeat.viewerToken, expectedRevision: repeat.revision, research: true }).success, false);
    await denied(() => assessmentAdmissionService.updateSettings(a, { ...repeat.settings, viewerToken: repeat.viewerToken, expectedRevision: repeat.revision, publicationIds: ['future-sensitive-module'] }), 'PURPOSE_NOT_APPROVED');
    await denied(() => assessmentAdmissionService.updateSettings(b, { ...repeat.settings, viewerToken: repeat.viewerToken, expectedRevision: 0 }), 'VIEWER_CONTEXT_STALE');
  });
  await register(b); await register(deleted); await register(revoked);
  await check('BETA-094', 'source finalization commits durable job before response failure; automatic worker computes saved source', async () => {
    const before = (await assessmentAdmissionService.get(a)).registration?.acceptedAt;
    const source = await pendingSource(a); assert.ok(await AssessmentJob.exists({ ownerId: a, state: 'PENDING' }));
    const output = await runChild(['scripts/beta-worker.ts', '--once']); assert.match(output, /"completed":/);
    assert.equal((await AssessmentRun.findById(source._id).lean())?.materializedRevision, source.revision);
    assert.equal((await assessmentAdmissionService.get(a)).registration?.acceptedAt, before, 'normal form saves and recompute never re-register');
  });
  await check('BETA-099', 'separate runnable worker process recovers without participant read or retry', async () => {
    const source = await pendingSource(b); await runChild(['scripts/beta-worker.ts', '--once']);
    assert.equal((await AssessmentRun.findById(source._id).lean())?.materializedRevision, source.revision);
  });
  await check('BETA-084', 'explicit central scope applies saved forms; revoke changes epoch and rejects stale settings intent', async () => {
    const before = await assessmentAdmissionService.get(a);
    const enabled = await assessmentAdmissionService.updateSettings(a, { ...before.settings, discovery: true, pairSharing: true, viewerToken: before.viewerToken, expectedRevision: before.revision });
    const rows = await AssessmentRun.find({ ownerId: a }).lean(); assert.ok(rows.length > 0 && rows.every(row => row.matchingUse && row.pairUse));
    assert.equal(enabled.registration?.acceptedAt, before.registration?.acceptedAt); assert.notEqual(enabled.viewerToken, before.viewerToken);
    await denied(() => assessmentAdmissionService.updateSettings(a, { ...before.settings, viewerToken: before.viewerToken, expectedRevision: before.revision }), 'VIEWER_CONTEXT_STALE');
    const disabled = await assessmentAdmissionService.updateSettings(a, { ...enabled.settings, discovery: false, pairSharing: false, viewerToken: enabled.viewerToken, expectedRevision: enabled.revision });
    assert.equal(disabled.settings.discovery, false); assert.ok((await AssessmentRun.find({ ownerId: a }).lean()).every(row => !row.matchingUse && !row.pairUse));
    assert.equal((await AssessmentParticipant.findById(a).lean())?.choiceHistory?.length, 2);
  });
  await AssessmentJob.updateMany({ state: 'PENDING' }, { $set: { state: 'DONE' } });
  await check('BETA-095', 'two concurrent workers claim one semantic source-set job only once', async () => {
    await assessmentTransaction(async session => { await enqueueAssessmentProjection({ ownerId: a, sourceSetRevision: 900, deletionGeneration: 0 }, session); await enqueueAssessmentProjection({ ownerId: a, sourceSetRevision: 900, deletionGeneration: 0 }, session); });
    const jobs = await Promise.all([claimAssessmentJob('worker-a'), claimAssessmentJob('worker-b')]); assert.equal(jobs.filter(Boolean).length, 1);
    assert.equal(await AssessmentJob.countDocuments({ ownerId: a, sourceSetRevision: 900 }), 1);
    await executeAssessmentJob(jobs.find(Boolean)!);
  });
  await check('BETA-096', 'expired lease takeover fences old persist and acknowledge', async () => {
    await assessmentTransaction(session => enqueueAssessmentProjection({ ownerId: a, sourceSetRevision: 901, deletionGeneration: 0 }, session));
    const old = await claimAssessmentJob('worker-old'); assert.ok(old);
    await AssessmentJob.updateOne({ _id: old._id }, { $set: { leaseExpiresAt: new Date(Date.now() - 1) } });
    const next = await claimAssessmentJob('worker-new'); assert.ok(next && next.fence > old.fence);
    await denied(() => assessmentTransaction(session => fenceAssessmentJob(old, session)), 'JOB_LEASE_LOST');
    assert.equal(await executeAssessmentJob(next), 'DONE'); assert.equal(await executeAssessmentJob(old), 'LEASE_LOST');
  });
  await check('BETA-097', 'retry uses bounded attempts and terminal dead-letter visible to health', async () => {
    await assessmentTransaction(session => enqueueAssessmentProjection({ ownerId: a, sourceSetRevision: 902, deletionGeneration: 0 }, session));
    for (let attempt = 1; attempt <= 5; attempt++) {
      const job = await claimAssessmentJob(`failure-${attempt}`); assert.ok(job); assert.equal(job.attempts, attempt);
      assert.equal(await executeAssessmentJob(job, { afterClaim: async () => { throw new Error('OWNED_COMPUTE_FAILURE'); } }), attempt === 5 ? 'DEAD_LETTER' : 'RETRY');
      const row = await AssessmentJob.findById(job._id).lean(); assert.ok(row!.notBefore.getTime() > Date.now());
      await AssessmentJob.updateOne({ _id: job._id }, { $set: { notBefore: new Date(0) } });
    }
    assert.ok((await assessmentHealth()).alerts.includes('DEAD_LETTER_PRESENT'));
  });
  await check('BETA-100', 'process restart after claim and after computation recovers expired lease', async () => {
    await assessmentTransaction(session => enqueueAssessmentProjection({ ownerId: a, sourceSetRevision: 903, deletionGeneration: 0 }, session));
    const job = await claimAssessmentJob('crashed-process'); assert.ok(job); await AssessmentJob.updateOne({ _id: job._id }, { $set: { leaseExpiresAt: new Date(0) } });
    await runChild(['scripts/beta-worker.ts', '--once']); assert.equal((await AssessmentJob.findById(job._id).lean())?.state, 'DONE');
    await assessmentTransaction(session => enqueueAssessmentProjection({ ownerId: a, sourceSetRevision: 904, deletionGeneration: 0 }, session));
    const computed = await claimAssessmentJob('before-ack-process'); assert.ok(computed);
    assert.equal(await executeAssessmentJob(computed, { beforeAcknowledge: async () => { throw new Error('OWNED_ACK_LOSS'); } }), 'RETRY');
    await AssessmentJob.updateOne({ _id: computed._id }, { $set: { notBefore: new Date(0) } }); await runChild(['scripts/beta-worker.ts', '--once']);
    assert.equal((await AssessmentJob.findById(computed._id).lean())?.state, 'DONE');
  });
  await check('BETA-098', 'membership revocation after computation fences projection persistence', async () => {
    const ownerId = 'beta-ops-compute-race'; await seed(ownerId); await register(ownerId);
    const source = await pendingSource(ownerId);
    await AssessmentJob.updateMany({ ownerId: { $ne: ownerId }, state: 'PENDING' }, { $set: { state: 'DONE' } });
    const job = await claimAssessmentJob('revoked-after-compute'); assert.ok(job && job.ownerId === ownerId);
    assert.equal(await executeAssessmentJob(job, { afterComputed: () => revokeAssessmentParticipant(ownerId) }), 'LEASE_LOST');
    const row = await AssessmentRun.findById(source._id).lean(); assert.equal(row?.materializedRevision, -1); assert.equal(row?.snapshot, null);
    assert.equal((await AssessmentJob.findById(job._id).lean())?.state, 'CANCELLED');
  });
  await check('BETA-090', 'private support has no automatic source attachment and rejects foreign result', async () => {
    const current = await assessmentAdmissionService.get(a);
    const ticket = await assessmentAdmissionService.support(a, { viewerToken: current.viewerToken, idempotencyKey: randomUUID(), category: 'CLARITY', message: 'Синтетический вопрос о ясности.' });
    const row = await AssessmentSupport.findById(ticket.id).lean(); assert.equal(row?.attachment, null); assert.equal(row?.publicationId, null); assert.equal('answers' in row!, false);
    const peerRun = await AssessmentRun.findOne({ ownerId: b }).lean(); assert.ok(peerRun);
    await denied(() => assessmentAdmissionService.support(a, { viewerToken: current.viewerToken, idempotencyKey: randomUUID(), category: 'BUG', message: 'Попытка вложения', attachResult: { runId: peerRun._id, revision: peerRun.revision, consent: true } }), 'SOURCE_UNAVAILABLE');
    assert.equal((await assessmentAdmissionService.supportList(b)).length, 0);
  });
  await check('BETA-090', 'protected operator support CLI writes one private ticket and records audit without payload in stdout', async () => {
    const ticket = await AssessmentSupport.findOne({ ownerId: a }).lean(); assert.ok(ticket);
    const parent = await realpath(tmpdir()), directory = await mkdtemp(join(parent, 'vmeste-beta-support-read-')), path = join(directory, 'private-ticket.json');
    const before = await AssessmentOpsEvent.countDocuments({ code: 'SUPPORT_TICKET_READ' });
    try {
      const deniedRead = await runChildResult(['scripts/beta-ops.ts', 'support-read', `--ticket=${ticket._id}`, `--output=${path}`]);
      assert.notEqual(deniedRead.code, 0); assert.match(deniedRead.diagnostic, /BETA_EXPLICIT_TARGET_APPLY_REQUIRED/);
      await assert.rejects(() => readFile(path), error => error instanceof Error && 'code' in error && error.code === 'ENOENT');
      const output = await runChild(['scripts/beta-ops.ts', 'support-read', '--apply', `--target-id=${assessmentTargetId()}`, `--ticket=${ticket._id}`, `--output=${path}`]);
      assert.equal(output.includes(ticket.message), false); assert.equal(output.includes(a), false); assert.equal(output.includes(b), false);
      const data = JSON.parse(await readFile(path, 'utf8')) as { id: string; message: string; attachment: object | null };
      assert.equal(data.id, ticket._id); assert.equal(data.message, ticket.message); assert.equal(data.attachment, null);
      assert.equal(await AssessmentOpsEvent.countDocuments({ code: 'SUPPORT_TICKET_READ' }), before + 1);
      const audit = await AssessmentOpsEvent.findOne({ code: 'SUPPORT_TICKET_READ' }).lean();
      assert.equal(JSON.stringify(audit).includes(ticket.message), false); assert.equal(JSON.stringify(audit).includes(a), false);
    } finally { const actual = await realpath(directory); assert.ok(actual.startsWith(`${parent}${sep}`) && actual === resolve(directory)); await rm(actual, { recursive: true, force: true }); }
  });
  await check('BETA-124', 'protected operator CLI invites and revokes synthetic participant; concurrent cohort admission stays bounded with safe audit', async () => {
    const ownerId = 'beta-ops-operator-invite'; await seed(ownerId); await User.updateOne({ id: ownerId }, { $set: { 'personal.age': 25 } }); await AssessmentParticipant.deleteOne({ _id: ownerId });
    const args = ['scripts/beta-ops.ts', 'invite', `--subject=${ownerId}`, '--cohort=owned-cli'];
    const missing = await runChildResult(args); assert.notEqual(missing.code, 0); assert.match(missing.diagnostic, /BETA_EXPLICIT_TARGET_APPLY_REQUIRED/);
    const wrongTarget = await runChildResult([...args, '--apply', `--target-id=${'0'.repeat(64)}`]); assert.notEqual(wrongTarget.code, 0); assert.equal(await AssessmentParticipant.exists({ _id: ownerId }), null);
    const output = await runChild([...args, '--apply', `--target-id=${assessmentTargetId()}`]); assert.equal(output.includes(ownerId), false);
    const invited = await AssessmentParticipant.findById(ownerId).lean(); assert.equal(invited?.membershipStatus, 'INVITED'); assert.equal(invited?.settings?.ownerAssessment, false); assert.equal(invited?.registration, null);
    await register(ownerId); await pendingSource(ownerId);
    await runChild(['scripts/beta-ops.ts', 'revoke', '--apply', `--target-id=${assessmentTargetId()}`, `--subject=${ownerId}`]);
    assert.equal((await AssessmentParticipant.findById(ownerId).lean())?.membershipStatus, 'REVOKED');
    assert.equal(await AssessmentJob.countDocuments({ ownerId, state: { $in: ['PENDING', 'RUNNING'] } }), 0);
    const cohortId = 'owned-cap-race';
    await AssessmentParticipant.insertMany(Array.from({ length: 99 }, (_, index) => ({ _id: `owned-cap-existing-${index}`, environment: 'ISOLATED_SYNTHETIC', cohortId, membershipStatus: 'INVITED' })));
    try {
      const race = await Promise.allSettled([inviteAssessmentParticipant('owned-cap-candidate-a', cohortId), inviteAssessmentParticipant('owned-cap-candidate-b', cohortId)]);
      assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
      assert.ok(race.some(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'BETA_COHORT_FULL'));
      assert.equal(await AssessmentParticipant.countDocuments({ cohortId, membershipStatus: { $in: ['INVITED', 'ACTIVE'] } }), 100);
    } finally { await AssessmentParticipant.deleteMany({ cohortId }); }
    const audit = await AssessmentOpsEvent.find({ code: { $in: ['PARTICIPANT_INVITED', 'PARTICIPANT_REVOKED'] } }).lean();
    assert.ok(audit.some(row => row.code === 'PARTICIPANT_INVITED') && audit.some(row => row.code === 'PARTICIPANT_REVOKED'));
    const serialized = JSON.stringify(audit); assert.equal(serialized.includes(ownerId), false); assert.equal(serialized.includes('owned-cap-candidate'), false); assert.equal(serialized.includes('answers'), false);
  });
  await check('BETA-123', 'operator publication and feature stops fence queued work; OFF restart preserves revoked permissions and controls', async () => {
    const ownerId = 'beta-ops-switch-owner'; await seed(ownerId); await register(ownerId);
    const source = await pendingSource(ownerId), target = `--target-id=${assessmentTargetId()}`;
    const command = (name: string, flags: string[] = []) => runChild(['scripts/beta-ops.ts', name, '--apply', target, ...flags]);
    try {
      await command('stop-publication', [`--publication=${source.publicationId}`]);
      await denied(() => assessmentRunsService.get(ownerId, source.publicationId), 'CONTENT_RETIRED');
      assert.ok(await assessmentRunsService.getControls(ownerId, source.publicationId));
      await runChild(['scripts/beta-worker.ts', '--once']);
      assert.equal((await AssessmentRun.findById(source._id).lean())?.snapshot, null);
      await command('stop');
      await denied(() => assessmentRunsService.get(ownerId, source.publicationId), 'BETA_PAUSED');
      assert.ok(await assessmentAdmissionService.exportOwnerData(ownerId));
      await runChild(['scripts/beta-worker.ts', '--once']);
      assert.equal((await AssessmentRun.findById(source._id).lean())?.snapshot, null);
      await command('revoke', [`--subject=${ownerId}`]);
      process.env.ASSESSMENT_MODE = 'OFF';
      const offline = await runChild(['scripts/beta-worker.ts', '--once']); assert.match(offline, /"claimed":0/);
      assert.ok(await assessmentRunsService.getControls(ownerId, source.publicationId));
      assert.equal((await assessmentAdmissionService.get(ownerId)).settings.ownerAssessment, false);
      process.env.ASSESSMENT_MODE = 'SYNTHETIC';
      await command('resume-publication', [`--publication=${source.publicationId}`]); await command('resume');
      await runChild(['scripts/beta-worker.ts', '--once']);
      await denied(() => requireAssessmentOwner(ownerId), 'BETA_ENROLLMENT_REQUIRED');
      const participant = await AssessmentParticipant.findById(ownerId).lean(), saved = await AssessmentRun.findById(source._id).lean();
      assert.equal(participant?.settings?.ownerAssessment, false); assert.equal(participant?.settings?.discovery, false); assert.equal(saved?.pairUse, false); assert.equal(saved?.matchingUse, false); assert.equal(saved?.snapshot, null);
      assert.equal(await AssessmentJob.countDocuments({ ownerId, state: { $in: ['PENDING', 'RUNNING'] } }), 0);
    } finally { process.env.ASSESSMENT_MODE = 'SYNTHETIC'; await command('resume-publication', [`--publication=${source.publicationId}`]); await command('resume'); }
  });
  await check('BETA-123', 'actual retained baseline release rollback fences reads writes comparisons and recomputation without restoring revoked rights', async () => {
    const baseline = 'e61642a3b78b9c088dfb0496677c00cf2217ab3f', ownerId = `beta-ops-rollback-${randomBytes(4).toString('hex')}`;
    await seed(ownerId); await register(ownerId); const source = await pendingSource(ownerId); await revokeAssessmentParticipant(ownerId);
    const parent = await realpath(tmpdir()), directory = await mkdtemp(join(parent, 'vmeste-baseline-rollback-')), release = join(directory, 'release'); await mkdir(release);
    const modules = join(release, 'node_modules'); let linked = false;
    const git = (args: string[]) => { const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'buffer', windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024 }); assert.equal(result.status, 0, 'Owned baseline Git command succeeded'); return result.stdout; };
    const beforeIndex = git(['ls-files', '--stage', '-z']);
    try {
      assert.equal(git(['rev-parse', baseline]).toString().trim(), baseline);
      git(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', `--output=${join(directory, 'baseline.tar')}`, baseline]);
      const extracted = spawnSync('tar', ['-xf', join(directory, 'baseline.tar'), '-C', release], { windowsHide: true, timeout: 30000, stdio: 'pipe' }); assert.equal(extracted.status, 0, 'Exact retained baseline archive extracted');
      // Prove the imported access/run/comparison modules are the pinned old bytes, not current-checkout substitutes.
      for (const file of ['src/domain/services/assessmentAccess.service.ts', 'src/domain/services/assessmentRuns.service.ts', 'src/domain/services/assessmentComparison.service.ts']) {
        assert.deepEqual(await readFile(join(release, file)), git(['show', `${baseline}:${file}`]));
      }
      await symlink(await realpath(resolve('node_modules')), modules, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
      await copyFile(resolve('scripts/lib/beta-rollback-probe.ts'), join(release, 'scripts/beta-rollback-probe.ts'));
      process.env.BETA_ROLLBACK_PROBE_OWNER = ownerId;
      const args = ['scripts/beta-rollback.ts', `--release-dir=${release}`, '--entry=scripts/beta-rollback-probe.ts', '--typescript', `--target-id=${assessmentTargetId()}`];
      assert.notEqual((await runChildResult(args)).code, 0, 'Rollback launcher requires explicit apply');
      assert.notEqual((await runChildResult([...args.filter(arg => !arg.startsWith('--target-id=')), '--target-id=foreign-target', '--apply'])).code, 0, 'Rollback launcher rejects another target');
      for (let restart = 0; restart < 2; restart++) {
        // Deliberately leave the calling process enabled; the launcher must override both old and new flags.
        const result = await runChildResult([...args, '--apply']); assert.equal(result.code, 0, 'Actual retained baseline process completed all rollback assertions');
        assert.match(result.output, /"suite":"beta-rollback-baseline","status":"PASS"/); assert.equal(result.output.includes(ownerId), false);
      }
      const participant = await AssessmentParticipant.findById(ownerId).lean(), saved = await AssessmentRun.findById(source._id).lean();
      assert.equal(participant?.membershipStatus, 'REVOKED'); assert.equal(participant.settings?.ownerAssessment, false); assert.equal(participant.settings?.discovery, false); assert.equal(participant.settings?.pairSharing, false);
      assert.equal(saved?.snapshot, null); assert.equal(saved?.pairUse, false); assert.equal(saved?.matchingUse, false); assert.equal(await AssessmentJob.countDocuments({ ownerId, state: { $in: ['PENDING', 'RUNNING'] } }), 0);
      assert.deepEqual((await AssessmentRuntimeControl.findById(assessmentTargetId()).lean())?.stoppedEffects.slice().sort(), ['DISCLOSURE', 'MATCHING', 'NOTIFICATIONS', 'PAIR', 'SUBMISSIONS']);
      assert.deepEqual(git(['ls-files', '--stage', '-z']), beforeIndex, 'Extracting and executing the old release preserves the user index');
      process.stdout.write(`${JSON.stringify({ suite: 'beta-ops', status: 'PASS', assertion: 'retained rollback artifact identity', baseline, accessSha256: createHash('sha256').update(await readFile(join(release, 'src/domain/services/assessmentAccess.service.ts'))).digest('hex'), layer: 'ACTUAL_PINNED_BASELINE_NODE_PROCESS' })}\n`);
    } finally {
      delete process.env.BETA_ROLLBACK_PROBE_OWNER;
      await setAssessmentStops(['SUBMISSIONS', 'DISCLOSURE', 'MATCHING', 'PAIR', 'NOTIFICATIONS'], false);
      if (linked) { assert.equal(await realpath(modules), await realpath(resolve('node_modules'))); await unlink(modules); }
      const actual = await realpath(directory); assert.ok(actual.startsWith(`${parent}${sep}`) && actual === resolve(directory)); await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 'ACTUAL_PINNED_BASELINE_NODE_PROCESS_AND_OWNED_MONGODB');
  await check('BETA-102', 'representative source and queue hot queries use indexes with bounded inspected documents', async () => {
    await AssessmentJob.insertMany(Array.from({ length: 250 }, (_, index) => ({ _id: `representative-${index}`, kind: 'PROJECTION', semanticKey: `representative-${index}`, ownerId: a, sourceSetRevision: 1000 + index, deletionGeneration: 0, state: 'DONE' })));
    const queue = await AssessmentJob.find({ attempts: { $lt: 5 }, $or: [{ state: 'PENDING', $expr: { $lte: ['$notBefore', '$$NOW'] } }, { state: 'RUNNING', $expr: { $lte: ['$leaseExpiresAt', '$$NOW'] } }] }).sort({ createdAt: 1, _id: 1 }).limit(10).explain('executionStats');
    const source = await AssessmentRun.find({ ownerId: a, status: 'FINALIZED' }).limit(64).explain('executionStats');
    assert.equal(JSON.stringify(queue).includes('COLLSCAN'), false); assert.equal(JSON.stringify(source).includes('COLLSCAN'), false);
  });
  await check('BETA-106', 'old pending creates an aggregate-only HTTP alert with measured delivery', async () => {
    await AssessmentJob.create({ _id: 'old-pending', kind: 'PROJECTION', semanticKey: 'old-pending', ownerId: a, sourceSetRevision: 2000, deletionGeneration: 0, createdAt: new Date(Date.now() - 300000) });
    let payload = ''; const server = createHttpServer((req, res) => { req.on('data', (part: Buffer) => { payload += part.toString(); }); req.on('end', () => { res.writeHead(204); res.end(); }); });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.ASSESSMENT_ALERT_WEBHOOK_URL = `http://127.0.0.1:${address.port}/owned-alert`;
    try { const health = await assessmentHealth(); assert.ok(health.alerts.includes('PENDING_TOO_OLD')); assert.equal(await deliverAssessmentAlert(health.alerts), 'SENT'); assert.ok(payload.includes('PENDING_TOO_OLD')); assert.equal(payload.includes(a), false); assert.equal(payload.includes('answers'), false); assert.ok(await AssessmentOpsEvent.exists({ code: 'ALERT_DELIVERED' })); }
    finally { await new Promise<void>(done => server.close(() => done())); delete process.env.ASSESSMENT_ALERT_WEBHOOK_URL; }
  });
  const deletedSource = await pendingSource(deleted);
  const backup = await captureBetaBackup();
  await check('BETA-085', 'withdraw and OFF stop new collection but preserve owner export and controls', async () => {
    const current = await assessmentAdmissionService.get(revoked); await assessmentAdmissionService.withdraw(revoked, { viewerToken: current.viewerToken, expectedRevision: current.revision });
    await denied(() => requireAssessmentOwner(revoked), 'BETA_ENROLLMENT_REQUIRED');
    process.env.ASSESSMENT_MODE = 'OFF'; assert.ok(await assessmentAdmissionService.exportOwnerData(revoked)); assert.ok(await requireAssessmentOwner(revoked, { control: true }));
    await denied(() => assessmentRunsService.get(revoked)); process.env.ASSESSMENT_MODE = 'SYNTHETIC';
  });
  await check('BETA-086', 'actual account deletion removes new sources/jobs/grants/settings and preserves independent peer report', async () => {
    const db = mongoose.connection.db!; await db.collection('assessment_practices').insertOne({ ownerId: deleted, fixture: true });
    await db.collection<{ _id: string; ownerId: string }>('assessment_portfolios').updateOne({ _id: deleted }, { $set: { ownerId: deleted } }, { upsert: true });
    await db.collection('assessment_discovery_sessions').insertOne({ ownerId: deleted, expiresAt: new Date(Date.now() + 10000) });
    await db.collection('assessment_jobs').insertOne({ kind: 'PROJECTION', semanticKey: 'delete-owned-job', ownerId: deleted, state: 'PENDING' });
    await db.collection('assessment_pair_reports').insertOne({ ownerId: deleted, pairId: 'former-pair', value: 'NEEDS_CHANGE' });
    await db.collection('assessment_pair_reports').insertOne({ ownerId: b, pairId: 'former-pair', value: 'ACCEPTABLE' });
    const version = (await SessionSubject.findOne({ subjectKey: privacySubjectHash(deleted) }).lean())!.version;
    await privacyRequestService.requestDeletion({ ownerUserId: deleted });
    const result = await accountDeletionService.execute({ ownerUserId: deleted, sessionVersion: version, auditRequest: { route: '/owned-beta-ops/privacy', method: 'TEST' } });
    assert.equal(result.status, 'EXECUTED'); assert.equal(await User.countDocuments({ id: deleted }), 0);
    for (const name of ['assessment_practices', 'assessment_portfolios', 'assessment_discovery_sessions', 'assessment_jobs', 'assessment_pair_reports', 'assessment_support']) assert.equal(await db.collection(name).countDocuments({ ownerId: deleted }), 0);
    assert.equal(await AssessmentParticipant.countDocuments({ _id: deleted }), 0);
    assert.equal(await AssessmentRun.countDocuments({ _id: deletedSource._id }), 0);
    assert.equal(await db.collection('assessment_pair_reports').countDocuments({ ownerId: b }), 1);
  });
  await mongoose.disconnect(); process.env.MONGODB_URI = restoreUri;
  await check('BETA-104', 'distinct backup restore replays independent deletion journal and resets prior positive choices before reads', async () => {
    const result = await restoreBetaBackup(backup); assert.ok(result.deleted >= 1);
    assert.equal(await AssessmentParticipant.countDocuments({ _id: deleted }), 0);
    assert.equal(await AssessmentRun.countDocuments({ ownerId: deleted }), 0);
    const restored = await AssessmentParticipant.findById(a).lean(); assert.equal(restored?.settings?.discovery, false); assert.equal(restored?.settings?.ownerAssessment, false); assert.equal(restored?.membershipStatus, 'REVOKED');
    assert.equal((await AssessmentRuntimeControl.findById(assessmentTargetId()).lean())?.recoveryReconciled, true);
    // Application-level owner controls require a current normal session; restored choices never create one.
    await User.updateOne({ id: a }, { $set: { username: 'Синтетическое восстановление' } }, { upsert: true });
    await SessionSubject.updateOne({ subjectKey: privacySubjectHash(a) }, { $set: { version: randomUUID(), accountState: 'ACTIVE' } }, { upsert: true });
    assert.equal((await assessmentAdmissionService.get(a)).settings.ownerAssessment, false); await denied(() => requireAssessmentOwner(a));
    assert.ok(await assessmentRunsService.getControls(a, 'com-s02-knowledge-beta'));
    process.stdout.write(`${JSON.stringify({ suite: 'beta-restore-measurement', ...result, note: 'local synthetic elapsed times, not target SLA' })}\n`);
  });
  await mongoose.disconnect(); process.env.MONGODB_URI = unavailableUri;
  await check('BETA-105', 'missing authoritative recovery ledger leaves persistent disclosure gate closed', async () => {
    const ledger = process.env.ASSESSMENT_RECOVERY_MONGODB_URI; delete process.env.ASSESSMENT_RECOVERY_MONGODB_URI;
    await assert.rejects(() => restoreBetaBackup(backup), /BETA_RECOVERY_LEDGER_UNAVAILABLE/);
    assert.equal((await AssessmentRuntimeControl.findById(assessmentTargetId()).lean())?.recoveryReconciled, false);
    await denied(() => assessmentAdmissionService.exportOwnerData(a), 'BETA_RECOVERY_RECONCILIATION_REQUIRED');
    process.env.ASSESSMENT_RECOVERY_MONGODB_URI = ledger;
  });
  await check('BETA-105', 'corrupt retained recovery metadata and changed identity key keep restore and export fenced', async () => {
    const ledger = await mongoose.createConnection(process.env.ASSESSMENT_RECOVERY_MONGODB_URI!, { autoIndex: false }).asPromise();
    const metadata = ledger.db!.collection<{ _id: string; identity: string; keyFingerprint: string }>('assessment_recovery_metadata');
    const saved = await metadata.findOne({ _id: 'ledger-v1' }); assert.ok(saved);
    const originalKey = process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY;
    try {
      for (const variant of ['fingerprint', 'ledger_identity', 'subject_key'] as const) {
        await metadata.updateOne({ _id: saved._id }, { $set: { identity: saved.identity, keyFingerprint: saved.keyFingerprint } });
        if (originalKey === undefined) delete process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY; else process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY = originalKey;
        if (variant === 'fingerprint') await metadata.updateOne({ _id: saved._id }, { $set: { keyFingerprint: 'corrupt-retained-fingerprint' } });
        if (variant === 'ledger_identity') await metadata.updateOne({ _id: saved._id }, { $set: { identity: randomUUID() } });
        if (variant === 'subject_key') process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY = randomBytes(32).toString('hex');
        const target = new URL(unavailableUri); target.pathname = target.pathname.replace(/_test$/, `_${variant}_test`);
        await mongoose.connection.close(); process.env.MONGODB_URI = target.toString();
        await assert.rejects(() => restoreBetaBackup(backup), variant === 'ledger_identity' ? /BETA_RECOVERY_LEDGER_IDENTITY_MISMATCH/ : /BETA_RECOVERY_IDENTITY_MISMATCH/);
        assert.equal((await AssessmentRuntimeControl.findById(assessmentTargetId()).lean())?.recoveryReconciled, false);
        await denied(() => assessmentAdmissionService.exportOwnerData(a), 'BETA_RECOVERY_RECONCILIATION_REQUIRED');
      }
    } finally {
      await metadata.updateOne({ _id: saved._id }, { $set: { identity: saved.identity, keyFingerprint: saved.keyFingerprint } });
      if (originalKey === undefined) delete process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY; else process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY = originalKey;
      await ledger.close();
    }
  });
  await recordAssessmentOps('OPS_SUITE_COMPLETED', 'OPERATOR');
  assert.ok(await AssessmentPortfolio.countDocuments() >= 0);
  await setAssessmentStops(['SUBMISSIONS'], true);
}

async function main() {
  const mongod = process.argv.find(value => value.startsWith('--mongod='))?.slice(9) ?? process.env.BETA_MONGOD_PATH;
  if (!mongod) throw new Error('BETA_OWNED_MONGOD_PATH_REQUIRED');
  const port = await freePort(); const id = randomBytes(6).toString('hex'); const replica = `vmesteBetaOps${id}`;
  const parent = await realpath(tmpdir()); const directory = await mkdtemp(join(parent, 'vmeste-beta-ops-')); const data = join(directory, 'data'); await mkdir(data);
  let mongo: ChildProcess | undefined; let client: mongoose.mongo.MongoClient | undefined;
  try {
    mongo = spawn(resolve(mongod), ['--dbpath', data, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', replica, '--logpath', join(directory, 'mongod.log'), '--quiet'], { windowsHide: true, stdio: 'ignore' });
    const uri = (name: string) => `mongodb://127.0.0.1:${port}/vmeste_ops_${id}_${name}_test?replicaSet=${replica}`;
    client = new mongoose.mongo.MongoClient(`mongodb://127.0.0.1:${port}/admin?directConnection=true`, { serverSelectionTimeoutMS: 250 });
    let ready = false;
    for (let index = 0; index < 100; index++) { try { await client.connect(); ready = true; break; } catch { await delay(100); } }
    assert.ok(ready, 'owned MongoDB became available');
    const options = z.object({ parsed: z.object({ storage: z.object({ dbPath: z.string() }), replication: z.object({ replSet: z.string().optional(), replSetName: z.string().optional() }) }) }).parse(await client.db('admin').command({ getCmdLineOpts: 1 }));
    assert.equal(resolve(options.parsed.storage.dbPath), resolve(data)); assert.equal(options.parsed.replication.replSetName ?? options.parsed.replication.replSet, replica);
    await client.db('admin').command({ replSetInitiate: { _id: replica, members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let index = 0; index < 150; index++) { if ((await client.db('admin').command({ hello: 1 })).isWritablePrimary) break; await delay(100); }
    process.env.MONGODB_URI = uri('primary'); process.env.ASSESSMENT_RECOVERY_MONGODB_URI = uri('ledger'); process.env.ASSESSMENT_MODE = 'SYNTHETIC'; process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'true'; process.env.JWT_SECRET = randomBytes(32).toString('hex');
    delete process.env.ASSESSMENT_BETA_APPROVALS_PATH; delete process.env.ASSESSMENT_ALERT_WEBHOOK_URL;
    await suite(uri('primary'), uri('restore'), uri('missing_ledger'));
    process.stdout.write(`${JSON.stringify({ suite: 'beta-ops', status: 'PASS', assertions: receipts.length, receipts })}\n`);
  } finally {
    await mongoose.disconnect();
    if (client) { try { await client.db('admin').command({ shutdown: 1 }); } catch { /* Owned process closes the command connection during shutdown. */ } await client.close(); }
    if (mongo && mongo.exitCode === null) { await Promise.race([new Promise<void>(done => mongo!.once('exit', () => done())), delay(5000)]); if (mongo.exitCode === null) mongo.kill(); }
    const actual = await realpath(directory); assert.ok(actual.startsWith(`${parent}${sep}`) && actual === resolve(directory) && actual.includes(`${sep}vmeste-beta-ops-`));
    await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
main().catch(error => { process.stderr.write(`${JSON.stringify({ suite: 'beta-ops', status: 'FAIL', completed: receipts.length, reason: error instanceof Error ? error.message.slice(0, 300) : 'FAILED' })}\n`); process.exitCode = 1; });
