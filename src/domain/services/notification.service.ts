import { createHash } from 'node:crypto';
import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import {
  Notification,
  type NotificationDocumentType,
  type NotificationType,
} from '@/models/Notification';
import {
  toNotificationDTO,
  type NotificationDTO,
} from '@/lib/dto/notification.dto';

const NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type StoredNotification = NotificationDocumentType & { _id: Types.ObjectId };

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
      items: page.map(toNotificationDTO),
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
      return toNotificationDTO(notification);
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
    return toNotificationDTO(existing);
  },
};
