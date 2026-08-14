import type { JsonValue } from '@/lib/api/response';
import type { LikeType } from '@/models/Like';
import type { PairActivityType } from '@/models/PairActivity';

export const AUDIT_EVENT_NAMES = [
  'MATCH_LIKE_CREATED',
  'MATCH_RESPONDED',
  'MATCH_ACCEPTED',
  'MATCH_REJECTED',
  'MATCH_CONFIRMED',
  'MATCH_PREFERENCES_UPDATED',
  'MATCH_USER_BLOCKED',
  'MATCH_USER_UNBLOCKED',
  'MATCH_CONNECTION_CONFIRMATION_CHANGED',
  'ACTIVITY_ACCEPTED',
  'ACTIVITY_STARTED',
  'ACTIVITY_CANCELED',
  'ACTIVITY_CHECKED_IN',
  'ACTIVITY_COMPLETED',
  'QUESTIONNAIRE_STARTED',
  'QUESTIONNAIRE_ANSWERED',
  'ANSWERS_BULK_SUBMITTED',
  'USER_ONBOARDING_UPDATED',
  'USER_PROFILE_UPSERTED',
  'MATCH_CARD_UPDATED',
  'PAIR_CREATED',
  'PAIR_PAUSED',
  'PAIR_RESUMED',
  'PAIR_ENDED',
  'LOG_VISIT_RECORDED',
  'SECURITY_AUTH_FAILED',
  'SESSION_REVOKED',
  'ABUSE_RATE_LIMIT_HIT',
  'ENTITLEMENT_DENIED',
  'ENTITLEMENT_GRANTED',
  'LEGACY_RELATIONSHIP_ACTIVITY_VIEWED',
  'SUGGESTIONS_GENERATED',
  'WEEKLY_CHECKIN_SUBMITTED',
  'PARTNER_SIGNAL_SENT',
  'SAFETY_GATE_UPDATED',
  'PRIVACY_EXPORT_CREATED',
  'PRIVACY_DELETION_REQUESTED',
  'PRIVACY_DELETION_CANCELLED',
  'PRIVACY_DELETION_EXECUTED',
] as const;

export type AuditEventName = (typeof AUDIT_EVENT_NAMES)[number];

export type EventRetentionTier = 'short' | 'long' | 'abuse';

export type AuditActor = {
  userId: string;
};

export type AuditContext = {
  pairId?: string;
  activityId?: string;
  likeId?: string;
  questionnaireId?: string;
};

export type AuditTarget = {
  type: 'pair' | 'activity' | 'like' | 'questionnaire' | 'user' | 'session' | 'system';
  id: string;
};

export type AuditRequestContext = {
  route: string;
  method: string;
  ip?: string;
  ua?: string;
};

