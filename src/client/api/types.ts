export type ApiJsonPrimitive = string | number | boolean | null;

export type ApiJsonObject = {
  [key: string]: ApiJsonValue;
};

export type ApiJsonValue = ApiJsonPrimitive | ApiJsonObject | ApiJsonValue[];

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
  pairId: string;
  weekKey: string;
  answers: WeeklyCheckInAnswersDTO;
  createdAt?: string;
  updatedAt?: string;
};

export type PairWeeklyCheckInSummaryDTO = {
  pairId: string;
  weekKey: string;
  currentUser: { submitted: boolean };
  peer: {
    submitted: boolean;
    username?: string;
    avatar?: string;
    avatarUrl?: string | null;
  };
  pair: {
    bothSubmitted: boolean;
    dataStatus: 'NOT_READY' | 'PARTIAL' | 'ENOUGH' | 'INSUFFICIENT';
    reasonCodes: Array<
      | 'WAITING_FOR_RESPONSES'
      | 'WAITING_FOR_PEER'
      | 'PAIR_SIGNALS_READY'
      | 'PAIR_DATA_INSUFFICIENT'
    >;
    signals: Array<{
      key: 'connection' | 'tension' | 'recovery' | 'resource';
      status: 'LOW' | 'STEADY' | 'HIGH' | 'MIXED';
      dataStatus: 'ENOUGH';
      reasonCode:
        | 'PAIR_LEVEL_LOW'
        | 'PAIR_LEVEL_STEADY'
        | 'PAIR_LEVEL_HIGH'
        | 'DIFFERENT_EXPERIENCE';
      nextStepHint:
        | 'CHECK_IN_TOGETHER'
        | 'CHOOSE_LOW_EFFORT'
        | 'MAKE_ROOM_FOR_RECOVERY'
        | 'KEEP_CURRENT_RHYTHM';
    }>;
  };
};

export type PublicUserDTO = {
  id: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
};

export type CurrentUserDTO = PublicUserDTO & {
  publicId?: string;
  entryCohort?: 'SOLO' | 'EXISTING_PARTNER';
  entryCompletedAt?: string;
  locationSource?: 'CITY_CATALOG' | 'DEVICE' | 'NONE';
  personal?: {
    gender: 'male' | 'female';
    age: number;
    city: string;
    relationshipStatus: 'seeking' | 'in_relationship';
  };
  location?: { type: 'Point'; coordinates: [number, number] };
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

export type RelationshipLensType =
  | 'feminine'
  | 'masculine'
  | 'balanced'
  | 'custom';

export type RelationshipLensSource =
  | 'gender_default'
  | 'user_setting';

export type PersonalTodayMode =
  | 'low_data'
  | 'stable'
  | 'low_resource'
  | 'closeness'
  | 'conflict_risk'
  | 'repair'
  | 'growth';

export type PersonalTodayDataStatus =
  | 'AVAILABLE'
  | 'MISSING'
  | 'INSUFFICIENT';

export type PersonalTodayDTO = {
  user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    gender: 'male' | 'female' | null;
  };

  date: {
    dateKey: string;
    label: string;
    freshness: 'today' | 'stale' | 'weekly_fallback' | 'profile_fallback' | 'low_data';
  };

  lens: {
    type: RelationshipLensType;
    source: RelationshipLensSource;
    canChange: boolean;
  };

  privacy: {
    mode: 'private';
    label: string;
    explanation: string;
  };

  pairContext: {
    hasPair: boolean;
    pairId?: string;
    status?: 'active' | 'paused';
    label: string;
  };

  dataStatus: {
    overall: PersonalTodayDataStatus;
    metricGroups: {
      resource: PersonalTodayDataStatus;
      connection: PersonalTodayDataStatus;
    };
  };

  hero: {
    mode: PersonalTodayMode;
    title: string;
    subtitle: string;
    rings: {
      resource?: number;
      closeness?: number;
      tension?: number;
    };
    hints: string[];
  };

  quickCards: Array<{
    key:
      | 'state'
      | 'need'
      | 'influence'
      | 'resource'
      | 'contribution'
      | 'risk';
    title: string;
    body: string;
    icon: string;
  }>;

  partnerSignal: {
    available: boolean;
    title: string;
    text: string;
    visibility: 'private_draft' | 'sent' | 'disabled';
    primaryCta: string;
    secondaryCta: string;
    sentAt?: string;
  };

  incomingPartnerSignal?: {
    id: string;
    from: {
      id: string;
      username: string;
      avatarUrl?: string | null;
    };
    text: string;
    tone: 'support' | 'space' | 'closeness' | 'repair' | 'low_resource' | 'neutral';
    createdAt?: string;
  };

  softOption: {
    title: string;
    intro: string;
    phrase: string;
    alternatives: string[];
    primaryCta: string;
    secondaryCta: string;
  } | null;

  todayMap: Array<{
    key:
      | 'resource'
      | 'closeness'
      | 'stress'
      | 'support'
      | 'conversation'
      | 'irritation'
      | 'initiative'
      | 'repair';
    label: string;
    value: number;
  }>;

  privateJournal: {
    hasEntry: boolean;
    text?: string;
    placeholder: string;
    maxLength: number;
  };

  checkIn: {
    id?: string;
    submittedToday: boolean;
    editable: boolean;
  };
};

