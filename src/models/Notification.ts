import mongoose, { Schema, Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'PAIR_JOINED',
  'CYCLE_AVAILABLE',
  'SUMMARY_READY',
  'ACTION_AVAILABLE',
  'FEEDBACK_REQUESTED',
  'MATCH_LIKE_RECEIVED',
  'MATCH_LIKE_RESPONDED',
  'MATCH_CONNECTED',
  'MATCH_CONFIRMATION_REQUESTED',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDocumentType {
  userId: string;
  pairId?: Types.ObjectId;
  resourceId?: string;
  type: NotificationType;
  dedupeKey: string;
  readAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocumentType>(
  {
    userId: { type: String, required: true, trim: true },
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair' },
    resourceId: { type: String, trim: true, maxlength: 200 },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    dedupeKey: { type: String, required: true, immutable: true },
    readAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'notifications', timestamps: true, versionKey: false }
);

notificationSchema.pre('validate', function () {
  const matchingType = this.type.startsWith('MATCH_');
  if (matchingType && !this.resourceId) {
    this.invalidate('resourceId', 'A matching notification requires a resource');
  }
  if (!matchingType && !this.pairId) {
    this.invalidate('pairId', 'A pair notification requires a pair');
  }
});

notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, name: 'notification_user_dedupe' }
);
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ pairId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ resourceId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Notification =
  (mongoose.models.Notification as mongoose.Model<NotificationDocumentType>) ||
  mongoose.model<NotificationDocumentType>('Notification', notificationSchema);
