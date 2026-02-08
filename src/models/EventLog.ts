import mongoose, { Schema } from 'mongoose';
import type {
  AuditContext,
  AuditEventName,
  AuditRequestContext,
  AuditTarget,
  EventRetentionTier,
} from '@/lib/audit/eventTypes';

type EventMetadataScalar = string | number | boolean | null;
type EventMetadataValue =
  | EventMetadataScalar
  | EventMetadataScalar[]
  | Record<string, EventMetadataScalar>;
type EventMetadata = Record<string, EventMetadataValue>;

export interface EventLogType {
  event: AuditEventName;
  ts: number;
  actor: {
    userId: string;
  };
  context?: AuditContext;
  target?: AuditTarget;
  request: AuditRequestContext;
  metadata: EventMetadata;
  retentionTier: EventRetentionTier;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const EventLogSchema = new Schema(
  {
    event: { type: String, required: true },
    ts: { type: Number, required: true },
    actor: {
      userId: { type: String, required: true },
    },
    context: {
      pairId: { type: String, required: false },
      activityId: { type: String, required: false },
      likeId: { type: String, required: false },
      questionnaireId: { type: String, required: false },
    },
    target: {
      type: { type: String, required: false },
      id: { type: String, required: false },
    },
    request: {
      route: { type: String, required: true },
      method: { type: String, required: true },
      ip: { type: String, required: false },
      ua: { type: String, required: false },
    },
    metadata: { type: Schema.Types.Mixed, required: true },
    retentionTier: {
      type: String,
      enum: ['short', 'long', 'abuse'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'event_logs', timestamps: true }
);

EventLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EventLogSchema.index({ event: 1, ts: -1 });
EventLogSchema.index({ 'actor.userId': 1, ts: -1 });
EventLogSchema.index({ 'context.pairId': 1, ts: -1 });
EventLogSchema.index({ 'context.activityId': 1, ts: -1 });
EventLogSchema.index({ 'context.likeId': 1, ts: -1 });
EventLogSchema.index({ 'context.questionnaireId': 1, ts: -1 });

export const EventLog =
  (mongoose.models.EventLog as mongoose.Model<EventLogType>) ||
  mongoose.model<EventLogType>('EventLog', EventLogSchema);
