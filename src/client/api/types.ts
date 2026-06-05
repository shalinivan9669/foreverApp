export type ApiJsonPrimitive = string | number | boolean | null;

export type ApiJsonObject = {
  [key: string]: ApiJsonValue;
};

export type ApiJsonValue = ApiJsonPrimitive | ApiJsonObject | ApiJsonValue[];

export type InsightDTO = {
  id: string;
  ownerType?: 'user' | 'pair';
  userId?: string;
  pairId?: string;
  ruleId?: string;
  axis?: QuestionnaireAxis;
  severity?: 1 | 2 | 3;
  title?: string;
  safeWording?: string;
  recommendedAction?: string;
  activityId?: string;
  questionnaireId?: string;
  pairShared?: boolean;
  cooldownUntil?: string;
  createdAt?: string;
  delta?: number;
};

export type WeeklyCheckInAnswersDTO = {
  closeness: number;
  fatigue: number;
  irritation: number;
  readiness: number;
  unresolvedTopic: boolean;
  note?: string;
};

export type WeeklyCheckInDTO = {
  id: string;
  userId: string;
  pairId?: string;
  weekKey: string;
  answers: WeeklyCheckInAnswersDTO;
  computed: {
    userStateDelta: Partial<Record<QuestionnaireAxis, number>>;
    pairRiskDelta?: number;
    generatedInsightIds: string[];
  };
  readiness: { score: number; updatedAt?: string };
  fatigue: { score: number; updatedAt?: string };
  insights: InsightDTO[];
  createdAt?: string;
  updatedAt?: string;
};

export type PairWeeklyCheckInParticipantDTO = {
  userId: string;
  submitted: boolean;
  checkInId?: string;
  readiness?: number;
  fatigue?: number;
  closeness?: number;
  irritation?: number;
  unresolvedTopic?: boolean;
  updatedAt?: string;
};

export type PairWeeklyCheckInSummaryDTO = {
  pairId: string;
  weekKey: string;
  currentUser: PairWeeklyCheckInParticipantDTO;
  peer: PairWeeklyCheckInParticipantDTO & {
    username?: string;
    avatar?: string;
    avatarUrl?: string | null;
  };
  pair: {
    submittedCount: number;
    bothSubmitted: boolean;
    readiness?: number;
    fatigue?: number;
    closeness?: number;
    irritation?: number;
    unresolvedTopicCount: number;
    hasDivergence: boolean;
    divergence?: {
      readiness?: number;
      fatigue?: number;
      closeness?: number;
      irritation?: number;
    };
    status: 'missing' | 'partial' | 'complete' | 'divergent';
  };
};

export type PublicUserDTO = {
  id: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
};

