import { Types, type ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { betaInQuietHours } from '@/domain/assessment/schedule';
import { AssessmentPairOccurrence, AssessmentPairWork, type AssessmentPairOccurrenceType } from '@/models/AssessmentPairWork';
import { Notification } from '@/models/Notification';
import { connectToDatabase } from '@/lib/mongodb';
import { assessmentPairScope } from './assessmentPair.service';
import { assessmentTransaction, requireAssessmentEffect } from './assessmentAccess.service';

async function allowed(ownerId: string, occurrence: AssessmentPairOccurrenceType, now: Date, session: ClientSession) {
  await requireAssessmentEffect('NOTIFICATIONS', session);
  const scope = await assessmentPairScope(ownerId, session);
  if (!scope || scope.pairId !== occurrence.pairId || scope.dependencyHash !== occurrence.dependencyHash || occurrence.state !== 'PLANNED' || occurrence.endsAt <= now) return null;
  const row = await AssessmentPairWork.findOne({ _id: occurrence.agreementId, pairId: scope.pairId, contentRevision: occurrence.contentRevision, contentHash: occurrence.contentHash, revoked: false, activeAt: { $ne: null }, dependencyHash: scope.dependencyHash }).session(session).lean();
  if (!row || !scope.actors.every(actor => row.confirmations.some(value => value.ownerId === actor && value.contentRevision === row.contentRevision && value.contentHash === row.contentHash))) return null;
  return row.reminderSettings?.find(value => value.ownerId === ownerId && value.settings.enabled)?.settings ?? null;
}
/** Durable occurrences are the reminder intent. Unique notification keys make retries and concurrent workers converge. */
export async function processAssessmentReminders(now = new Date(), limit = 100): Promise<{ inspected: number; inserted: number }> {
  await connectToDatabase();
  const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
  const occurrences = await AssessmentPairOccurrence.find({ state: 'PLANNED', startsAt: { $lte: new Date(now.getTime() + 1440 * 60000) }, endsAt: { $gt: now } }).sort({ startsAt: 1, _id: 1 }).limit(bounded).lean<AssessmentPairOccurrenceType[]>();
  let inserted = 0;
  for (const occurrence of occurrences) for (const ownerId of occurrence.actorIds) {
    try {
      inserted += await assessmentTransaction(async session => {
        const current = await AssessmentPairOccurrence.findById(occurrence._id).session(session).lean<AssessmentPairOccurrenceType | null>();
        if (!current) return 0;
        const settings = await allowed(ownerId, current, now, session);
        if (!settings || current.startsAt.getTime() - settings.leadMinutes * 60000 > now.getTime() || betaInQuietHours(now, settings.timezone, settings.quietStartHour, settings.quietEndHour)) return 0;
        const dedupeKey = `beta-pair:${current.agreementId}:${current._id}`;
        const written = await Notification.updateOne({ userId: ownerId, dedupeKey }, { $setOnInsert: { userId: ownerId, dedupeKey, pairId: new Types.ObjectId(current.pairId), resourceId: current._id, type: 'BETA_PAIR_REMINDER', expiresAt: current.endsAt } }, { upsert: true, session });
        return written.upsertedCount;
      });
    } catch (error) {
      if (!(error instanceof DomainError && [403, 404, 409, 503].includes(error.status))) throw error;
    }
  }
  return { inspected: occurrences.length, inserted };
}
/** Reader rechecks current admission, stop switches, membership, version and owner preferences; TTL is not authorization. */
export async function refreshAssessmentReminderInbox(ownerId: string, now = new Date()): Promise<void> {
  const rows = await Notification.find({ userId: ownerId, type: 'BETA_PAIR_REMINDER' }).select({ _id: 1, resourceId: 1 }).limit(224).lean();
  for (const row of rows) {
    let visible = false;
    try {
      visible = await assessmentTransaction(async session => {
        const occurrence = row.resourceId ? await AssessmentPairOccurrence.findById(row.resourceId).session(session).lean<AssessmentPairOccurrenceType | null>() : null;
        return Boolean(occurrence && await allowed(ownerId, occurrence, now, session));
      });
    } catch (error) {
      if (!(error instanceof DomainError && [403, 404, 409, 503].includes(error.status))) throw error;
    }
    if (!visible) await Notification.deleteOne({ _id: row._id, userId: ownerId });
  }
}
