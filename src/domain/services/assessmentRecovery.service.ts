import mongoose, { type ClientSession } from 'mongoose';
import { createHmac, randomUUID } from 'node:crypto';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { assessmentMode, assessmentTargetId, isAssessmentEnvironment } from './assessmentAccess.service';

export type AssessmentRecoveryEntry = { _id: string; sourceTargetId: string; deleted: boolean; permissionEpoch: number; deletionGeneration: number; recordedAt: Date; expiresAt: Date };
const recoverySubjectKey = (ownerId: string) => {
  const key = process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY ?? (isAssessmentEnvironment() ? process.env.JWT_SECRET : undefined);
  if (!key || key.length < 32) throw new Error('BETA_RECOVERY_IDENTITY_KEY_REQUIRED');
  return createHmac('sha256', key).update(`assessment-recovery-subject-v1:${ownerId}`).digest('hex');
};
/** Separate recovery database survives loss of primary; synthetic harness uses a separate local database too. */
export async function withAssessmentRecoveryLedger<T>(work: (collection: mongoose.mongo.Collection<AssessmentRecoveryEntry>, ledgerIdentity: string) => Promise<T>): Promise<T> {
  const uri = process.env.ASSESSMENT_RECOVERY_MONGODB_URI;
  if (!uri || assessmentTargetId(uri) === assessmentTargetId()) throw new Error('BETA_RECOVERY_LEDGER_UNAVAILABLE');
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false }).asPromise();
  try {
    if (!connection.db) throw new Error('BETA_RECOVERY_LEDGER_UNAVAILABLE');
    const metadata = connection.db.collection<{ _id: string; identity: string; keyFingerprint: string }>('assessment_recovery_metadata');
    const fingerprint = recoverySubjectKey('recovery-key-fingerprint');
    await metadata.updateOne({ _id: 'ledger-v1' }, { $setOnInsert: { identity: randomUUID(), keyFingerprint: fingerprint } }, { upsert: true });
    const current = await metadata.findOne({ _id: 'ledger-v1' });
    if (!current || current.keyFingerprint !== fingerprint) throw new Error('BETA_RECOVERY_IDENTITY_MISMATCH');
    const collection = connection.db.collection<AssessmentRecoveryEntry>('assessment_recovery_ledger');
    return await work(collection, current.identity);
  } finally { await connection.close(); }
}
export async function recordAssessmentRevocation(ownerId: string, input: { deleted?: boolean; permissionEpoch?: number; deletionGeneration?: number } = {}): Promise<void> {
  if (!process.env.ASSESSMENT_RECOVERY_MONGODB_URI && assessmentMode() !== 'PRIVATE_BETA' && assessmentMode() !== 'REGISTERED' && isAssessmentEnvironment()) return;
  const participant = await AssessmentParticipant.findById(ownerId).lean();
  if (!participant) return;
  if ((participant.environment === 'REGISTERED' || (assessmentMode() === 'REGISTERED' && participant.environment === 'PRIVATE_BETA')) && !process.env.ASSESSMENT_RECOVERY_MONGODB_URI) {
    const db = mongoose.connection.db;
    if (!db) throw new Error('DATABASE_NOT_CONNECTED');
    // Ordinary account controls must work with the application's existing MongoDB configuration.
    // This durable journal is not an independent disaster-recovery copy; restore tooling still
    // requires its separate ledger and never treats this journal as approval to reopen a backup.
    await db.collection<AssessmentRecoveryEntry>('assessment_registered_revocations').updateOne({
      _id: privacySubjectHash(`assessment-registered-revocation:${ownerId}`),
    }, {
      $set: { sourceTargetId: assessmentTargetId(), recordedAt: new Date(), expiresAt: new Date(Date.now() + 37 * 86400000), ...(input.deleted ? { deleted: true } : {}) },
      $setOnInsert: { ...(input.deleted ? {} : { deleted: false }) },
      $max: { permissionEpoch: input.permissionEpoch ?? (participant.permissionEpoch ?? 0) + 1, deletionGeneration: input.deletionGeneration ?? participant.deletionGeneration + (input.deleted ? 1 : 0) },
    }, { upsert: true });
    return;
  }
  await withAssessmentRecoveryLedger(async collection => {
    await collection.updateOne({ _id: recoverySubjectKey(ownerId) }, {
      $set: { sourceTargetId: assessmentTargetId(), recordedAt: new Date(), expiresAt: new Date(Date.now() + 37 * 86400000), ...(input.deleted ? { deleted: true } : {}) },
      $setOnInsert: { ...(input.deleted ? {} : { deleted: false }) },
      $max: { permissionEpoch: input.permissionEpoch ?? (participant.permissionEpoch ?? 0) + 1, deletionGeneration: input.deletionGeneration ?? participant.deletionGeneration + (input.deleted ? 1 : 0) },
    }, { upsert: true });
  });
}