export type CurrentUserDTO = PublicUserDTO & {
  profile?: {
    onboarding?: {
      seeking?: boolean;
      inRelationship?: boolean;
      valuedQualities?: string[];
    };
    matchCard?: MatchCardDTO;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type UserProfileUpsertRequest = {
  username?: string;
  avatar?: string | null;
  personal?: {
    gender?: 'male' | 'female';
    age?: number;
    city?: string;
    relationshipStatus?: 'seeking' | 'in_relationship';
  };
  preferences?: Record<string, ApiJsonValue>;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
};

export type UserOnboardingSeekingPatch = {
  seeking: {
    valuedQualities: string[];
    relationshipPriority:
      | 'emotional_intimacy'
      | 'shared_interests'
      | 'financial_stability'
      | 'other';
    minExperience: 'none' | '1-2_years' | 'more_2_years';
    dealBreakers: string;
    firstDateSetting: 'cafe' | 'walk' | 'online' | 'other';
    weeklyTimeCommitment: '<5h' | '5-10h' | '>10h';
  };
};

export type UserOnboardingInRelationshipPatch = {
  inRelationship: {
    satisfactionRating: number;
    communicationFrequency: 'daily' | 'weekly' | 'less';
    jointBudgeting: 'shared' | 'separate';
    conflictResolutionStyle: 'immediate' | 'cool_off' | 'avoid';
    sharedActivitiesPerMonth: number;
    mainGrowthArea:
      | 'communication'
      | 'finance'
      | 'intimacy'
      | 'domestic'
      | 'emotional_support';
  };
};

export type UserOnboardingPatchRequest =
  | UserOnboardingSeekingPatch
  | UserOnboardingInRelationshipPatch;

export type PairStatusDTO =
  | { hasActive: false }
  | {
      hasActive: true;
      pairId: string;
      pairKey: string;
      peer: PublicUserDTO;
    };

export type PairState = 'active' | 'paused' | 'ended';

export type PairDTO = {
  id: string;
  members: [string, string];
  key: string;
  status: PairState;
  createdAt?: string;
  updatedAt?: string;
  progress?: {
    streak: number;
    completed: number;
  };
  readiness?: {
    score: number;
  };
  fatigue?: {
    score: number;
  };
};

export type PairMeDTO = {
  pair: PairDTO | null;
  hasActive: boolean;
  hasAny: boolean;
  status: PairState | null;
};

export type PairPassportDTO = {
  strongSides: { axis: string; facets: string[] }[];
  riskZones: { axis: string; facets: string[]; severity: 1 | 2 | 3 }[];
  complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
  levelDelta: { axis: string; delta: number }[];
  lastDiagnosticsAt?: string;
};

export type PairDashboardDiagnosticsDTO = {
  overall?: {
    score: number;
    confidence: number;
    status: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
  };
  strongSides: { axis: string; facets: string[] }[];
  riskZones: { axis: string; facets: string[]; severity: 1 | 2 | 3 }[];
  complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
  levelDelta: { axis: string; delta: number }[];
  lastDiagnosticsAt?: string;
};

export type PairNextStepKind =
  | 'complete_weekly_checkin'
  | 'wait_or_invite_peer_checkin'
  | 'review_weekly_divergence'
  | 'complete_current_activity'
  | 'run_pair_diagnostics'
  | 'review_risk_zone'
  | 'suggest_activity'
  | 'none';

export type PairNextStepDTO = {
  kind: PairNextStepKind;
  title: string;
  description: string;
  href?: string;
  ctaLabel?: string;
  axis?: string;
  severity?: 1 | 2 | 3;
};

export type PairAxisDiagnosticDTO = {
  axis: QuestionnaireAxis;
  status: 'insufficient_data' | 'strong' | 'risk' | 'complement' | 'neutral';
  a: number;
  b: number;
  delta: number;
  confidence: number;
  safeWording: string;
};

export type PairAnswerSignalDTO = {
  axis: QuestionnaireAxis;
  a: number;
  b: number;
  confidenceA: number;
  confidenceB: number;
  pairConfidence: number;
  delta: number;
  status: PairAxisDiagnosticDTO['status'];
  reasons: string[];
  recommendedAction?: string;
};

export type PairDiagnosticsDTO = {
  pairId: string;
  passport: PairPassportDTO;
  axes?: PairAxisDiagnosticDTO[];
  pairAnswerSignals?: PairAnswerSignalDTO[];
  overall?: {
    score: number;
    confidence: number;
    status: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
  };
  fatigue?: { score: number; updatedAt?: string };
  readiness?: { score: number; updatedAt?: string };
  generatedInsightIds?: string[];
};

export type MatchFeedCandidateDTO = {
  id: string;
  username: string;
  avatar: string;
  score: number;
};

export type MatchCardDTO = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  isActive: boolean;
  updatedAt?: string;
};

export type SaveMatchCardRequest = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  isActive?: boolean;
};

export type CandidateMatchCardDTO = {
  requirements: [string, string, string];
  questions: [string, string];
};

export type MatchDirection = 'incoming' | 'outgoing';

export type MatchStatus =
  | 'sent'
  | 'viewed'
  | 'awaiting_initiator'
  | 'mutual_ready'
  | 'paired'
  | 'rejected'
  | 'expired';

