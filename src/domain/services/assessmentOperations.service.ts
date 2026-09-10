import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentJob, AssessmentOpsEvent, AssessmentRuntimeControl, AssessmentSupport, type AssessmentEffect } from '@/models/AssessmentOperations';
import { AssessmentOperation, AssessmentRun } from '@/models/AssessmentRun';
import { AssessmentPortfolio } from '@/models/AssessmentPortfolio';
import { AssessmentPractice } from '@/models/AssessmentPractice';
import { AssessmentDiscoverySession } from '@/models/AssessmentDiscoverySession';
import { AssessmentPairOccurrence, AssessmentPairReport, AssessmentPairWork } from '@/models/AssessmentPairWork';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { AssessmentComparison } from '@/models/AssessmentComparison';
import { User } from '@/models/User';
import { ASSESSMENT_MIGRATION_VERSION, assessmentMode, assessmentTargetId, assessmentTransaction, isAssessmentEnabled, readAssessmentBetaApproval } from './assessmentAccess.service';
import { recordAssessmentOps } from './assessmentJobs.service';
import { recordAssessmentRevocation, withAssessmentRecoveryLedger } from './assessmentRecovery.service';

export const ASSESSMENT_ALERT_POLICY = { version: 'beta-alerts-v1', pendingAgeMs: 120000, queueDepth: 100, failureCount: 5, workerAgeMs: 30000 } as const;
export async function assessmentHealth(now = new Date()) {
  await connectToDatabase();
  const pending = await AssessmentJob.countDocuments({ state: { $in: ['PENDING', 'RUNNING'] } });
  const oldest = await AssessmentJob.findOne({ state: { $in: ['PENDING', 'RUNNING'] } }).sort({ createdAt: 1 }).select({ createdAt: 1 }).lean();
  const deadLetters = await AssessmentJob.countDocuments({ state: 'DEAD_LETTER' });
  const worker = await AssessmentOpsEvent.findOne({ code: 'WORKER_HEARTBEAT' }).sort({ createdAt: -1 }).select({ createdAt: 1 }).lean();
  const control = await AssessmentRuntimeControl.findById(assessmentTargetId()).lean();
  const pendingAgeMs = oldest ? Math.max(0, now.getTime() - oldest.createdAt.getTime()) : 0;
  const workerAgeMs = worker ? Math.max(0, now.getTime() - worker.createdAt.getTime()) : null;
  const failures = await AssessmentOpsEvent.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 300000) }, code: { $in: ['PROJECTION_RETRY', 'PROJECTION_DEAD_LETTER', 'EXPORT_FAILED', 'DELETE_FAILED', 'ALERT_DELIVERY_FAILED'] } });
  const alerts: string[] = [];
  if (pendingAgeMs > ASSESSMENT_ALERT_POLICY.pendingAgeMs) alerts.push('PENDING_TOO_OLD');
  if (pending >= ASSESSMENT_ALERT_POLICY.queueDepth) alerts.push('QUEUE_DEPTH_HIGH');
  if (deadLetters) alerts.push('DEAD_LETTER_PRESENT');
  if (failures >= ASSESSMENT_ALERT_POLICY.failureCount) alerts.push('ERROR_RATE_HIGH');
  if (isAssessmentEnabled() && (workerAgeMs === null || workerAgeMs > ASSESSMENT_ALERT_POLICY.workerAgeMs)) alerts.push('WORKER_HEARTBEAT_MISSING');
  const operatorReady = Boolean(readAssessmentBetaApproval() && control?.recoveryReconciled && control.migrationVersion === ASSESSMENT_MIGRATION_VERSION && !alerts.length);
  return { version: ASSESSMENT_ALERT_POLICY.version, mode: assessmentMode(), database: 'UP' as const, targetId: assessmentTargetId(),
    pending, pendingAgeMs, deadLetters, workerAgeMs, recentFailures: failures, alerts, operatorReady,
    migrationVersion: control?.migrationVersion ?? null, recoveryReconciled: control?.recoveryReconciled ?? false,
    stoppedEffects: control?.stoppedEffects ?? [], alertChannelConfigured: Boolean(process.env.ASSESSMENT_ALERT_WEBHOOK_URL) };
}