/** Applied by existing account deletion transaction; independent peer-authored reports are retained. */
export async function purgeAssessmentOwnedData(ownerId: string, session?: ClientSession): Promise<void> {
  const db = mongoose.connection.db; if (!db) throw new Error('DATABASE_NOT_CONNECTED');
  for (const name of ['assessment_portfolios', 'assessment_practices', 'assessment_jobs', 'assessment_support']) await db.collection(name).deleteMany({ ownerId }, { session });
  await db.collection('assessment_discovery_sessions').deleteMany({ $or: [{ ownerId }, { viewerId: ownerId }, { actorId: ownerId }, { requesterId: ownerId }] }, { session });
  await db.collection('assessment_pair_occurrences').deleteMany({ actorIds: ownerId }, { session });
}

/** Recovery always clears old positive choices; current user choice is required before reuse. */
export async function reconcileAssessmentRecovery(sourceTargetId: string, expectedLedgerIdentity?: string): Promise<{ participants: number; deleted: number }> {
  const db = mongoose.connection.db; if (!db) throw new Error('DATABASE_NOT_CONNECTED');
  const entries = await withAssessmentRecoveryLedger((collection, identity) => {
    if (expectedLedgerIdentity && identity !== expectedLedgerIdentity) throw new Error('BETA_RECOVERY_LEDGER_IDENTITY_MISMATCH');
    return collection.find({ sourceTargetId }).toArray();
  });
  const bySubject = new Map(entries.map(row => [row._id, row]));
  const participants = await AssessmentParticipant.find({}).lean(); let deleted = 0;
  for (const participant of participants) {
    const entry = bySubject.get(recoverySubjectKey(participant._id));
    if (entry?.deleted) {
      for (const name of ['assessment_runs', 'assessment_direct', 'assessment_operations', 'assessment_pair_reports']) await db.collection(name).deleteMany({ ownerId: participant._id });
      await purgeAssessmentOwnedData(participant._id);
      await db.collection('assessment_comparisons').deleteMany({ actorIds: participant._id });
      await db.collection('assessment_pair_work').deleteMany({ actorIds: participant._id });
      await AssessmentParticipant.deleteOne({ _id: participant._id }); deleted++;
    } else {
      await AssessmentParticipant.updateOne({ _id: participant._id }, { $set: {
        membershipStatus: 'REVOKED', settings: { ownerAssessment: false, discovery: false, pairSharing: false, publicationIds: [] }, registration: null,
        permissionEpoch: Math.max(entry?.permissionEpoch ?? 0, participant.permissionEpoch ?? 0) + 1,
        deletionGeneration: Math.max(entry?.deletionGeneration ?? 0, participant.deletionGeneration),
      }, $inc: { settingsRevision: 1 } });
      await db.collection('assessment_runs').updateMany({ ownerId: participant._id }, { $set: { pairUse: false, matchingUse: false, snapshot: null, materializedRevision: -1 }, $inc: { permissionRevision: 1 } });
      await db.collection('assessment_jobs').updateMany({ ownerId: participant._id, state: { $in: ['PENDING', 'RUNNING'] } }, { $set: { state: 'CANCELLED', leaseOwner: null, leaseExpiresAt: null } });
    }
  }
  // Capability caches cannot restore access even for users absent from the backup participant list.
  for (const name of ['assessment_comparisons', 'assessment_discovery_sessions']) await db.collection(name).deleteMany({});
  return { participants: participants.length, deleted };
}