export type MatchInboxRowDTO = {
  id: string;
  direction: MatchDirection;
  status: MatchStatus;
  matchScore: number;
  updatedAt?: string;
  peer: PublicUserDTO;
  canCreatePair: boolean;
};

export type MatchCardSnapshotDTO = {
  requirements: [string, string, string];
  questions: [string, string];
  updatedAt?: string;
};

export type MatchLikeDTO = {
  id: string;
  status: MatchStatus;
  matchScore: number;
  updatedAt?: string;
  from: PublicUserDTO;
  to: PublicUserDTO;
  agreements?: [boolean, boolean, boolean];
  answers?: [string, string];
  cardSnapshot?: MatchCardSnapshotDTO;
  fromCardSnapshot?: MatchCardSnapshotDTO;
  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: MatchCardSnapshotDTO;
    at: string;
  };
  decisions: {
    initiator: { accepted: boolean; at: string } | null;
    recipient: { accepted: boolean; at: string } | null;
  };
};

export type MatchLikeCreateRequest = {
  toId: string;
  agreements: [true, true, true];
  answers: [string, string];
};

export type MatchLikeCreateResponse = {
  id: string;
  matchScore: number;
};

export type MatchRespondRequest = {
  likeId: string;
  agreements: [true, true, true];
  answers: [string, string];
};

export type MatchRespondResponse = {
  status: MatchStatus;
};

export type MatchDecisionRequest = {
  likeId: string;
};

export type MatchConfirmResponse = {
  pairId: string;
  members: [string, string];
};

export type MutationAckDTO = Record<string, never> | { already?: true };

export type ActivityStatus =
  | 'suggested'
  | 'offered'
  | 'accepted'
  | 'in_progress'
  | 'awaiting_checkin'
  | 'completed_success'
  | 'completed_partial'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type OfferSource = 'growth' | 'recovery' | 'date';

export type OfferReasonMeta = {
  topRiskAxis: string | null;
  topRiskSeverity: 1 | 2 | 3 | null;
  difficultyComputed: 1 | 2 | 3 | 4 | 5 | null;
  fatigueScore: number | null;
  eventKey: string | null;
};

export type ActivityBucket = 'current' | 'suggested' | 'history';

export type ActivityI18nText = {
  ru: string;
  en: string;
};

export type ActivityCheckInDTO = {
  id: string;
  scale: 'likert5' | 'bool';
  map: number[];
  text: ActivityI18nText;
  weight?: number;
};

export type ActivityResultSummaryDTO = {
  submittedBy: Array<'A' | 'B'>;
  submittedCount: number;
  bothSubmitted: boolean;
  successScore: number;
  status: 'completed_success' | 'completed_partial' | 'failed';
  usefulnessAvg?: number;
  comfortAvg?: number;
  tensionAvg?: number;
  wantsSimilarRatio?: number;
  effectApplied: boolean;
  effect: {
    fatigueDelta: number;
    readinessDelta: number;
    axisDeltas: Array<{
      axis: QuestionnaireAxis;
      delta: number;
    }>;
  };
  effectExplanation: {
    ru: string;
    en?: string;
  };
  completedAt?: string;
  resultVersion: 'activity-result-v1';
};

export type PairActivityDTO = {
  id: string;
  _id?: string;
  pairId: string;
  title: ActivityI18nText;
  description?: ActivityI18nText;
  why: ActivityI18nText;
  axis: string[];
  archetype: string;
  intent: 'improve' | 'celebrate';
  mode: 'together' | 'soloA' | 'soloB';
  sync: 'sync' | 'async';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  dueAt?: string;
  cooldownDays?: number;
  requiresConsent?: boolean;
  status: ActivityStatus;
  checkIns: ActivityCheckInDTO[];
  successScore?: number;
  resultSummary?: ActivityResultSummaryDTO;
  offerSource?: OfferSource;
  offerReason?: OfferReasonMeta;
  legacy?: boolean;
  legacySource?: 'relationship_activity';
  createdAt?: string;
  updatedAt?: string;
  eventSource?: PairActivityEventSourceDTO;
};

