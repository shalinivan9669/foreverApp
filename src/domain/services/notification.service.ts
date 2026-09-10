import { createHash } from 'node:crypto';
import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import { refreshAssessmentReminderInbox } from './assessmentReminders.service';
import { Pair, type PairType } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { WeeklyCycle, type WeeklyCycleType } from '@/models/WeeklyCycle';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { loadMatchingPeople, isMatchingPersonEligible } from '@/domain/services/matching/matchingEligibility.service';
import {
  Notification,
  type NotificationDocumentType,
  type NotificationType,
} from '@/models/Notification';
import {
  toNotificationDTO,
  type NotificationDTO,
  type NotificationActionContext,
} from '@/lib/dto/notification.dto';

const NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type StoredNotification = NotificationDocumentType & { _id: Types.ObjectId };

// Read current state without loading private source payloads. Notification readAt
// records reading only; task completion always comes from its own aggregate.
const mapCurrentNotifications = async (documents: StoredNotification[], currentUserId: string): Promise<NotificationDTO[]> => {
  const pairIds = documents.flatMap((item) => item.pairId ? [item.pairId] : []);
  const resourceIds = documents.flatMap((item) => item.resourceId && /^[a-f0-9]{24}$/i.test(item.resourceId) ? [item.resourceId] : []);
  const pairs = await Pair.find({ $or: [{ _id: { $in: pairIds } }, { status: { $in: ['active', 'paused'] } }], members: currentUserId })
    .select({ _id: 1, status: 1, members: 1 }).lean<Array<Pick<PairType, 'status' | 'members'> & { _id: Types.ObjectId }>>();
  const accessiblePairIds = pairs.filter((pair) => pair.status === 'active').map((pair) => pair._id);
  const [cycles, activities, decisions, people] = await Promise.all([
    WeeklyCycle.find({ _id: { $in: resourceIds }, pairId: { $in: accessiblePairIds } })
      .select({ _id: 1, pairId: 1, cycleKey: 1, status: 1, endsAt: 1, memberCompletion: 1 }).lean<Array<Pick<WeeklyCycleType, 'pairId' | 'cycleKey' | 'status' | 'endsAt' | 'memberCompletion'> & { _id: Types.ObjectId }>>(),
    PairActivity.aggregate<{ _id: Types.ObjectId; pairId: Types.ObjectId; status: string; feedbackRoles: Array<'A' | 'B'>; resultSummary?: { bothSubmitted: boolean; submittedBy: Array<'A' | 'B'> } }>([
      { $match: { _id: { $in: resourceIds.map((id) => new Types.ObjectId(id)) }, pairId: { $in: accessiblePairIds } } },
      { $project: { _id: 1, pairId: 1, status: 1, 'resultSummary.bothSubmitted': 1, 'resultSummary.submittedBy': 1,
        feedbackRoles: { $setUnion: [{ $ifNull: ['$answers.by', []] }, []] } } },
    ]),
    RecommendationDecision.find({ _id: { $in: resourceIds }, pairId: { $in: accessiblePairIds } })
      .select({ _id: 1, pairId: 1, status: 1, expiresAt: 1 }).lean<Array<{ _id: Types.ObjectId; pairId: Types.ObjectId; status: string; expiresAt?: Date }>>(),
    documents.some((item) => item.type.startsWith('MATCH_')) ? loadMatchingPeople([currentUserId]) : Promise.resolve(null),
  ]);
  const now = Date.now();
  return documents.map((item) => {
    const pair = pairs.find((value) => String(value._id) === String(item.pairId));
    const context: NotificationActionContext = item.pairId
      ? { pairStatus: pair?.status ?? 'unavailable' }
      : { matchingEligible: Boolean(people && isMatchingPersonEligible(people.get(currentUserId)) && !pairs.some((value) => value.status !== 'ended')) };
    if (pair?.status === 'active' && item.resourceId) {
      if (item.type === 'CYCLE_AVAILABLE' || item.type === 'SUMMARY_READY') {
        const cycle = cycles.find((value) => String(value._id) === item.resourceId && String(value.pairId) === String(pair._id));
        const mine = cycle?.memberCompletion.find((value) => value.userId === currentUserId)?.status;
        if (cycle) context.cycleKey = cycle.cycleKey;
        if (!cycle) context.resourceState = 'missing';
        else if (item.type === 'CYCLE_AVAILABLE') {
          if (mine === 'SKIPPED') context.resourceState = 'completed';
          else if (mine === 'SUBMITTED') context.resourceState = cycle.memberCompletion.every((value) => value.status === 'SUBMITTED') ? 'completed' : 'waiting';
          else if (cycle.status === 'EXPIRED' || cycle.endsAt.getTime() <= now) context.resourceState = 'expired';
        }
      } else if (item.type === 'FEEDBACK_REQUESTED') {
        const activity = activities.find((value) => String(value._id) === item.resourceId && String(value.pairId) === String(pair._id));
        if (!activity) context.resourceState = 'missing';
        else if (activity.resultSummary?.bothSubmitted) context.resourceState = 'completed';
        else if (activity.feedbackRoles.includes(pair.members[0] === currentUserId ? 'A' : 'B') || activity.resultSummary?.submittedBy.includes(pair.members[0] === currentUserId ? 'A' : 'B')) context.resourceState = 'waiting';
        else if (['expired', 'cancelled', 'failed', 'completed_success'].includes(activity.status)) context.resourceState = 'expired';
      } else if (item.type === 'ACTION_AVAILABLE') {
        const decision = decisions.find((value) => String(value._id) === item.resourceId && String(value.pairId) === String(pair._id));
        if (!decision) context.resourceState = 'missing';
        else if (decision.status !== 'OFFERED' || (decision.expiresAt && decision.expiresAt.getTime() <= now)) context.resourceState = 'expired';
      }
    }
    return toNotificationDTO(item, context);
  });
};

