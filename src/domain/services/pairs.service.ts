import mongoose, { Types, type HydratedDocument } from 'mongoose';
import type { PairType } from '@/models/Pair';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { PairEvent } from '@/models/PairEvent';
import { PairInvite } from '@/models/PairInvite';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PartnerSignal } from '@/models/PartnerSignal';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { SafetyGate } from '@/models/SafetyGate';
import { WeeklyCycle } from '@/models/WeeklyCycle';
import { Notification } from '@/models/Notification';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { pairTransition } from '@/domain/state/pairMachine';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

const guardFailureToDomainError = async (response: Response): Promise<DomainError> => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null) as GuardErrorPayload | null;

  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensurePairMember = async (
  pairId: string,
  currentUserId: string
): Promise<{ pair: HydratedDocument<PairType>; by: 'A' | 'B' }> => {
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) {
    throw await guardFailureToDomainError(guard.response);
  }
  return guard.data;
};

export type PairStateReliabilityTestHooks = {
  beforeStateCas?: () => Promise<void>;
};

const persistPairStateTransition = async (input: {
  pairId: Types.ObjectId;
  currentUserId: string;
  fromStatus: PairType['status'];
  toStatus: PairType['status'];
  hooks: PairStateReliabilityTestHooks;
}): Promise<void> => {
  await input.hooks.beforeStateCas?.();
  const result = await Pair.updateOne(
    {
      _id: input.pairId,
      members: input.currentUserId,
      status: input.fromStatus,
    },
    {
      $set: { status: input.toStatus },
      $inc: { lifecycleRevision: 1 },
    }
  );
  if (result.matchedCount !== 1) {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'pair state changed concurrently',
    });
  }
};

