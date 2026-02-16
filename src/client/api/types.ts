export type ApiJsonPrimitive = string | number | boolean | null;

export type ApiJsonObject = {
  [key: string]: ApiJsonValue;
};

export type ApiJsonValue = ApiJsonPrimitive | ApiJsonObject | ApiJsonValue[];

export type PublicUserDTO = {
  id: string;
  username: string;
  avatar: string;
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
  vectors?: Record<string, ApiJsonValue>;
  preferences?: Record<string, ApiJsonValue>;
  embeddings?: Record<string, ApiJsonValue>;
  location?: Record<string, ApiJsonValue>;
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

export type PairDiagnosticsDTO = {
  pairId: string;
  passport: PairPassportDTO;
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

export type PairActivityDTO = {
  id: string;
  _id?: string;
  pairId: string;
  title: ActivityI18nText;
  description?: ActivityI18nText;
  axis: string[];
  archetype: string;
  intent: 'improve' | 'celebrate';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  dueAt?: string;
  status: ActivityStatus;
  checkIns: ActivityCheckInDTO[];
  offerSource?: OfferSource;
  offerReason?: OfferReasonMeta;
  legacy?: boolean;
  legacySource?: 'relationship_activity';
  createdAt?: string;
  updatedAt?: string;
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
};

export type ActivityCompleteResponse = {
  success: number;
  status: 'completed_success' | 'completed_partial' | 'failed';
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

export type ProfileSummaryDTO = {
  user: {
    id: string;
    handle: string;
    avatar: string | null;
    joinedAt?: string;
    status: 'solo:new' | 'solo:history' | 'paired';
    lastActiveAt?: string;
    featureFlags: Record<string, boolean>;
  };
  currentPair: null | {
    id: string;
    status: PairState;
    since: string;
  };
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
  insights: Array<{
    id: string;
    title?: string;
    axis?: QuestionnaireAxis;
    delta?: number;
  }>;
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