export type AuditEventMetadataMap = {
  MATCH_LIKE_CREATED: {
    likeId: string;
    toUserId: string;
  };
  MATCH_RESPONDED: {
    likeId: string;
    status: Extract<LikeType['status'], 'awaiting_initiator' | 'RESPONDED'>;
  };
  MATCH_ACCEPTED: {
    likeId: string;
    status: Extract<LikeType['status'], 'mutual_ready' | 'MATCHED'>;
  };
  MATCH_REJECTED: {
    likeId: string;
    status: Extract<LikeType['status'], 'rejected' | 'DECLINED'>;
    already?: true;
  };
  MATCH_CONFIRMED: {
    likeId?: string;
    connectionId?: string;
    pairId: string;
    members: [string, string];
  };
  MATCH_PREFERENCES_UPDATED: {
    revision: number;
    factorCount: number;
  };
  MATCH_USER_BLOCKED: { blockedUserId: string };
  MATCH_USER_UNBLOCKED: { unblockedUserId: string };
  MATCH_CONNECTION_CONFIRMATION_CHANGED: {
    connectionId: string;
    action: 'REQUEST' | 'CONFIRM' | 'CANCEL';
    stage: 'MATCHED' | 'TALKING' | 'DATING' | 'COUPLE_CONFIRMED';
    pairFormed: boolean;
  };
  ACTIVITY_ACCEPTED: {
    activityId: string;
    status: Extract<PairActivityType['status'], 'accepted'>;
  };
  ACTIVITY_STARTED: {
    activityId: string;
    status: Extract<PairActivityType['status'], 'in_progress'>;
  };
  ACTIVITY_CANCELED: {
    activityId: string;
    status: Extract<PairActivityType['status'], 'cancelled'>;
  };
  ACTIVITY_CHECKED_IN: {
    activityId: string;
    status: Extract<
      PairActivityType['status'],
      | 'awaiting_feedback'
      | 'awaiting_checkin'
      | 'completed_success'
      | 'completed_partial'
      | 'failed'
    >;
    dataStatus: 'PARTIAL' | 'ENOUGH';
    resultVersion: 'activity-result-v2';
  };
  ACTIVITY_COMPLETED: {
    activityId: string;
    pairId: string;
    status: Extract<PairActivityType['status'], 'completed_success' | 'completed_partial' | 'failed'>;
    dataStatus: 'PARTIAL' | 'ENOUGH';
    factorEvidenceRecorded: boolean;
    resultVersion: 'activity-result-v2';
  };
  QUESTIONNAIRE_STARTED: {
    pairId: string;
    questionnaireId: string;
    sessionId: string;
  };
  QUESTIONNAIRE_ANSWERED: {
    pairId: string;
    questionnaireId: string;
    sessionId: string;
    questionId: string;
    insertedNewAnswer: boolean;
    exactPartnerAnswerDisclosed: false;
    pairSummaryStatus: 'PENDING' | 'INSUFFICIENT_DATA';
  };
  ANSWERS_BULK_SUBMITTED: {
    answersCount: number;
    audience: 'personal';
    questionnaireId: string;
    questionnaireVersion: number;
    captureMode: 'PRIVATE';
    semanticStatus: 'UNMAPPED';
  };
  USER_ONBOARDING_UPDATED: {
    updatedKeys: string[];
  };
  USER_PROFILE_UPSERTED: {
    userId: string;
    fields: string[];
  };
  MATCH_CARD_UPDATED: {
    userId: string;
    isActive: boolean;
    requirementsCount: number;
    questionsCount: number;
  };
  PAIR_CREATED: {
    pairId: string;
    members: [string, string];
    source: 'manual_create' | 'match_confirm' | 'pair_invite_accept';
  };
  PAIR_PAUSED: {
    pairId: string;
  };
  PAIR_RESUMED: {
    pairId: string;
  };
  PAIR_ENDED: {
    pairId: string;
    reason: 'MEMBER_REQUEST' | 'ACCOUNT_DELETION';
  };
  LOG_VISIT_RECORDED: {
    source: 'discord_activity';
  };
  SECURITY_AUTH_FAILED: {
    reason: string;
    status?: number;
  };
  SESSION_REVOKED: {
    scope: 'ALL';
  };
  ABUSE_RATE_LIMIT_HIT: {
    route: string;
    policy: string;
    retryAfterMs: number;
    windowMs: number;
    limit: number;
  };
  ENTITLEMENT_DENIED: {
    reason: 'feature' | 'quota';
    feature?: string | null;
    requiredPlan?: string | null;
    quota?: string | null;
    plan: string;
    limit?: number | null;
    used?: number | null;
    resetAt?: string | null;
    route: string;
  };
  ENTITLEMENT_GRANTED: {
    userId: string;
    plan: string;
    status: string;
    periodEnd?: string | null;
    source: 'dev_endpoint';
  };
  LEGACY_RELATIONSHIP_ACTIVITY_VIEWED: {
    pairId: string;
    count: number;
  };
  SUGGESTIONS_GENERATED: {
    pairId: string;
    count: number;
    source: 'pairs.suggest' | 'pairs.activities.suggest' | 'activities.next';
  };
  WEEKLY_CHECKIN_SUBMITTED: {
    pairId: string;
    weekKey: string;
    factorEngineStatus: 'MATERIALIZED';
    pairStateUpdated: boolean;
  };
  PARTNER_SIGNAL_SENT: {
    delivery: 'EXPLICIT_CONFIRMED';
    retentionClass: 'THIRTY_DAYS';
  };
  SAFETY_GATE_UPDATED: {
    pairId: string;
    retentionClass: 'UNTIL_REVOKED_OR_PAIR_END';
  };
  PRIVACY_EXPORT_CREATED: {
    exportVersion: 'owner-export-v1';
  };
  PRIVACY_DELETION_REQUESTED: {
    status: 'PENDING_CONFIRMATION';
    requestVersion: 'privacy-request-v2';
  };
  PRIVACY_DELETION_CANCELLED: {
    status: 'CANCELLED';
    requestVersion: 'privacy-request-v2';
  };
  PRIVACY_DELETION_EXECUTED: {
    status: 'EXECUTED';
    requestVersion: 'privacy-request-v2';
    deletionPolicy: 'PRIVACY_MINIMAL';
  };
};

