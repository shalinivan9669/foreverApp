import mongoose, { Schema, Types } from 'mongoose';
import type { Axis } from './ActivityTemplate';

export type PairEventCategory =
  | 'relationship_milestone'
  | 'calendar_event'
  | 'behavioral_event'
  | 'system_signal';

export type PairEventType =
  | 'first_month'
  | 'three_months'
  | 'six_months'
  | 'anniversary'
  | 'valentines_day'
  | 'march_8'
  | 'new_year'
  | 'partner_birthday'
  | 'inactive_pair'
  | 'failed_activity_recovery'
  | 'high_fatigue_recovery'
  | 'weekly_divergence_repair'
  | 'weekly_success_celebration'
  | 'diagnostics_risk_focus';

export type PairEventStatus =
  | 'upcoming'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'snoozed'
  | 'expired'
  | 'completed';

export type PairEventSourceKind =
  | 'pair_created_at'
  | 'calendar_rule'
  | 'weekly_checkin'
  | 'activity_history'
  | 'diagnostics'
  | 'manual';

export interface PairEventTypeModel {
  pairId: Types.ObjectId;
  key: string;
  category: PairEventCategory;
  type: PairEventType;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
  why: { ru: string; en: string };
  eventDate?: Date;
  windowStart: Date;
  windowEnd: Date;
  status: PairEventStatus;
  priority: 1 | 2 | 3;
  severity?: 1 | 2 | 3;
  axis?: Axis[];
  source: {
    kind: PairEventSourceKind;
    refId?: string;
    weekKey?: string;
    date?: Date;
  };
  actionPolicy: {
    canAccept: boolean;
    canDecline: boolean;
    canSnooze: boolean;
    maxGeneratedActivities: 1 | 2 | 3;
  };
  generatedActivityIds: Types.ObjectId[];
  acceptedAt?: Date;
  declinedAt?: Date;
  snoozedUntil?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const I18nSchema = new Schema(
  {
    ru: { type: String, required: true },
    en: { type: String, required: true },
  },
  { _id: false }
);

const PairEventSchema = new Schema<PairEventTypeModel>(
  {
    pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },
    key: { type: String, required: true },
    category: {
      type: String,
      enum: ['relationship_milestone', 'calendar_event', 'behavioral_event', 'system_signal'],
      required: true,
    },
    type: {
      type: String,
      enum: [
        'first_month',
        'three_months',
        'six_months',
        'anniversary',
        'valentines_day',
        'march_8',
        'new_year',
        'partner_birthday',
        'inactive_pair',
        'failed_activity_recovery',
        'high_fatigue_recovery',
        'weekly_divergence_repair',
        'weekly_success_celebration',
        'diagnostics_risk_focus',
      ],
      required: true,
    },
    title: { type: I18nSchema, required: true },
    description: { type: I18nSchema, required: true },
    why: { type: I18nSchema, required: true },
    eventDate: { type: Date },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ['upcoming', 'offered', 'accepted', 'declined', 'snoozed', 'expired', 'completed'],
      required: true,
    },
    priority: { type: Number, enum: [1, 2, 3], required: true },
    severity: { type: Number, enum: [1, 2, 3] },
    axis: {
      type: [String],
      enum: ['communication', 'domestic', 'personalViews', 'finance', 'sexuality', 'psyche'],
      default: [],
    },
    source: {
      kind: {
        type: String,
        enum: ['pair_created_at', 'calendar_rule', 'weekly_checkin', 'activity_history', 'diagnostics', 'manual'],
        required: true,
      },
      refId: { type: String },
      weekKey: { type: String },
      date: { type: Date },
    },
    actionPolicy: {
      canAccept: { type: Boolean, required: true, default: true },
      canDecline: { type: Boolean, required: true, default: true },
      canSnooze: { type: Boolean, required: true, default: true },
      maxGeneratedActivities: { type: Number, enum: [1, 2, 3], required: true, default: 2 },
    },
    generatedActivityIds: {
      type: [Schema.Types.ObjectId],
      ref: 'PairActivity',
      default: [],
    },
    acceptedAt: { type: Date },
    declinedAt: { type: Date },
    snoozedUntil: { type: Date },
    completedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { collection: 'pair_events', timestamps: true }
);

PairEventSchema.index({ pairId: 1, key: 1 }, { unique: true });
PairEventSchema.index({ pairId: 1, status: 1, windowStart: 1 });
PairEventSchema.index({ pairId: 1, type: 1, eventDate: 1 });
PairEventSchema.index({ expiresAt: 1 });

export const PairEvent =
  (mongoose.models.PairEvent as mongoose.Model<PairEventTypeModel>) ||
  mongoose.model<PairEventTypeModel>('PairEvent', PairEventSchema);
