import type { JsonValue } from '@/lib/api/response';
import type { LikeType } from '@/models/Like';
import type { PairActivityType } from '@/models/PairActivity';
import type { QuestionType } from '@/models/Question';

type AuditAxis = QuestionType['axis'];

export const AUDIT_EVENT_NAMES = [
  'MATCH_LIKE_CREATED',
  'MATCH_RESPONDED',
  'MATCH_ACCEPTED',
  'MATCH_REJECTED',
  'MATCH_CONFIRMED',
  'ACTIVITY_ACCEPTED',
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
  'LOG_VISIT_RECORDED',
  'SECURITY_AUTH_FAILED',
  'ABUSE_RATE_LIMIT_HIT',
  'ENTITLEMENT_DENIED',
  'ENTITLEMENT_GRANTED',
  'LEGACY_RELATIONSHIP_ACTIVITY_VIEWED',
  'SUGGESTIONS_GENERATED',
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
    matchScore: number;
  };
  MATCH_RESPONDED: {
    likeId: string;
    status: Extract<LikeType['status'], 'awaiting_initiator'>;
  };
  MATCH_ACCEPTED: {
    likeId: string;
    status: Extract<LikeType['status'], 'mutual_ready'>;
  };
  MATCH_REJECTED: {
    likeId: string;
    status: Extract<LikeType['status'], 'rejected'>;
    already?: true;
  };
  MATCH_CONFIRMED: {
    likeId: string;
    pairId: string;
    members: [string, string];
  };
  ACTIVITY_ACCEPTED: {
    activityId: string;
    status: Extract<PairActivityType['status'], 'accepted'>;
  };
  ACTIVITY_CANCELED: {
    activityId: string;
    status: Extract<PairActivityType['status'], 'cancelled'>;
  };
  ACTIVITY_CHECKED_IN: {
    activityId: string;
    answersCount: number;
    success: number;
    status: Extract<PairActivityType['status'], 'awaiting_checkin'>;
  };
  ACTIVITY_COMPLETED: {
    activityId: string;
    success: number;
    status: Extract<PairActivityType['status'], 'completed_success' | 'completed_partial' | 'failed'>;
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
    ui: number;
    answeredCount: number;
    matchedCount: number;
    confidence: number;
    sumWeightsTotal: number;
    deltaMagnitude: number;
    appliedStepByAxis: Partial<Record<AuditAxis, number>>;
    clampedAxes: AuditAxis[];
  };
  ANSWERS_BULK_SUBMITTED: {
    answersCount: number;
    answeredCount: number;
    matchedCount: number;
    audience: 'personal' | 'couple';
    questionnaireId?: string;
    applied: boolean;
    reason: 'APPLIED' | 'COOLDOWN';
    cooldownDays?: number;
    scoringVersion: 'v2';
    confidence: number;
    sumWeightsTotal: number;
    deltaMagnitude: number;
    appliedStepByAxis: Partial<Record<AuditAxis, number>>;
    clampedAxes: AuditAxis[];
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
    source: 'manual_create' | 'match_confirm';
  };
  PAIR_PAUSED: {
    pairId: string;
  };
  PAIR_RESUMED: {
    pairId: string;
  };
  LOG_VISIT_RECORDED: {
    source: 'discord_activity';
  };
  SECURITY_AUTH_FAILED: {
    reason: string;
    status?: number;
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
};

export type AuditEventMetadata<E extends AuditEventName> = AuditEventMetadataMap[E];

type EnsureJsonValue<T extends JsonValue> = T;
type _AssertAuditMapIsJson = {
  [K in AuditEventName]: EnsureJsonValue<AuditEventMetadataMap[K]>;
};
void (0 as unknown as _AssertAuditMapIsJson);

export type EmitEventInput<E extends AuditEventName> = {
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
  ACTIVITY_ACCEPTED: 'long',
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
  LOG_VISIT_RECORDED: 'short',
  SECURITY_AUTH_FAILED: 'long',
  ABUSE_RATE_LIMIT_HIT: 'abuse',
  ENTITLEMENT_DENIED: 'long',
  ENTITLEMENT_GRANTED: 'long',
  LEGACY_RELATIONSHIP_ACTIVITY_VIEWED: 'short',
  SUGGESTIONS_GENERATED: 'short',
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const getRetentionTier = (event: AuditEventName): EventRetentionTier =>
  EVENT_RETENTION_TIER[event];

export const getRetentionDays = (event: AuditEventName): number =>
  RETENTION_DAYS_BY_TIER[getRetentionTier(event)];

export const getEventExpiresAt = (event: AuditEventName, ts: number): Date =>
  new Date(ts + getRetentionDays(event) * DAY_IN_MS);
