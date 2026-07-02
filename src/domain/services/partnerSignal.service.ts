import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { DomainError } from '@/domain/errors';
import { Pair } from '@/models/Pair';
import { PersonalDailyCheckIn } from '@/models/PersonalDailyCheckIn';
import { PartnerSignal, type PartnerSignalTone } from '@/models/PartnerSignal';

export type PartnerSignalSendResponse = {
  id: string;
  status: 'sent';
  sentAt: string;
};

const toneFromMode = (mode: string | undefined): PartnerSignalTone => {
  if (mode === 'repair') return 'repair';
  if (mode === 'low_resource') return 'low_resource';
  if (mode === 'closeness') return 'closeness';
  if (mode === 'conflict_risk') return 'space';
  if (mode === 'growth') return 'support';
  return 'neutral';
};

export const partnerSignalService = {
  async send(input: {
    currentUserId: string;
    checkInId: string;
    text: string;
  }): Promise<PartnerSignalSendResponse> {
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

    const toUserId = pair.members.find((memberId) => memberId !== input.currentUserId);
    if (!toUserId) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Pair receiver was not found',
      });
    }

    const sentAt = new Date();
    const signal = await PartnerSignal.create({
      pairId: String(pair._id),
      fromUserId: input.currentUserId,
      toUserId,
      sourceCheckInId: checkIn._id,
      dateKey: checkIn.dateKey,
      text,
      tone: toneFromMode(checkIn.computed?.mode),
      status: 'sent',
      createdAt: sentAt,
    });

    await PersonalDailyCheckIn.updateOne(
      { _id: checkIn._id, userId: input.currentUserId },
      {
        $set: {
          'share.partnerSignal.enabled': true,
          'share.partnerSignal.text': text,
          'share.partnerSignal.status': 'sent',
          'share.partnerSignal.sentSignalId': signal._id,
          'share.partnerSignal.sentAt': sentAt,
        },
      }
    );

    return {
      id: String(signal._id),
      status: 'sent',
      sentAt: sentAt.toISOString(),
    };
  },
};
