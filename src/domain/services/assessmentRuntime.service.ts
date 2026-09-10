import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { AssessmentRuntimeControl } from '@/models/AssessmentOperations';
import { ASSESSMENT_MIGRATION_VERSION, assessmentMode, assessmentTargetId, isAssessmentEnabled } from './assessmentAccess.service';
import { migrateAssessmentAdditive, purgeAssessmentExpired } from './assessmentOperations.service';
import { recordAssessmentOps, runAssessmentWorkerBatch } from './assessmentJobs.service';
import { processAssessmentReminders } from './assessmentReminders.service';

let initializedTarget = '';
let initialization: Promise<void> | null = null;

/** A normal installation creates its additive indexes without an invitation/bootstrap command. */
export async function ensureRegisteredAssessmentRuntime(): Promise<void> {
  if (assessmentMode() !== 'REGISTERED') return;
  await connectToDatabase();
  const target = assessmentTargetId();
  if (initializedTarget === target) return;
  if (!initialization) initialization = (async () => {
    const existing = await AssessmentRuntimeControl.findById(target).lean();
    if (!existing) {
      // Existing assessment data without its control record may be an incomplete restore.
      const hasParticipants = Boolean(await AssessmentParticipant.exists({}));
      await AssessmentRuntimeControl.updateOne({ _id: target }, { $setOnInsert: {
        recoveryReconciled: !hasParticipants, stoppedEffects: [], disabledPublicationIds: [], revision: 0,
      } }, { upsert: true });
    }
    const control = await AssessmentRuntimeControl.findById(target).lean();
    if (control?.migrationVersion !== ASSESSMENT_MIGRATION_VERSION) await migrateAssessmentAdditive(true);
    await mongoose.connection.db!.collection('assessment_registered_revocations').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    initializedTarget = target;
  })().finally(() => { initialization = null; });
  await initialization;
}

type MaintenanceLease = { _id: string; owner: string; nextAt: Date };

/** Bounded request-driven work also runs on serverless hosts, without an always-on process. */
export async function maintainRegisteredAssessments(): Promise<void> {
  if (assessmentMode() !== 'REGISTERED' || !isAssessmentEnabled()) return;
  await ensureRegisteredAssessmentRuntime();
  const db = mongoose.connection.db;
  if (!db) return;
  const leases = db.collection<MaintenanceLease>('assessment_maintenance_leases');
  const owner = randomUUID();
  const now = new Date();
  try {
    await leases.updateOne({ _id: 'registered-runtime' }, { $setOnInsert: { owner: '', nextAt: new Date(0) } }, { upsert: true });
    const claim = await leases.updateOne({ _id: 'registered-runtime', $expr: { $lte: ['$nextAt', '$$NOW'] } }, [
      { $set: { owner, nextAt: { $add: ['$$NOW', 60_000] } } },
    ]);
    if (claim.modifiedCount !== 1) return;
    const control = await AssessmentRuntimeControl.findById(assessmentTargetId()).lean();
    if (!control?.recoveryReconciled) return;
    await runAssessmentWorkerBatch(owner, 2);
    await processAssessmentReminders(now, 10);
    await purgeAssessmentExpired(now, 10);
    await recordAssessmentOps('WORKER_HEARTBEAT', 'WORKER');
  } catch {
    // Source commits and returned DTOs remain authoritative if a later maintenance task fails.
    await recordAssessmentOps('REGISTERED_MAINTENANCE_FAILED', 'WORKER').catch(() => undefined);
  }
}