/** Only allowlisted aggregate metrics leave the process; no subjects, answers, notes or topic IDs. */
export async function deliverAssessmentAlert(codes: string[], fetcher: typeof fetch = fetch): Promise<'SENT' | 'NOT_CONFIGURED' | 'FAILED' | 'QUIET'> {
  if (!codes.length) return 'QUIET';
  const destination = process.env.ASSESSMENT_ALERT_WEBHOOK_URL;
  if (!destination) return 'NOT_CONFIGURED';
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' && !(assessmentMode() === 'SYNTHETIC' && url.hostname === '127.0.0.1' && url.protocol === 'http:')) throw new Error('INVALID_ALERT_CHANNEL');
    if (codes.some(code => !/^[A-Z_]{3,80}$/.test(code))) throw new Error('INVALID_ALERT_CODE');
    const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: ASSESSMENT_ALERT_POLICY.version, codes: [...new Set(codes)].sort(), occurredAt: new Date().toISOString() }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw new Error('ALERT_HTTP_FAILED');
    await recordAssessmentOps('ALERT_DELIVERED', 'ALERT'); return 'SENT';
  } catch { await recordAssessmentOps('ALERT_DELIVERY_FAILED', 'ALERT'); return 'FAILED'; }
}

export async function setAssessmentStops(effects: AssessmentEffect[], stopped: boolean): Promise<void> {
  await connectToDatabase();
  await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, {
    ...(stopped ? { $addToSet: { stoppedEffects: { $each: effects } } } : { $pull: { stoppedEffects: { $in: effects } } }),
    $set: { updatedAt: new Date() }, $inc: { revision: 1 },
  }, { upsert: true });
  await recordAssessmentOps(stopped ? 'EFFECTS_STOPPED' : 'EFFECTS_RESUMED', 'OPERATOR');
}
export async function setAssessmentPublicationStop(publicationId: string, stopped: boolean): Promise<void> {
  await connectToDatabase();
  await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, {
    ...(stopped ? { $addToSet: { disabledPublicationIds: publicationId } } : { $pull: { disabledPublicationIds: publicationId } }), $inc: { revision: 1 }, $set: { updatedAt: new Date() },
  }, { upsert: true });
  await recordAssessmentOps(stopped ? 'PUBLICATION_STOPPED' : 'PUBLICATION_RESUMED', 'OPERATOR');
}

export async function inviteAssessmentParticipant(ownerId: string, cohortId: string, now = new Date()): Promise<void> {
  const approval = readAssessmentBetaApproval();
  if (assessmentMode() === 'PRIVATE_BETA' && (!approval || approval.cohortId !== cohortId)) throw new Error('BETA_APPROVAL_REQUIRED');
  await connectToDatabase();
  await assessmentTransaction(async session => {
    // A shared cohort fence serializes invite count + upsert and prevents cap races.
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $inc: { revision: 1 }, $set: { updatedAt: now } }, { upsert: true, session });
    const existing = await AssessmentParticipant.findById(ownerId).session(session).lean();
    if (existing?.environment === 'ISOLATED_SYNTHETIC' && assessmentMode() === 'PRIVATE_BETA') throw new Error('SYNTHETIC_SUBJECT_FORBIDDEN');
    if (!existing || existing.membershipStatus === 'REVOKED') {
      const count = await AssessmentParticipant.countDocuments({ cohortId, membershipStatus: { $in: ['INVITED', 'ACTIVE'] } }).session(session);
      if (count >= (approval?.maxAdmitted ?? 100)) throw new Error('BETA_COHORT_FULL');
      await AssessmentParticipant.updateOne({ _id: ownerId }, { $set: { environment: assessmentMode() === 'PRIVATE_BETA' ? 'PRIVATE_BETA' : 'ISOLATED_SYNTHETIC', cohortId,
        membershipStatus: 'INVITED', invitedAt: now, inviteExpiresAt: new Date(now.getTime() + 7 * 86400000), targetId: assessmentTargetId(), registration: null,
        settings: { ownerAssessment: false, discovery: false, pairSharing: false, publicationIds: [] } }, $setOnInsert: { deletionGeneration: 0 } }, { upsert: true, session });
    }
  });
  await recordAssessmentOps('PARTICIPANT_INVITED', 'OPERATOR');
}