export type PairActivityEventSourceDTO = {
  trigger: 'pair_event';
  eventId?: string;
  eventType?: string;
  eventCategory?: string;
  eventDate?: string;
};

export type PairActivitySuggestionPlanDTO = {
  pairId: string;
  status:
    | 'blocked_by_current_activity'
    | 'blocked_by_pair_state'
    | 'needs_diagnostics'
    | 'needs_weekly_checkin'
    | 'ready';
  primaryReason:
    | 'current_activity'
    | 'pair_paused'
    | 'pair_ended'
    | 'insufficient_diagnostics'
    | 'missing_weekly_checkin'
    | 'high_fatigue'
    | 'weekly_divergence'
    | 'risk_zone'
    | 'low_closeness'
    | 'maintenance';
  axis?: QuestionnaireAxis;
  severity?: 1 | 2 | 3;
  fatigue?: number;
  readiness?: number;
  closeness?: number;
  irritation?: number;
  preferredDifficulty: 1 | 2 | 3 | 4 | 5;
  maxIntensity: 1 | 2 | 3;
  preferredArchetypes: string[];
  requiredMode?: 'together' | 'soloA' | 'soloB';
  requiredSync?: 'sync' | 'async';
  explanation: {
    ru: string;
    en?: string;
  };
  source: 'diagnostics' | 'weekly_checkin' | 'dashboard' | 'manual';
  sourceMeta: {
    trigger?: string;
    weekKey?: string;
    axis?: string;
    severity?: 1 | 2 | 3;
    divergenceMetric?: 'readiness' | 'fatigue' | 'closeness' | 'irritation';
    decisionVersion: 'activity-decision-v1';
    eventType?: 'first_month' | 'anniversary' | 'march_8' | 'valentines_day';
    eventDate?: string;
  };
  recentActivitySignals: {
    lastCompletedStatus?: 'completed_success' | 'completed_partial' | 'failed';
    lastAxis?: QuestionnaireAxis[];
    lastArchetype?: string;
    lowComfortRecently: boolean;
    wantsSimilarRecently: boolean;
  };
};

export type PairActivitySuggestionResponse = {
  plan: PairActivitySuggestionPlanDTO;
  currentActivity: PairActivityDTO | null;
  offers: PairActivityDTO[];
  createdCount: number;
  skippedReason?: string;
};

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

export type PairEventDTO = {
  id: string;
  pairId: string;
  category: PairEventCategory;
  type: PairEventType;
  title: ActivityI18nText;
  description: ActivityI18nText;
  why: ActivityI18nText;
  eventDate?: string;
  windowStart: string;
  windowEnd: string;
  status: PairEventStatus;
  priority: 1 | 2 | 3;
  severity?: 1 | 2 | 3;
  axis?: QuestionnaireAxis[];
  canAccept: boolean;
  canDecline: boolean;
  canSnooze: boolean;
  generatedActivityIds: string[];
  acceptedAt?: string;
  declinedAt?: string;
  snoozedUntil?: string;
  completedAt?: string;
  expiresAt?: string;
};

export type PairEventListResponse = {
  events: PairEventDTO[];
};

export type PairEventAcceptResponse = {
  event: PairEventDTO;
  activities: PairActivityDTO[];
};

export type PairEventMutationResponse = {
  event: PairEventDTO;
};

export type ActivityOfferDTO = {
  id: string;
  templateId?: string;
  title: ActivityI18nText;
  axis: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  stepsPreview?: {
    ru: string[];
    en: string[];
  };
  reward: {
    readinessDelta: number;
    fatigueDelta: number;
  };
  expiresAt?: string;
  source: OfferSource;
  reason?: OfferReasonMeta;
};

export type ActivityCheckInRequest = {
  answers: Array<{
    checkInId: string;
    ui: number;
  }>;
};

export type ActivityCheckInResponse = {
  success: number;
  submittedCount: number;
  bothSubmitted: boolean;
};

