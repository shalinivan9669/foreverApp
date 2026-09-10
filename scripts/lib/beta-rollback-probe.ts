// Copied unchanged into a verified baseline release; these imports then resolve only against that release's src/.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { isAssessmentEnabled, requireAssessmentOwner } from '@/domain/services/assessmentAccess.service';
import { assessmentRunsService, materializeAssessment } from '@/domain/services/assessmentRuns.service';
import { assessmentComparisonService } from '@/domain/services/assessmentComparison.service';

async function main() {
  const ownerId = process.env.BETA_ROLLBACK_PROBE_OWNER;
  assert.ok(typeof ownerId === 'string' && ownerId.startsWith('beta-ops-rollback-'));
  assert.equal(process.env.ASSESSMENT_MODE, 'OFF'); assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'false');
  assert.equal(isAssessmentEnabled(), false);
  // Establish the actual baseline's incompatibility without granting access or reading a source under that configuration.
  process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'true';
  assert.equal(isAssessmentEnabled(), true, 'The retained pilot ignores the newer OFF switch');
  process.env.ASSESSMENT_SYNTHETIC_ENABLED = 'false';
  await requireAssessmentOwner(ownerId, { control: true });
  const db = mongoose.connection.db!;
  const participants = db.collection<{ _id: string; membershipStatus: string }>('assessment_participants');
  const participantBefore = await participants.findOne({ _id: ownerId });
  assert.ok(participantBefore && participantBefore.membershipStatus === 'REVOKED');
  const before = JSON.stringify({ participant: participantBefore, runs: await db.collection('assessment_runs').find({ ownerId }).sort({ _id: 1 }).toArray(), jobs: await db.collection('assessment_jobs').find({ ownerId }).sort({ _id: 1 }).toArray() });
  const controls = await assessmentRunsService.getControls(ownerId);
  assert.deepEqual(controls.answers, []); assert.equal(controls.profile, null);
  const denied = async (work: () => Promise<object | void>) => assert.rejects(work, error => error instanceof DomainError && error.status === 404 && error.code === 'NOT_FOUND');
  await denied(() => assessmentRunsService.get(ownerId));
  await denied(() => materializeAssessment(ownerId));
  await denied(() => assessmentComparisonService.get(ownerId));
  await denied(() => assessmentRunsService.mutate(ownerId, { action: 'start', viewerToken: controls.viewerToken, idempotencyKey: randomUUID() }));
  await denied(() => assessmentRunsService.mutate(ownerId, { action: 'permission', pairUse: true, expectedRevision: controls.revision, viewerToken: controls.viewerToken, idempotencyKey: randomUUID() }));
  await denied(() => assessmentRunsService.mutate(ownerId, { action: 'matching-permission', matchingUse: true, expectedRevision: controls.revision, viewerToken: controls.viewerToken, idempotencyKey: randomUUID() }));
  const after = JSON.stringify({ participant: await participants.findOne({ _id: ownerId }), runs: await db.collection('assessment_runs').find({ ownerId }).sort({ _id: 1 }).toArray(), jobs: await db.collection('assessment_jobs').find({ ownerId }).sort({ _id: 1 }).toArray() });
  assert.equal(after, before, 'Prior release must not change revoked membership, source permissions or durable queue');
  process.stdout.write(`${JSON.stringify({ suite: 'beta-rollback-baseline', status: 'PASS', checks: 12 })}\n`);
}
void main().catch(() => { process.stderr.write('BETA_BASELINE_ROLLBACK_ASSERTION_FAILED\n'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