export type PersonalDailyCheckInRequest = {
  dateKey?: string;
  timezoneOffsetMin?: number;
  answers: {
    mood:
      | 'calm'
      | 'warm'
      | 'tired'
      | 'anxious'
      | 'sad'
      | 'irritated'
      | 'closed'
      | 'open';
    energy: number;
    stress: number;
    closenessNeed: number;
    spaceNeed: number;
    supportNeed: number;
    conflictSensitivity: number;
    conversationReadiness: number;
  };
  context?: {
    sleep?: 'good' | 'medium' | 'bad';
    workload?: 'low' | 'medium' | 'high';
    body?: {
      enabled: boolean;
      type?: 'cycle' | 'pain' | 'fatigue' | 'health' | 'other';
      note?: string;
      visibility: 'private';
    };
    customTags?: string[];
  };
  privateJournal?: {
    text?: string;
  };
  share?: {
    partnerSignal?: {
      enabled: boolean;
      text?: string;
    };
    pairMap?: {
      enabled: boolean;
    };
  };
};

export type RelationshipLensPatchRequest = {
  defaultLens?: RelationshipLensType;
  preferredSupportStyle?:
    | 'listen'
    | 'solve'
    | 'hug'
    | 'space'
    | 'practical_help'
    | 'soft_presence';
  conflictPattern?:
    | 'withdraw'
    | 'argue'
    | 'freeze'
    | 'explain'
    | 'please'
    | 'avoid';
  privacyDefaults?: {
    dailyStatePrivate?: boolean;
    journalPrivate?: boolean;
    bodyContextPrivate?: boolean;
    partnerSignalsEnabled?: boolean;
    pairMapContributionEnabled?: boolean;
  };
};

export type PartnerSignalSendRequest = {
  text: string;
};

export type PartnerSignalSendResponse = {
  id: string;
  status: 'sent';
  sentAt: string;
};

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
};

export type PairMeDTO = {
  pair: PairDTO | null;
  hasActive: boolean;
  hasAny: boolean;
  status: PairState | null;
};

export type PairNextStepKind =
  | 'complete_weekly_checkin'
  | 'wait_or_invite_peer_checkin'
  | 'review_weekly_divergence'
  | 'complete_current_activity'
  | 'suggest_activity'
  | 'none';

export type PairNextStepDTO = {
  kind: PairNextStepKind;
  title: string;
  description: string;
  href?: string;
  ctaLabel?: string;
};

export type MatchFeedCandidateDTO = {
  id: string;
  username: string;
  avatar: string;
  score: 0;
  scoreAvailable: false;
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
  matchScore: 0;
  matchScoreAvailable: false;
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
  matchScore: 0;
  matchScoreAvailable: false;
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
  matchScore: 0;
  matchScoreAvailable: false;
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
  | 'awaiting_feedback'
  | 'awaiting_checkin'
  | 'completed_success'
  | 'completed_partial'
  | 'failed'
  | 'cancelled'
  | 'expired';

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
  dataStatus: 'PARTIAL' | 'ENOUGH';
  bothSubmitted: boolean;
  status: 'completed_success' | 'completed_partial' | 'failed';
  completedAt?: string;
  resultVersion: 'activity-result-v2';
  evidenceStatus: 'RECORDED' | 'PENDING';
};

export type ActivityActionDefinitionRef = {
  key: string;
  actionVersion: number;
  registryVersion: number;
};