export type ActivityCompleteResponse = {
  success: number;
  status: 'completed_success' | 'completed_partial' | 'failed';
  resultSummary: ActivityResultSummaryDTO;
};

export type NextActivityResponse = {
  activityId: string;
  offer?: ActivityOfferDTO;
};

export type CreateActivityFromTemplateRequest = {
  templateId: string;
};

export type CreateActivityFromTemplateResponse = {
  id: string;
  offer?: ActivityOfferDTO;
};

export type QuestionnaireAxis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

export type QuestionnaireAudience = 'pair' | 'solo' | 'universal';
export type QuestionnaireScope = 'personal' | 'couple';

export type QuestionnaireStatus = 'new' | 'in_progress' | 'completed' | 'required' | 'locked';

export type QuestionnaireCta = 'start' | 'continue' | 'result' | 'locked';

export type QuestionnaireCardDTO = {
  id: string;
  vector: QuestionnaireAxis;
  scope: QuestionnaireScope;
  audience: QuestionnaireAudience;
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  rewardCoins?: number;
  insightsCount?: number;
  status: QuestionnaireStatus;
  progressPct?: number;
  lockReason?: string;
  cta: QuestionnaireCta;
  isStarter?: boolean;
  pairId?: string | null;
};

export type QuestionnaireQuestionDTO = {
  id: string;
  _id?: string;
  axis: QuestionnaireAxis;
  facet: string;
  polarity: '+' | '-' | 'neutral';
  scale: 'likert5' | 'bool';
  map: number[];
  weight: number;
  text: Record<string, string>;
  polarityNumeric?: 1 | -1;
  reverseScoring?: boolean;
  confidenceWeight?: number;
  scope?: 'solo' | 'pair' | 'pair_or_solo';
  audience?: 'personal' | 'couple' | 'weekly';
  sensitivity?: 'low' | 'medium' | 'high';
  locale?: 'ru' | 'en';
  explanation?: string;
  scoringVersion?: string;
};

export type QuestionDTO = QuestionnaireQuestionDTO;

export type QuestionnaireDTO = {
  id: string;
  _id?: string;
  scope: QuestionnaireScope;
  title: Record<string, string>;
  description?: Record<string, string>;
  meta?: Record<string, unknown>;
  target: {
    type: 'individual' | 'couple';
    gender: 'unisex' | 'male' | 'female';
    vector: '+' | '-' | 'neutral';
  };
  axis: QuestionnaireAxis;
  difficulty: 1 | 2 | 3;
  tags: string[];
  version: number;
  randomize: boolean;
  questions: QuestionnaireQuestionDTO[];
};

export type ProfilePersonalDTO = {
  gender: 'male' | 'female' | null;
  age: number | null;
  city: string;
  relationshipStatus: 'seeking' | 'in_relationship' | null;
};

export type ProfileModeDTO = {
  kind: 'solo' | 'paired';
  status: 'solo_new' | 'solo_with_history' | 'paired_active' | 'paired_paused';
  label: string;
  description: string;
};

export type ProfileCurrentPairDTO = null | {
  id: string;
  status: 'active' | 'paused';
  since: string;
  daysTogether?: number;
};

export type RelationshipContextDTO = {
  currentPair: ProfileCurrentPairDTO;
  hasPairHistory: boolean;
};

export type ProfileCompletionLevelDTO = 'empty' | 'basic' | 'good' | 'strong';

export type ProfileCompletionDTO = {
  score: number;
  level: ProfileCompletionLevelDTO;
  missing: Array<{
    key: string;
    label: string;
    href: string;
  }>;
  sections: {
    account: {
      score: number;
      completed: boolean;
      missing: string[];
    };
    matchCard: {
      score: number;
      completed: boolean;
      isActive: boolean;
      missing: string[];
    };
    preferences: {
      score: number;
      completed: boolean;
      missing: string[];
    };
    passport: {
      score: number;
      completed: boolean;
      missing: string[];
    };
    pairContext?: {
      score: number;
      completed: boolean;
      missing: string[];
    };
  };
};

