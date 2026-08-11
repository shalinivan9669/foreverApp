import mongoose, { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { Pair } from '@/models/Pair';
import { PersonalDailyCheckIn } from '@/models/PersonalDailyCheckIn';
import { PartnerSignal, type PartnerSignalType } from '@/models/PartnerSignal';

export type PartnerSignalSendResponse = {
  id: string;
  status: 'sent';
  sentAt: string;
};

export type PartnerSignalReliabilityTestHooks = {
  beforeTransactionalPairGuard?: () => Promise<void>;
};

const PARTNER_SIGNAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const partnerSignalService = {
  async send(input: {
    currentUserId: string;
    checkInId: string;
    text: string;
    auditRequest?: AuditRequestContext;
  }, hooks: PartnerSignalReliabilityTestHooks = {}): Promise<PartnerSignalSendResponse> {
    await connectToDatabase();
    const checkInId = input.checkInId.trim();
    const text = input.text.trim();

    if (!Types.ObjectId.isValid(checkInId)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'checkInId is invalid',
      });
    }
    if (!text || text.length > 300) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'text must be 1..300 characters',
      });
    }

    const checkIn = await PersonalDailyCheckIn.findOne({
      _id: new Types.ObjectId(checkInId),
      userId: input.currentUserId,
    });
    if (!checkIn) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Daily check-in not found',
      });
    }

    const pair = await Pair.findOne({
      members: input.currentUserId,
      status: { $in: ['active', 'paused'] },
      ...(checkIn.pairId ? { _id: checkIn.pairId } : {}),
    });
    if (!pair) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Partner signal is available only for an active or paused pair',
      });
    }

    const initialToUserId = pair.members.find(
      (memberId) => memberId !== input.currentUserId
    );
    if (!initialToUserId) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Pair receiver was not found',
      });
    }

    const sentAt = new Date();
    const outcome: {
      toUserId: string;
      signal: HydratedDocument<PartnerSignalType> | null;
    } = { toUserId: initialToUserId, signal: null };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await hooks.beforeTransactionalPairGuard?.();
        const activePair = await Pair.findOneAndUpdate(
          {
            _id: pair._id,
            members: input.currentUserId,
            status: { $in: ['active', 'paused'] },
          },
          { $inc: { lifecycleRevision: 1 } },
          { new: false, session }
        ).select({ members: 1 });
        if (!activePair) {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Partner signal is unavailable after pair end',
          });
        }
        const receiver = activePair.members.find(
          (memberId) => memberId !== input.currentUserId
        );
        if (!receiver) {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Pair receiver was not found',
          });
        }
        outcome.toUserId = receiver;

        const canonicalCheckIn = await PersonalDailyCheckIn.findOne({
          _id: checkIn._id,
          userId: input.currentUserId,
        }).session(session);
        if (!canonicalCheckIn) {
          throw new DomainError({
            code: 'NOT_FOUND',
            status: 404,
            message: 'Daily check-in not found',
          });
        }

        let canonicalSignal = await PartnerSignal.findOne({
          sourceCheckInId: canonicalCheckIn._id,
        }).session(session);
        if (!canonicalSignal) {
          [canonicalSignal] = await PartnerSignal.create(
            [
              {
                pairId: activePair._id,
                fromUserId: input.currentUserId,
                toUserId: outcome.toUserId,
                sourceCheckInId: canonicalCheckIn._id,
                dateKey: canonicalCheckIn.dateKey,
                text,
                tone: 'neutral',
                status: 'sent',
                expiresAt: new Date(
                  sentAt.getTime() + PARTNER_SIGNAL_RETENTION_MS
                ),
              },
            ],
            { session }
          );
        }
        if (
          canonicalSignal.fromUserId !== input.currentUserId ||
          canonicalSignal.toUserId !== outcome.toUserId ||
          canonicalSignal.text !== text
        ) {
          throw new DomainError({
            code: 'PARTNER_SIGNAL_ALREADY_SENT',
            status: 409,
            message: 'A confirmed partner signal was already sent for this check-in',
          });
        }

        const sourceUpdated = await PersonalDailyCheckIn.updateOne(
          { _id: canonicalCheckIn._id, userId: input.currentUserId },
          {
            $set: {
              'share.partnerSignal.enabled': true,
              'share.partnerSignal.text': text,
              'share.partnerSignal.status': 'sent',
              'share.partnerSignal.sentSignalId': canonicalSignal._id,
              'share.partnerSignal.sentAt': canonicalSignal.createdAt,
            },
          },
          { session }
        );
        if (sourceUpdated.matchedCount !== 1) {
          throw new DomainError({
            code: 'PARTNER_SIGNAL_NOT_PERSISTED',
            status: 500,
            message: 'Partner signal source was not persisted',
          });
        }
        outcome.signal = canonicalSignal;
      });
    } finally {
      await session.endSession();
    }
    const signal = outcome.signal;
    if (!signal) {
      throw new DomainError({
        code: 'PARTNER_SIGNAL_NOT_PERSISTED',
        status: 500,
        message: 'Partner signal was not persisted',
      });
    }
    const canonicalSentAt = signal.createdAt;

    await emitEvent({
      event: 'PARTNER_SIGNAL_SENT',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? {
        route: '/api/users/me/daily-checkins/[id]/partner-signal',
        method: 'POST',
      },
      context: { pairId: String(pair._id) },
      target: { type: 'pair', id: String(pair._id) },
      metadata: {
        delivery: 'EXPLICIT_CONFIRMED',
        retentionClass: 'THIRTY_DAYS',
      },
    });

    return {
      id: String(signal._id),
      status: 'sent',
      sentAt: canonicalSentAt.toISOString(),
    };
  },
};
