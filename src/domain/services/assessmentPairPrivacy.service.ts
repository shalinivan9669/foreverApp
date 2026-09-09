import { connectToDatabase } from '@/lib/mongodb';
import { AssessmentPairReport } from '@/models/AssessmentPairWork';

/** Owner-only author records; neither partner report nor hidden shared inference is exported. */
export async function exportOwnerAssessmentPairData(ownerId: string) {
  await connectToDatabase();
  const rows = await AssessmentPairReport.find({ ownerId }).sort({ recordedAt: -1 }).limit(1001).lean();
  return { truncated: rows.length > 1000, reports: rows.slice(0, 1000).map(row => ({ pairId: row.pairId, contentRevision: row.contentRevision,
    periodId: row.periodId, window: row.window, value: row.value, shared: row.shared,
    revision: row.revision, recordedAt: row.recordedAt })) };
}