export type ProfileNextStepDTO = {
  kind:
    | 'complete_account'
    | 'create_match_card'
    | 'improve_match_card'
    | 'open_search'
    | 'open_pair'
    | 'resume_pair'
    | 'weekly_checkin'
    | 'questionnaire'
    | 'activity_feedback'
    | 'open_activity';
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  priority: 1 | 2 | 3;
};

export type PairedProfileStateDTO = null | {
  pairId: string;
  pairStatus: 'active' | 'paused';
  myWeeklyCheckIn: {
    weekKey: string;
    submitted: boolean;
    submittedAt?: string;
    readiness?: number;
    fatigue?: number;
    closeness?: number;
    irritation?: number;
  };
  pairWeeklyCheckIn: {
    peerSubmitted: boolean;
    bothSubmitted: boolean;
    hasDivergence: boolean;
    status: 'missing' | 'partial' | 'complete' | 'divergent';
  };
  myActivityState: {
    hasCurrentActivity: boolean;
    currentActivityId?: string;
    currentActivityTitle?: string;
    status?: string;
    awaitsMyFeedback: boolean;
    awaitsPartnerFeedback: boolean;
  };
  contribution: {
    score: number;
    level: 'low' | 'stable' | 'strong';
    completedThisWeek: string[];
    pendingFromMe: string[];
    message: string;
  };
  resourceMessage: {
    tone: 'stable' | 'tired' | 'tense' | 'low_data';
    title: string;
    description: string;
  };
};

export type ProfileSummaryDTO = {
  user: {
    id: string;
    name?: string;
    handle: string;
    avatar: string | null;
    avatarUrl?: string | null;
    joinedAt?: string;
    status: 'solo:new' | 'solo:history' | 'paired';
    lastActiveAt?: string;
    personal: ProfilePersonalDTO;
    featureFlags: Record<string, boolean>;
  };
  currentPair: ProfileCurrentPairDTO;
  relationshipContext: RelationshipContextDTO;
  profileMode: ProfileModeDTO;
  profileCompletion: ProfileCompletionDTO;
  pairedProfileState: PairedProfileStateDTO;
  nextStep: ProfileNextStepDTO;
  metrics: {
    streak: {
      individual: number;
    };
    completed: {
      individual: number;
    };
  };
  readiness: {
    score: number;
    updatedAt?: string;
  };
  fatigue: {
    score: number;
    updatedAt?: string;
  };
  passport: {
    levelsByAxis: Record<QuestionnaireAxis, number>;
    positivesByAxis: Record<QuestionnaireAxis, string[]>;
    negativesByAxis: Record<QuestionnaireAxis, string[]>;
    strongSides: string[];
    growthAreas: string[];
    values: string[];
    boundaries: string[];
    updatedAt?: string;
  };
  activity: {
    current: {
      id: string;
      title?: string;
      progress?: number;
    } | null;
    suggested: Array<{
      id: string;
      title?: string;
    }>;
    historyCount: number;
  };
  matching: {
    inboxCount: number;
    outboxCount: number;
    filters: {
      age: [number, number];
      radiusKm: number;
      valuedQualities: string[];
      excludeTags: string[];
    };
  };
  insights: InsightDTO[];
  featureFlags: Record<string, boolean>;
  entitlements: {
    plan: 'FREE' | 'SOLO' | 'COUPLE';
    status: string;
    periodEnd: string | null;
  };
};

export type ExchangeCodeRequest = {
  code: string;
  redirect_uri: string;
};

export type ExchangeCodeResponse = {
  access_token: string;
  user: {
    id: string;
    username: string;
    avatar: string;
  };
};

export type EntitlementsGrantRequest = {
  userId: string;
  plan: 'FREE' | 'SOLO' | 'COUPLE';
  days?: number;
  status?: 'active' | 'grace' | 'canceled' | 'expired';
};

export type EntitlementsGrantResponse = {
  id: string;
  userId: string;
  plan: 'FREE' | 'SOLO' | 'COUPLE';
  status: string;
  periodEnd?: string;
  createdAt?: string;
};