export type AuditEventMetadata<E extends AuditEventName> = AuditEventMetadataMap[E];

type EnsureJsonValue<T extends JsonValue> = T;
type _AssertAuditMapIsJson = {
  [K in AuditEventName]: EnsureJsonValue<AuditEventMetadataMap[K]>;
};
void (0 as unknown as _AssertAuditMapIsJson);

export type EmitEventInput<E extends AuditEventName> = {
  /** Stable, non-sensitive identity for retry-safe audit delivery. */
  eventKey?: string;
  event: E;
  actor: AuditActor;
  request: AuditRequestContext;
  context?: AuditContext;
  target?: AuditTarget;
  metadata: AuditEventMetadata<E>;
  ts?: number;
};

export const RETENTION_DAYS_BY_TIER: Record<EventRetentionTier, number> = {
  short: 14,
  abuse: 30,
  long: 90,
};

export const EVENT_RETENTION_TIER: Record<AuditEventName, EventRetentionTier> = {
  MATCH_LIKE_CREATED: 'long',
  MATCH_RESPONDED: 'long',
  MATCH_ACCEPTED: 'long',
  MATCH_REJECTED: 'long',
  MATCH_CONFIRMED: 'long',
  MATCH_PREFERENCES_UPDATED: 'long',
  MATCH_USER_BLOCKED: 'long',
  MATCH_USER_UNBLOCKED: 'long',
  MATCH_CONNECTION_CONFIRMATION_CHANGED: 'long',
  ACTIVITY_ACCEPTED: 'long',
  ACTIVITY_STARTED: 'long',
  ACTIVITY_CANCELED: 'long',
  ACTIVITY_CHECKED_IN: 'long',
  ACTIVITY_COMPLETED: 'long',
  QUESTIONNAIRE_STARTED: 'long',
  QUESTIONNAIRE_ANSWERED: 'long',
  ANSWERS_BULK_SUBMITTED: 'long',
  USER_ONBOARDING_UPDATED: 'long',
  USER_PROFILE_UPSERTED: 'long',
  MATCH_CARD_UPDATED: 'long',
  PAIR_CREATED: 'long',
  PAIR_PAUSED: 'long',
  PAIR_RESUMED: 'long',
  PAIR_ENDED: 'long',
  LOG_VISIT_RECORDED: 'short',
  SECURITY_AUTH_FAILED: 'long',
  SESSION_REVOKED: 'long',
  ABUSE_RATE_LIMIT_HIT: 'abuse',
  ENTITLEMENT_DENIED: 'long',
  ENTITLEMENT_GRANTED: 'long',
  LEGACY_RELATIONSHIP_ACTIVITY_VIEWED: 'short',
  SUGGESTIONS_GENERATED: 'short',
  WEEKLY_CHECKIN_SUBMITTED: 'long',
  PARTNER_SIGNAL_SENT: 'long',
  SAFETY_GATE_UPDATED: 'long',
  PRIVACY_EXPORT_CREATED: 'long',
  PRIVACY_DELETION_REQUESTED: 'long',
  PRIVACY_DELETION_CANCELLED: 'long',
  PRIVACY_DELETION_EXECUTED: 'long',
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const getRetentionTier = (event: AuditEventName): EventRetentionTier =>
  EVENT_RETENTION_TIER[event];

export const getRetentionDays = (event: AuditEventName): number =>
  RETENTION_DAYS_BY_TIER[getRetentionTier(event)];

export const getEventExpiresAt = (event: AuditEventName, ts: number): Date =>
  new Date(ts + getRetentionDays(event) * DAY_IN_MS);