export async function revokeAssessmentParticipant(ownerId: string): Promise<void> {
  await connectToDatabase(); await recordAssessmentRevocation(ownerId);
  await assessmentTransaction(async session => {
    await User.updateOne({ id: ownerId }, { $inc: { pairMembershipRevision: 1 } }, { session });
    await AssessmentParticipant.updateOne({ _id: ownerId }, { $set: { membershipStatus: 'REVOKED', revokedAt: new Date(), settings: { ownerAssessment: false, discovery: false, pairSharing: false, publicationIds: [] } }, $inc: { permissionEpoch: 1, settingsRevision: 1 } }, { session });
    await AssessmentJob.updateMany({ ownerId, state: { $in: ['PENDING', 'RUNNING'] } }, { $set: { state: 'CANCELLED', leaseOwner: null, leaseExpiresAt: null }, $inc: { fence: 1 } }, { session });
    await AssessmentRun.updateMany({ ownerId }, { $set: { pairUse: false, matchingUse: false }, $inc: { permissionRevision: 1 } }, { session });
  });
  await recordAssessmentOps('PARTICIPANT_REVOKED', 'OPERATOR');
}

const indexModels = [AssessmentParticipant, AssessmentJob, AssessmentRuntimeControl, AssessmentSupport, AssessmentOpsEvent, AssessmentRun, AssessmentOperation, AssessmentPortfolio, AssessmentPractice, AssessmentDiscoverySession, AssessmentPairOccurrence, AssessmentPairReport, AssessmentPairWork, AssessmentDirect, AssessmentComparison] as const;
export async function migrateAssessmentAdditive(apply: boolean, afterStep?: (step: string) => Promise<void>) {
  await connectToDatabase(); const db = mongoose.connection.db; if (!db) throw new Error('DATABASE_NOT_CONNECTED');
  const result: { collection: string; indexes: number; applied: boolean }[] = [];
  for (const model of indexModels) {
    const indexes = model.schema.indexes();
    result.push({ collection: model.collection.name, indexes: indexes.length, applied: apply });
    if (!apply) continue;
    await model.createIndexes();
    await db.collection('assessment_migration_steps').updateOne({ targetId: assessmentTargetId(), version: ASSESSMENT_MIGRATION_VERSION, collection: model.collection.name }, { $set: { completedAt: new Date() } }, { upsert: true });
    await afterStep?.(model.collection.name);
  }
  if (apply) {
    if (process.env.ASSESSMENT_RECOVERY_MONGODB_URI) await withAssessmentRecoveryLedger(collection => collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'assessment_recovery_horizon' }));
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { migrationVersion: ASSESSMENT_MIGRATION_VERSION, updatedAt: new Date() }, $inc: { revision: 1 } }, { upsert: true });
  }
  return { version: ASSESSMENT_MIGRATION_VERSION, targetId: assessmentTargetId(), apply, steps: result };
}

/** Bounded cleanup is independent of experimental mode and never refreshes observation time. */
export async function purgeAssessmentExpired(now = new Date(), limit = 100): Promise<{ sources: number; support: number }> {
  await connectToDatabase(); const db = mongoose.connection.db; if (!db) throw new Error('DATABASE_NOT_CONNECTED');
  const rows = await AssessmentRun.find({ status: { $ne: 'DELETED' }, $or: [
    { status: 'DRAFT', updatedAt: { $lte: new Date(now.getTime() - 30 * 86400000) } },
    { status: 'FINALIZED', finalizedAt: { $lte: new Date(now.getTime() - 180 * 86400000).toISOString() } },
  ] }).limit(Math.min(limit, 100)).lean();
  for (const row of rows) {
    await recordAssessmentRevocation(row.ownerId);
    await assessmentTransaction(async session => {
      await AssessmentRun.updateOne({ _id: row._id, revision: row.revision }, { $set: { status: 'DELETED', answers: [], presentations: [], snapshot: null, previousSource: null, pairUse: false, matchingUse: false, materializedRevision: -1 }, $inc: { permissionRevision: 1, revision: 1 } }, { session });
      await db.collection('assessment_portfolios').deleteMany({ ownerId: row.ownerId }, { session });
      await db.collection('assessment_comparisons').deleteMany({ actorIds: row.ownerId }, { session });
    });
  }
  const support = await AssessmentSupport.deleteMany({ expiresAt: { $lte: now } });
  await db.collection('assessment_practices').deleteMany({ updatedAt: { $lte: new Date(now.getTime() - 90 * 86400000) } });
  await db.collection('assessment_operations').deleteMany({ createdAt: { $lte: new Date(now.getTime() - 7 * 86400000) } });
  return { sources: rows.length, support: support.deletedCount };
}
