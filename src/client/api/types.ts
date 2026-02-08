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

export type PairStatusDTO =
  | { hasActive: false }
  | {
      hasActive: true;
      pairKey: string;
      peer: PublicUserDTO;
    };

export type PairState = 'active' | 'paused' | 'ended';

export type PairDTO = {
  id: string;
  _id?: string;
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
  | 'offered'
  | 'accepted'
  | 'in_progress'
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
  source: string;
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

export type NextActivityResponse = {
  activityId: string;
  offer?: ActivityOfferDTO;
};

export type CreateActivityFromTemplateRequest = {
  templateId: string;
};

export type CreateActivityFromTemplateResponse = {
  id: string;
};

export type QuestionnaireAxis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

export type QuestionnaireAudience = 'pair' | 'solo' | 'universal';

export type QuestionnaireStatus = 'new' | 'in_progress' | 'completed' | 'required' | 'locked';

export type QuestionnaireCta = 'start' | 'continue' | 'result' | 'locked';

export type QuestionnaireCardDTO = {
  id: string;
  vector: QuestionnaireAxis;
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

export type ProfileSummaryDTO = {
  user: {
    _id: string;
    handle: string;
    avatar: string | null;
    joinedAt?: string;
    status: 'solo:new' | 'solo:history' | 'paired';
    lastActiveAt?: string;
    featureFlags: Record<string, boolean>;
  };
  currentPair: null | {
    _id: string;
    status: PairState;
    since: string;
  };
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
