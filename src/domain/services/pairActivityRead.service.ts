import { Types } from 'mongoose';
import { PairActivity } from '@/models/PairActivity';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { toPairActivityDTO, type PairActivityDTO } from '@/lib/dto';
import { isOwnerSafetyGateActive } from '@/domain/services/safetyGate.service';
import {
  isActivityAccessibleToRole,
  isOfferedActivityEligibleForRole,
  type PairMemberRole,
} from '@/domain/services/activityEligibility.service';

export type PairActivityBucket = 'current' | 'suggested' | 'history';

const buildQuery = (pairId: Types.ObjectId, status?: string) => {
  const query: Record<string, unknown> = { pairId };
  if (!status) return { query, limit: 50 };

  const bucket = status as PairActivityBucket;
  if (bucket === 'suggested') {
    query.status = 'offered';
    return { query, limit: 50 };
  }
  if (bucket === 'current') {
    query.status = {
      $in: [
        'accepted',
        'in_progress',
        'awaiting_feedback',
        'awaiting_checkin',
      ],
    };
    return { query, limit: 1 };
  }
  if (bucket === 'history') {
    query.status = {
      $in: [
        'completed_success',
        'completed_partial',
        'failed',
        'cancelled',
        'expired',
      ],
    };
    return { query, limit: 50 };
  }

  query.status = status;
  return { query, limit: 50 };
};

export const pairActivityReadService = {
  async list(input: {
    pairId: Types.ObjectId;
    currentUserId: string;
    role: PairMemberRole;
    status?: string;
  }): Promise<PairActivityDTO[]> {
    const { query, limit } = buildQuery(input.pairId, input.status);
    const [activities, safetyVeto, offeredDecisions] = await Promise.all([
      PairActivity.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.max(200, limit * 4))
        .lean(),
      isOwnerSafetyGateActive({
        pairId: String(input.pairId),
        ownerUserId: input.currentUserId,
      }),
      RecommendationDecision.find({
        pairId: input.pairId,
        status: 'OFFERED',
      })
        .select({ activityId: 1 })
        .lean<Array<{ activityId: Types.ObjectId }>>(),
    ]);
    const canonicalOfferedIds = new Set(
      offeredDecisions.map((decision) => String(decision.activityId))
    );

    const visible = activities.filter((activity) => {
      if (!isActivityAccessibleToRole(activity, input.role)) return false;
      if (
        activity.status === 'offered' &&
        !canonicalOfferedIds.has(String(activity._id))
      ) {
        return false;
      }
      if (safetyVeto && activity.status === 'offered') {
        return isOfferedActivityEligibleForRole({
          activity,
          role: input.role,
          safetyVeto,
        });
      }
      const needsSafeProjection =
        activity.status === 'offered' ||
        activity.status === 'cancelled' ||
        activity.status === 'expired';
      return (
        !needsSafeProjection ||
        isOfferedActivityEligibleForRole({
          activity,
          role: input.role,
          safetyVeto: false,
        })
      );
    });

    return visible
      .map((activity) =>
        toPairActivityDTO(activity, {
          includeLegacyId: true,
          includeAnswers: false,
        })
      )
      .sort((left, right) => {
        const leftTs = Date.parse(left.createdAt ?? left.offeredAt ?? '');
        const rightTs = Date.parse(right.createdAt ?? right.offeredAt ?? '');
        return (
          (Number.isFinite(rightTs) ? rightTs : 0) -
          (Number.isFinite(leftTs) ? leftTs : 0)
        );
      })
      .slice(0, limit);
  },
};
