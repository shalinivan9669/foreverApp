import mongoose from 'mongoose';
import { z } from 'zod';
import { assessmentTargetId, assessmentTransaction } from '@/domain/services/assessmentAccess.service';
import { reconcileAssessmentRecovery, withAssessmentRecoveryLedger } from '@/domain/services/assessmentRecovery.service';
import { AssessmentRuntimeControl } from '@/models/AssessmentOperations';
import { connectToDatabase } from '@/lib/mongodb';

export const BETA_BACKUP_COLLECTIONS = ['assessment_participants', 'assessment_runs', 'assessment_direct', 'assessment_portfolios', 'assessment_practices', 'assessment_pair_reports', 'assessment_pair_work', 'assessment_pair_occurrences', 'assessment_support', 'assessment_jobs', 'assessment_operations'] as const;
export const BetaBackupSchema = z.object({ version: z.literal('beta-recovery-bundle-v1'), sourceTargetId: z.string().length(64), ledgerIdentity: z.string().uuid(), createdAt: z.string().datetime(),
  collections: z.array(z.object({ name: z.enum(BETA_BACKUP_COLLECTIONS), documents: z.array(z.string().max(2000000)).max(10000) }).strict()).max(BETA_BACKUP_COLLECTIONS.length),
}).strict();
export type BetaBackup = z.infer<typeof BetaBackupSchema>;
export async function captureBetaBackup(): Promise<BetaBackup> {
  await connectToDatabase(); const db = mongoose.connection.db; if (!db) throw new Error('DATABASE_NOT_CONNECTED');
  // Verify journal availability before creating a recoverable backup horizon.
  const ledgerIdentity = await withAssessmentRecoveryLedger(async (_collection, identity) => identity);
  return assessmentTransaction(async session => {
    const collections: BetaBackup['collections'] = [];
    for (const name of BETA_BACKUP_COLLECTIONS) {
      const rows = await db.collection(name).find({}, { session }).limit(10001).toArray();
      if (rows.length > 10000) throw new Error('BETA_BACKUP_SCOPE_LIMIT');
      collections.push({ name, documents: rows.map(row => mongoose.mongo.BSON.EJSON.stringify(row, { relaxed: false })) });
    }
    return { version: 'beta-recovery-bundle-v1', sourceTargetId: assessmentTargetId(), ledgerIdentity, createdAt: new Date().toISOString(), collections };
  });
}
export async function restoreBetaBackup(input: BetaBackup): Promise<{ participants: number; deleted: number; restoreMs: number; backupAgeMs: number }> {
  const started = Date.now(); const backup = BetaBackupSchema.parse(input);
  if (Date.parse(backup.createdAt) > started || started - Date.parse(backup.createdAt) > 7 * 86400000) throw new Error('BETA_BACKUP_OUTSIDE_RECOVERY_HORIZON');
  if (backup.sourceTargetId === assessmentTargetId()) throw new Error('BETA_RESTORE_DISTINCT_TARGET_REQUIRED');
  if (new Set(backup.collections.map(item => item.name)).size !== backup.collections.length) throw new Error('BETA_BACKUP_DUPLICATE_COLLECTION');
  await connectToDatabase(); const db = mongoose.connection.db; if (!db) throw new Error('DATABASE_NOT_CONNECTED');
  // Persist fail-closed control before the first restore write; missing/failed journal leaves it closed.
  await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { recoveryReconciled: false, stoppedEffects: ['SUBMISSIONS', 'DISCLOSURE', 'MATCHING', 'PAIR', 'NOTIFICATIONS'] }, $inc: { revision: 1 } }, { upsert: true });
  for (const name of BETA_BACKUP_COLLECTIONS) if (await db.collection(name).countDocuments({})) throw new Error('BETA_RESTORE_EMPTY_TARGET_REQUIRED');
  for (const item of backup.collections) {
    const documents = item.documents.map(text => mongoose.mongo.BSON.EJSON.parse(text, { relaxed: false }) as mongoose.mongo.Document);
    if (documents.length) await db.collection(item.name).insertMany(documents);
  }
  const reconciled = await reconcileAssessmentRecovery(backup.sourceTargetId, backup.ledgerIdentity);
  await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { recoveryReconciled: true }, $inc: { revision: 1 } });
  // Stop switches intentionally remain closed; operator verifies application reads before explicit resume.
  return { ...reconciled, restoreMs: Date.now() - started, backupAgeMs: Math.max(0, started - Date.parse(backup.createdAt)) };
}
