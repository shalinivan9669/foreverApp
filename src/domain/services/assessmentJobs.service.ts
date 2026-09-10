import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { AssessmentJob, AssessmentOpsEvent, type AssessmentJobType, type AssessmentOpsEventType } from '@/models/AssessmentOperations';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { connectToDatabase } from '@/lib/mongodb';
import { assessmentFail, isAssessmentEnabled, requireAssessmentOwner } from './assessmentAccess.service';

export const ASSESSMENT_JOB_POLICY = { maxAttempts: 5, leaseMs: 60000, batchSize: 10, queueLimit: 1000, retryMs: [1000, 5000, 30000, 120000, 600000] } as const;
type ProjectionInput = { ownerId: string; sourceSetRevision: number; deletionGeneration: number; semanticKey?: string };
export async function enqueueAssessmentProjection(input: ProjectionInput, session: ClientSession): Promise<void> {
  const semanticKey = input.semanticKey ?? createHash('sha256').update(JSON.stringify(['projection-v1', input.ownerId, input.sourceSetRevision, input.deletionGeneration])).digest('hex');
  if (await AssessmentJob.countDocuments({ state: { $in: ['PENDING', 'RUNNING'] } }).session(session) >= ASSESSMENT_JOB_POLICY.queueLimit) assessmentFail('PROJECTION_BACKPRESSURE', 'Расчёт временно занят. Ответы в форме сохранены; повторите сохранение позже.', 429);
  await AssessmentJob.updateOne({ _id: semanticKey }, { $setOnInsert: { ...input, _id: semanticKey, kind: 'PROJECTION', semanticKey, state: 'PENDING', notBefore: new Date(0) } }, { upsert: true, session });
}
export async function claimAssessmentJob(workerId: string): Promise<AssessmentJobType | null> {
  await connectToDatabase();
  await AssessmentJob.updateMany({ state: 'RUNNING', $expr: { $lte: ['$leaseExpiresAt', '$$NOW'] }, attempts: { $gte: ASSESSMENT_JOB_POLICY.maxAttempts } }, { $set: { state: 'DEAD_LETTER', lastErrorCode: 'LEASE_ATTEMPTS_EXHAUSTED', leaseOwner: null, leaseExpiresAt: null } });
  return AssessmentJob.findOneAndUpdate({ attempts: { $lt: ASSESSMENT_JOB_POLICY.maxAttempts }, $or: [
    { state: 'PENDING', $expr: { $lte: ['$notBefore', '$$NOW'] } }, { state: 'RUNNING', $expr: { $lte: ['$leaseExpiresAt', '$$NOW'] } },
  ] }, [{ $set: { state: 'RUNNING', leaseOwner: workerId, leaseExpiresAt: { $add: ['$$NOW', ASSESSMENT_JOB_POLICY.leaseMs] }, updatedAt: '$$NOW', attempts: { $add: ['$attempts', 1] }, fence: { $add: ['$fence', 1] } } }], { sort: { createdAt: 1, _id: 1 }, new: true, timestamps: false }).lean<AssessmentJobType | null>();
}
export async function fenceAssessmentJob(job: AssessmentJobType, session: ClientSession): Promise<void> {
  const result = await AssessmentJob.updateOne({ _id: job._id, state: 'RUNNING', leaseOwner: job.leaseOwner, fence: job.fence, $expr: { $gt: ['$leaseExpiresAt', '$$NOW'] } }, { $inc: { writeFence: 1 } }, { session });
  if (result.matchedCount !== 1) assessmentFail('JOB_LEASE_LOST', 'Расчёт передан другому исполнителю.');
}
export async function recordAssessmentOps(code: string, category: AssessmentOpsEventType['category'], durationMs = 0): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) throw new Error('BETA_UNSAFE_METRIC_CODE');
  await AssessmentOpsEvent.create({ _id: randomUUID(), code, category, durationMs: Math.max(0, Math.min(durationMs, 86400000)), expiresAt: new Date(Date.now() + 7 * 86400000) });
}
export type AssessmentWorkerHooks = { afterClaim?: (job: AssessmentJobType) => Promise<void>; afterComputed?: () => Promise<void>; beforeAcknowledge?: () => Promise<void> };
export async function executeAssessmentJob(job: AssessmentJobType, hooks: AssessmentWorkerHooks = {}): Promise<'DONE' | 'CANCELLED' | 'RETRY' | 'LEASE_LOST' | 'DEAD_LETTER'> {
  const started = Date.now();
  try {
    await hooks.afterClaim?.(job);
    const participant = await requireAssessmentOwner(job.ownerId);
    if (participant.deletionGeneration !== job.deletionGeneration) assessmentFail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
    const { materializeAssessment } = await import('./assessmentRuns.service');
    await materializeAssessment(job.ownerId, { afterComputed: hooks.afterComputed, beforePersist: session => fenceAssessmentJob(job, session) });
    await hooks.beforeAcknowledge?.();
    const result = await AssessmentJob.updateOne({ _id: job._id, state: 'RUNNING', leaseOwner: job.leaseOwner, fence: job.fence, $expr: { $gt: ['$leaseExpiresAt', '$$NOW'] } }, { $set: { state: 'DONE', lastErrorCode: null, leaseOwner: null, leaseExpiresAt: null, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    if (result.matchedCount !== 1) return 'LEASE_LOST';
    await recordAssessmentOps('PROJECTION_DONE', 'WORKER', Date.now() - started); return 'DONE';
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'PROJECTION_RETRYABLE_ERROR';
    if (code === 'JOB_LEASE_LOST') return 'LEASE_LOST';
    const cancel = ['NOT_FOUND', 'SOURCE_UNAVAILABLE', 'BETA_ENROLLMENT_REQUIRED'].includes(code) || !await AssessmentParticipant.exists({ _id: job.ownerId, deletionGeneration: job.deletionGeneration });
    const state = cancel ? 'CANCELLED' : job.attempts >= ASSESSMENT_JOB_POLICY.maxAttempts ? 'DEAD_LETTER' : 'PENDING';
    const result = await AssessmentJob.updateOne({ _id: job._id, state: 'RUNNING', leaseOwner: job.leaseOwner, fence: job.fence }, [{ $set: {
      state, leaseOwner: null, leaseExpiresAt: null, lastErrorCode: code,
      notBefore: { $add: ['$$NOW', ASSESSMENT_JOB_POLICY.retryMs[Math.min(job.attempts - 1, 4)]] }, updatedAt: '$$NOW',
      ...(['CANCELLED'].includes(state) ? { expiresAt: new Date(Date.now() + 7 * 86400000) } : {}),
    } }], { timestamps: false });
    if (result.matchedCount !== 1) return 'LEASE_LOST';
    await recordAssessmentOps(state === 'PENDING' ? 'PROJECTION_RETRY' : `PROJECTION_${state}`, 'WORKER', Date.now() - started);
    return state === 'PENDING' ? 'RETRY' : state;
  }
}
export async function runAssessmentWorkerBatch(workerId = randomUUID(), limit: number = ASSESSMENT_JOB_POLICY.batchSize): Promise<{ claimed: number; completed: number }> {
  await connectToDatabase(); let claimed = 0; let completed = 0;
  // OFF stops new effects but leaves operator cleanup available; pending work resumes when enabled.
  if (!isAssessmentEnabled()) return { claimed, completed };
  for (let index = 0; index < Math.min(limit, ASSESSMENT_JOB_POLICY.batchSize); index++) {
    const job = await claimAssessmentJob(workerId); if (!job) break; claimed++;
    if (await executeAssessmentJob(job) === 'DONE') completed++;
  }
  return { claimed, completed };
}
export async function retryAssessmentDeadLetter(jobId: string): Promise<boolean> {
  const result = await AssessmentJob.updateOne({ _id: jobId, state: 'DEAD_LETTER' }, { $set: { state: 'PENDING', attempts: 0, notBefore: new Date(), lastErrorCode: null }, $inc: { fence: 1 } });
  return result.modifiedCount === 1;
}
