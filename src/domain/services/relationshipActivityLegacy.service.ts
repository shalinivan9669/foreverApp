import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';
import {
  RelationshipActivity,
  type RelationshipActivityType,
} from '@/models/RelationshipActivity';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  toLegacyRelationshipActivityDTO,
  type PairActivityDTO,
} from '@/lib/dto';

type LegacyBucket = 'current' | 'suggested' | 'history' | undefined;

type LeanRelationshipActivity = RelationshipActivityType & {
  _id: Types.ObjectId;
};

const toLegacyStatusFilter = (bucket: LegacyBucket): 'pending' | 'completed' | undefined => {
  if (bucket === 'current' || bucket === 'suggested') return 'pending';
  if (bucket === 'history') return 'completed';
  return undefined;
};

const defaultAuditRequest = (pairId: string): AuditRequestContext => ({
  route: `/api/pairs/${pairId}/activities`,
  method: 'GET',
});

export const relationshipActivityLegacyService = {
  async listForPair(input: {
    pairId: string;
    members: [string, string];
    currentUserId: string;
    bucket?: string;
    auditRequest?: AuditRequestContext;
  }): Promise<PairActivityDTO[]> {
    await connectToDatabase();

    const users = await User.find({ id: { $in: input.members } })
      .select({ _id: 1, id: 1 })
      .lean<{ _id: Types.ObjectId; id: string }[]>();

    if (users.length !== 2) {
      return [];
    }

    const left = users.find((user) => user.id === input.members[0]);
    const right = users.find((user) => user.id === input.members[1]);
    if (!left || !right) {
      return [];
    }

    const bucket = input.bucket as LegacyBucket;
    const statusFilter = toLegacyStatusFilter(bucket);
    const limit = bucket === 'current' ? 1 : 50;

    const query: {
      $or: [
        { userId: Types.ObjectId; partnerId: Types.ObjectId },
        { userId: Types.ObjectId; partnerId: Types.ObjectId }
      ];
      status?: 'pending' | 'completed';
    } = {
      $or: [
        { userId: left._id, partnerId: right._id },
        { userId: right._id, partnerId: left._id },
      ],
    };

    if (statusFilter) {
      query.status = statusFilter;
    }

    const legacy = await RelationshipActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<LeanRelationshipActivity[]>();

    const mapped = legacy.map((item) =>
      toLegacyRelationshipActivityDTO({
        _id: item._id,
        pairId: input.pairId,
        type: item.type,
        status: item.status,
        payload: {
          title: item.payload.title,
          description: item.payload.description,
          dueAt: item.payload.dueAt,
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
    );

    if (mapped.length > 0) {
      await emitEvent({
        event: 'LEGACY_RELATIONSHIP_ACTIVITY_VIEWED',
        actor: { userId: input.currentUserId },
        request: input.auditRequest ?? defaultAuditRequest(input.pairId),
        context: {
          pairId: input.pairId,
        },
        target: {
          type: 'pair',
          id: input.pairId,
        },
        metadata: {
          pairId: input.pairId,
          count: mapped.length,
        },
      });
    }

    return mapped;
  },
};
