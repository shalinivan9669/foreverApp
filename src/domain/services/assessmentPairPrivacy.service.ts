import { connectToDatabase } from '@/lib/mongodb';
import { AssessmentPairReport, AssessmentPairWork } from '@/models/AssessmentPairWork';
import { requireAssessmentRecoveryReadable } from './assessmentAccess.service';

/** Owner-only author records; neither partner report nor hidden shared inference is exported. */
export async function exportOwnerAssessmentPairData(ownerId: string) {
  await requireAssessmentRecoveryReadable();
  await connectToDatabase();
  const rows = await AssessmentPairReport.find({ ownerId }).sort({ recordedAt: -1 }).limit(1001).lean();
  const work = await AssessmentPairWork.find({ actorIds: ownerId }).limit(100).lean();
  return { truncated: rows.length > 1000, ownAgreementControls: work.map(row => ({ pairId: row.pairId, contentRevision: row.contentRevision, ownNote: row.privateNotes?.find(value => value.ownerId === ownerId)?.note ?? '', reminders: row.reminderSettings?.find(value => value.ownerId === ownerId)?.settings ?? null })), reports: rows.slice(0, 1000).map(row => ({ pairId: row.pairId, contentRevision: row.contentRevision,
    periodId: row.periodId, window: row.window, value: row.value, shared: row.shared,
    revision: row.revision, recordedAt: row.recordedAt })) };
}