type CursorValue = { createdAt: Date; id: string };

const encodeCursor = (notification: StoredNotification): string =>
  Buffer.from(
    `${notification.createdAt.toISOString()}|${String(notification._id)}`,
    'utf8'
  ).toString('base64url');

const decodeCursor = (cursor: string | undefined): CursorValue | null => {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator <= 0) return null;
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(createdAt.getTime()) || !/^[a-f0-9]{24}$/i.test(id)) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
};

const dedupeKeyFor = (input: {
  userId: string;
  pairId: string;
  type: NotificationType;
  sourceKey: string;
}): string =>
  createHash('sha256')
    .update(`${input.userId}|${input.pairId}|${input.type}|${input.sourceKey}`)
    .digest('hex');

export const notificationService = {
  async create(input: {
    userIds: string[];
    pairId: string;
    type: NotificationType;
    sourceKey: string;
    resourceId?: string;
    now?: Date;
    session?: ClientSession;
  }): Promise<void> {
    await connectToDatabase();
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + NOTIFICATION_RETENTION_MS);
    const userIds = Array.from(new Set(input.userIds.map((id) => id.trim()).filter(Boolean)));
    if (userIds.length === 0) return;
    if (!Types.ObjectId.isValid(input.pairId)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Invalid notification pair',
      });
    }
    const pairId = new Types.ObjectId(input.pairId);

    await Notification.bulkWrite(
      userIds.map((userId) => ({
        updateOne: {
          filter: {
            userId,
            dedupeKey: dedupeKeyFor({
              userId,
              pairId: input.pairId,
              type: input.type,
              sourceKey: input.sourceKey,
            }),
          },
          update: {
            $setOnInsert: {
              userId,
              pairId,
              type: input.type,
              ...(input.resourceId ? { resourceId: input.resourceId } : {}),
              dedupeKey: dedupeKeyFor({
                userId,
                pairId: input.pairId,
                type: input.type,
                sourceKey: input.sourceKey,
              }),
              expiresAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false, session: input.session }
    );
  },

  async list(input: {
    currentUserId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: NotificationDTO[]; nextCursor?: string; unreadCount: number }> {
    await connectToDatabase();
    await refreshAssessmentReminderInbox(input.currentUserId);
    const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
    const cursor = decodeCursor(input.cursor);
    if (input.cursor && !cursor) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Invalid notification cursor',
      });
    }

    const filter: FilterQuery<NotificationDocumentType> = {
      userId: input.currentUserId,
    };
    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const [documents, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean<StoredNotification[]>(),
      Notification.countDocuments({
        userId: input.currentUserId,
        readAt: { $exists: false },
      }),
    ]);
    const hasMore = documents.length > limit;
    const page = hasMore ? documents.slice(0, limit) : documents;
    const last = page.at(-1);
    return {
      items: await mapCurrentNotifications(page, input.currentUserId),
      ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
      unreadCount,
    };
  },

  async markRead(input: {
    currentUserId: string;
    notificationId: string;
    now?: Date;
  }): Promise<NotificationDTO> {
    await connectToDatabase();
    await refreshAssessmentReminderInbox(input.currentUserId);
    const notification = await Notification.findOneAndUpdate(
      {
        _id: input.notificationId,
        userId: input.currentUserId,
        readAt: { $exists: false },
      },
      { $set: { readAt: input.now ?? new Date() } },
      { new: true }
    ).lean<StoredNotification | null>();
    if (notification) {
      return (await mapCurrentNotifications([notification], input.currentUserId))[0];
    }

    const existing = await Notification.findOne({
      _id: input.notificationId,
      userId: input.currentUserId,
    }).lean<StoredNotification | null>();
    if (!existing) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Notification not found',
      });
    }
    return (await mapCurrentNotifications([existing], input.currentUserId))[0];
  },
};