export const pairsService = {
  async createPair(input: {
    currentUserId: string;
    partnerId?: string;
    likeId?: string;
    auditRequest?: AuditRequestContext;
  }): Promise<{ pairId: string }> {
    void input;
    throw new DomainError({
      code: 'PAIR_INVITE_REQUIRED',
      status: 409,
      message: 'Use a consensual pair invitation',
    });
  },

  async pausePair(input: {
    pairId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }, hooks: PairStateReliabilityTestHooks = {}): Promise<Record<string, never>> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);

    const transition = pairTransition(
      { status: pairData.pair.status },
      { type: 'PAUSE' },
      {
        currentUserId: input.currentUserId,
        role: pairData.by,
      }
    );

    await persistPairStateTransition({
      pairId: pairData.pair._id as Types.ObjectId,
      currentUserId: input.currentUserId,
      fromStatus: pairData.pair.status,
      toStatus: transition.next.status,
      hooks,
    });

    await emitEvent({
      event: 'PAIR_PAUSED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: `/api/pairs/${input.pairId}/pause`, method: 'POST' },
      context: {
        pairId: input.pairId,
      },
      target: {
        type: 'pair',
        id: input.pairId,
      },
      metadata: {
        pairId: input.pairId,
      },
    });

    return {};
  },

  async resumePair(input: {
    pairId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }, hooks: PairStateReliabilityTestHooks = {}): Promise<Record<string, never>> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);

    const transition = pairTransition(
      { status: pairData.pair.status },
      { type: 'RESUME' },
      {
        currentUserId: input.currentUserId,
        role: pairData.by,
      }
    );

    await persistPairStateTransition({
      pairId: pairData.pair._id as Types.ObjectId,
      currentUserId: input.currentUserId,
      fromStatus: pairData.pair.status,
      toStatus: transition.next.status,
      hooks,
    });

    await emitEvent({
      event: 'PAIR_RESUMED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: `/api/pairs/${input.pairId}/resume`, method: 'POST' },
      context: {
        pairId: input.pairId,
      },
      target: {
        type: 'pair',
        id: input.pairId,
      },
      metadata: {
        pairId: input.pairId,
      },
    });

    return {};
  },

  async endPair(input: {
    pairId: string;
    currentUserId: string;
    reason?: 'MEMBER_REQUEST' | 'ACCOUNT_DELETION';
    auditRequest?: AuditRequestContext;
  }): Promise<{ endedAt: string }> {
    if (!Types.ObjectId.isValid(input.pairId)) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'pair not found',
      });
    }

    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    pairTransition(
      { status: pairData.pair.status },
      { type: 'END' },
      { currentUserId: input.currentUserId, role: pairData.by }
    );

    const now = new Date();
    const reason = input.reason ?? 'MEMBER_REQUEST';
    const pairObjectId = new Types.ObjectId(input.pairId);
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const ended = await Pair.findOneAndUpdate(
          {
            _id: pairObjectId,
            members: input.currentUserId,
            status: { $in: ['active', 'paused'] },
          },
          {
            $set: {
              status: 'ended',
              endedAt: now,
              endedByUserId: input.currentUserId,
              endReason: reason,
            },
            $inc: { lifecycleRevision: 1 },
            $unset: { activeActivity: 1 },
          },
          { new: true, session }
        ).select({ _id: 1, members: 1 });

        if (!ended) {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'pair is no longer active',
          });
        }

        await PairMembershipClaim.deleteMany({ pairId: pairObjectId }, { session });
        await PairInvite.updateMany(
          {
            creatorUserId: { $in: ended.members },
            status: 'ACTIVE',
          },
          { $set: { status: 'CANCELLED' } },
          { session }
        );
        await WeeklyCycle.updateMany(
            { pairId: pairObjectId, status: 'OPEN' },
            {
              $set: {
                status: 'EXPIRED',
                pairReadiness: 'EXPIRED',
                endsAt: now,
                expiresAt: now,
                submissionClaims: [],
                'memberCompletion.$[pending].status': 'EXPIRED',
              },
            },
            {
              session,
              arrayFilters: [{ 'pending.status': 'PENDING' }],
            }
          );
        await PairActivity.updateMany(
            {
              pairId: pairObjectId,
              status: {
                $in: [
                  'suggested',
                  'offered',
                  'accepted',
                  'in_progress',
                  'awaiting_feedback',
                  'awaiting_checkin',
                ],
              },
            },
            { $set: { status: 'cancelled' } },
            { session }
          );
        await RecommendationDecision.updateMany(
            { pairId: pairObjectId, status: { $in: ['OFFERED', 'ACCEPTED'] } },
            { $set: { status: 'EXPIRED', expiredAt: now } },
            { session }
          );
        await PairEvent.updateMany(
            {
              pairId: pairObjectId,
              status: { $nin: ['completed', 'declined', 'expired'] },
            },
            { $set: { status: 'expired', expiresAt: now } },
            { session }
          );
        await PairQuestionnaireSession.updateMany(
          { pairId: pairObjectId, status: 'in_progress' },
          {
            $set: {
              status: 'closed',
              finishedAt: now,
              'meta.lifecycleClosure': 'PAIR_ENDED',
            },
          },
          { session }
        );
        await SafetyGate.updateMany(
            { pairId: pairObjectId, enabled: true },
            { $set: { enabled: false, revokedAt: now } },
            { session }
          );
        await PartnerSignal.deleteMany({ pairId: pairObjectId }, { session });
        await Notification.deleteMany({ pairId: pairObjectId }, { session });
      });
    } finally {
      await session.endSession();
    }

    await emitEvent({
      event: 'PAIR_ENDED',
      actor: { userId: input.currentUserId },
      request:
        input.auditRequest ?? {
          route: `/api/pairs/${input.pairId}/end`,
          method: 'POST',
        },
      context: { pairId: input.pairId },
      target: { type: 'pair', id: input.pairId },
      metadata: { pairId: input.pairId, reason },
    });

    return { endedAt: now.toISOString() };
  },
};