export type PairActivityDTO = {
  id: string;
  _id?: string;
  pairId: string;
  title: ActivityI18nText;
  description?: ActivityI18nText;
  why: ActivityI18nText;
  actionDefinition?: ActivityActionDefinitionRef;
  targetFactorKeys: string[];
  archetype: string;
  intent: 'improve' | 'celebrate';
  mode: 'together' | 'solo';
  sync: 'sync' | 'async';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  dueAt?: string;
  startedAt?: string;
  cooldownDays?: number;
  requiresConsent?: boolean;
  status: ActivityStatus;
  checkIns: ActivityCheckInDTO[];
  /** @deprecated Pair-visible activity responses never expose exact feedback scores. */
  successScore?: never;
  resultSummary?: ActivityResultSummaryDTO;
  /** Whether the current session actor submitted feedback; never the peer's answers. */
  feedbackSubmitted?: boolean;
  legacy?: boolean;
  legacySource?: 'relationship_activity';
  createdAt?: string;
  updatedAt?: string;
  eventSource?: PairActivityEventSourceDTO;
};

export type PairActivityEventSourceDTO = {
  trigger: 'pair_event';
  /** @deprecated Internal event evidence is not emitted by pair-visible APIs. */
  eventId?: never;
  /** @deprecated Internal event evidence is not emitted by pair-visible APIs. */
  eventType?: never;
  /** @deprecated Internal event evidence is not emitted by pair-visible APIs. */
  eventCategory?: never;
  /** @deprecated Internal event evidence is not emitted by pair-visible APIs. */
  eventDate?: never;
};

export type PairActivitySuggestionPlanDTO = {
  status:
    | 'blocked_by_current_activity'
    | 'blocked_by_pair_state'
    | 'insufficient_factor_data'
    | 'ready';
  reasonCode:
    | 'CURRENT_ACTIVITY'
    | 'PAIR_UNAVAILABLE'
    | 'FACTOR_SUPPORT';
  explanation: {
    ru: string;
    en: string;
  };
  decisionVersion: 'activity-decision-v2';
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
  | 'behavioral_event';

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
  | 'weekly_overload_recovery'
  | 'weekly_tension_support'
  | 'weekly_success_celebration';

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
  canAccept: boolean;
  canDecline: boolean;
  canSnooze: boolean;
  hasGeneratedActivity: boolean;
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
  title: ActivityI18nText;
  actionDefinition: ActivityActionDefinitionRef;
  targetFactorKeys: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  stepsPreview?: {
    ru: string[];
    en: string[];
  };
  expiresAt?: string;
  reasonCode: 'CURRENT_CYCLE_SUPPORT';
  explanation: ActivityI18nText;
};

export type ActivityCheckInRequest = {
  answers: Array<{
    checkInId: string;
    ui: number;
  }>;
  allowPairModelUse?: boolean;
};

export type ActivityCheckInResponse = ActivityResultSummaryDTO;

export type ActivityCompleteResponse = {
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

export type QuestionnaireAudience = 'pair' | 'solo' | 'universal';
export type QuestionnaireScope = 'personal' | 'couple';

export type QuestionnaireStatus = 'new' | 'in_progress' | 'completed' | 'required' | 'locked';

export type QuestionnaireCta = 'start' | 'continue' | 'result' | 'locked';

export type QuestionnaireCardDTO = {
  id: string;
  domainKey: string;
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
  status: QuestionnaireStatus;
  progressPct?: number;
  lockReason?: string;
  cta: QuestionnaireCta;
  isStarter?: boolean;
  pairId?: string | null;
};

export type QuestionnaireQuestionDTO = {
  id: string;
  domainKey: string;
  topicKey: string;
  scale: 'likert5' | 'bool';
  optionCount: number;
  text: Record<string, string>;
  scope?: 'solo' | 'pair' | 'pair_or_solo';
  audience?: 'personal' | 'couple' | 'weekly';
  sensitivity?: 'low' | 'medium' | 'high';
  locale?: 'ru' | 'en';
  explanation?: string;
  contentRevision: string;
};

export type QuestionDTO = QuestionnaireQuestionDTO;

export type QuestionnaireDTO = {
  id: string;
  contentModel: 'SEMANTIC_V1';
  scope: QuestionnaireScope;
  title: Record<string, string>;
  description?: Record<string, string>;
  target: {
    type: 'individual' | 'couple';
    gender: 'unisex' | 'male' | 'female';
  };
  domainKey: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
  version: number;
  randomize: boolean;
  questions: QuestionnaireQuestionDTO[];
};

export type {
  FactorConfidenceBand,
  FactorFreshnessBand,
  FactorProfileStatus,
  FactorSemanticCardDTO,
  ProfileSummaryDTO,
} from '@/lib/dto/factorProfile.dto';

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
