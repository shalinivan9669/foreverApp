import type { PairState, ProfileSummaryDTO, QuestionnaireAxis } from '@/client/api/types';

type ProfileStatus = 'solo:new' | 'solo:history' | 'paired';

type ProfileSummaryInput = {
  user?: {
    id?: string;
    _id?: string;
    name?: string;
    handle?: string;
    avatar?: string | null;
    avatarUrl?: string | null;
    joinedAt?: string;
    status?: ProfileStatus;
    lastActiveAt?: string;
    personal?: Partial<ProfileSummaryDTO['user']['personal']>;
    featureFlags?: Record<string, boolean>;
  };
  currentPair?: {
    id?: string;
    _id?: string;
    status?: PairState;
    since?: string;
    daysTogether?: number;
  } | null;
  relationshipContext?: {
    currentPair?: {
      id?: string;
      _id?: string;
      status?: PairState;
      since?: string;
      daysTogether?: number;
    } | null;
    hasPairHistory?: boolean;
  };
  profileMode?: Partial<ProfileSummaryDTO['profileMode']>;
  profileCompletion?: Partial<ProfileSummaryDTO['profileCompletion']> & {
    sections?: Partial<ProfileSummaryDTO['profileCompletion']['sections']>;
  };
  pairedProfileState?: Partial<NonNullable<ProfileSummaryDTO['pairedProfileState']>> | null;
  nextStep?: Partial<ProfileSummaryDTO['nextStep']>;
  metrics?: {
    streak?: {
      individual?: number;
    };
    completed?: {
      individual?: number;
    };
  };
  readiness?: {
    score?: number;
    updatedAt?: string;
  };
  fatigue?: {
    score?: number;
    updatedAt?: string;
  };
  passport?: {
    levelsByAxis?: Partial<Record<QuestionnaireAxis, number>>;
    positivesByAxis?: Partial<Record<QuestionnaireAxis, string[]>>;
    negativesByAxis?: Partial<Record<QuestionnaireAxis, string[]>>;
    strongSides?: string[];
    growthAreas?: string[];
    values?: string[];
    boundaries?: string[];
    updatedAt?: string;
  };
  activity?: {
    current?: {
      id?: string;
      _id?: string;
      title?: string;
      progress?: number;
    } | null;
    suggested?: Array<{
      id?: string;
      _id?: string;
      title?: string;
    }>;
    historyCount?: number;
  };
  matching?: {
    inboxCount?: number;
    outboxCount?: number;
    filters?: {
      age?: [number, number];
      radiusKm?: number;
      valuedQualities?: string[];
      excludeTags?: string[];
    };
  };
  insights?: Array<{
    id?: string;
    _id?: string;
    ownerType?: 'user' | 'pair';
    userId?: string;
    pairId?: string;
    ruleId?: string;
    title?: string;
    axis?: QuestionnaireAxis;
    severity?: 1 | 2 | 3;
    safeWording?: string;
    recommendedAction?: string;
    activityId?: string;
    questionnaireId?: string;
    pairShared?: boolean;
    cooldownUntil?: string;
    createdAt?: string;
    delta?: number;
  }>;
  featureFlags?: Record<string, boolean>;
  entitlements?: ProfileSummaryDTO['entitlements'];
};

const AXES: QuestionnaireAxis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
];

const asFiniteNumber = (value: number | undefined, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asString = (value?: string | null): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asId = (id?: string, legacyId?: string): string =>
  asString(id) ?? asString(legacyId) ?? '';

const asPercent = (value: number | undefined): number =>
  Math.max(0, Math.min(100, Math.round(asFiniteNumber(value))));

const asBoolean = (value: boolean | undefined, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const defaultAxisLevels = (): Record<QuestionnaireAxis, number> => ({
  communication: 0,
  domestic: 0,
  personalViews: 0,
  finance: 0,
  sexuality: 0,
  psyche: 0,
});

const defaultAxisKeywords = (): Record<QuestionnaireAxis, string[]> => ({
  communication: [],
  domestic: [],
  personalViews: [],
  finance: [],
  sexuality: [],
  psyche: [],
});

const normalizeAxisLevels = (
  levels?: Partial<Record<QuestionnaireAxis, number>>
): Record<QuestionnaireAxis, number> => {
  const normalized = defaultAxisLevels();
  for (const axis of AXES) {
    const raw = asFiniteNumber(levels?.[axis]);
    normalized[axis] = Math.max(0, Math.min(100, Math.round(raw)));
  }
  return normalized;
};

const normalizeAxisKeywords = (
  value?: Partial<Record<QuestionnaireAxis, string[]>>
): Record<QuestionnaireAxis, string[]> => {
  const normalized = defaultAxisKeywords();
  for (const axis of AXES) {
    normalized[axis] = value?.[axis] ?? [];
  }
  return normalized;
};

const normalizeCurrentPair = (
  pair?: ProfileSummaryInput['currentPair']
): ProfileSummaryDTO['currentPair'] => {
  if (!pair) return null;
  const id = asId(pair.id, pair._id);
  if (!id || (pair.status !== 'active' && pair.status !== 'paused')) return null;

  return {
    id,
    status: pair.status,
    since: pair.since ?? '',
    daysTogether: asFiniteNumber(pair.daysTogether),
  };
};

const normalizeProfileMode = (
  input: ProfileSummaryInput['profileMode'] | undefined,
  fallback: ProfileSummaryDTO['profileMode']
): ProfileSummaryDTO['profileMode'] => {
  const status = input?.status;
  const kind = input?.kind;
  if (
    (kind !== 'solo' && kind !== 'paired') ||
    (status !== 'solo_new' &&
      status !== 'solo_with_history' &&
      status !== 'paired_active' &&
      status !== 'paired_paused')
  ) {
    return fallback;
  }

  return {
    kind,
    status,
    label: asString(input?.label) ?? fallback.label,
    description: asString(input?.description) ?? fallback.description,
  };
};

const normalizeCompletionSection = (
  input:
    | Partial<ProfileSummaryDTO['profileCompletion']['sections']['account']>
    | undefined,
  fallback: ProfileSummaryDTO['profileCompletion']['sections']['account']
): ProfileSummaryDTO['profileCompletion']['sections']['account'] => ({
  score: asPercent(input?.score ?? fallback.score),
  completed: asBoolean(input?.completed, fallback.completed),
  missing: input?.missing ?? fallback.missing,
});

const normalizeMatchCardSection = (
  input:
    | Partial<ProfileSummaryDTO['profileCompletion']['sections']['matchCard']>
    | undefined,
  fallback: ProfileSummaryDTO['profileCompletion']['sections']['matchCard']
): ProfileSummaryDTO['profileCompletion']['sections']['matchCard'] => ({
  ...normalizeCompletionSection(input, fallback),
  isActive: asBoolean(input?.isActive, fallback.isActive),
});

const normalizeProfileCompletion = (
  input: ProfileSummaryInput['profileCompletion'] | undefined,
  fallback: ProfileSummaryDTO['profileCompletion']
): ProfileSummaryDTO['profileCompletion'] => {
  const sections = input?.sections;
  const pairContext = sections?.pairContext
    ? normalizeCompletionSection(
        sections.pairContext,
        fallback.sections.pairContext ?? { score: 0, completed: false, missing: [] }
      )
    : fallback.sections.pairContext;

  return {
    score: asPercent(input?.score ?? fallback.score),
    level:
      input?.level === 'basic' ||
      input?.level === 'good' ||
      input?.level === 'strong' ||
      input?.level === 'empty'
        ? input.level
        : fallback.level,
    missing:
      input?.missing
        ?.filter((item) => asString(item.key) && asString(item.label) && asString(item.href))
        .map((item) => ({
          key: item.key,
          label: item.label,
          href: item.href,
        }))
        .slice(0, 5) ?? fallback.missing,
    sections: {
      account: normalizeCompletionSection(sections?.account, fallback.sections.account),
      matchCard: normalizeMatchCardSection(sections?.matchCard, fallback.sections.matchCard),
      preferences: normalizeCompletionSection(
        sections?.preferences,
        fallback.sections.preferences
      ),
      passport: normalizeCompletionSection(sections?.passport, fallback.sections.passport),
      ...(pairContext ? { pairContext } : {}),
    },
  };
};

const normalizeNextStep = (
  input: ProfileSummaryInput['nextStep'] | undefined,
  fallback: ProfileSummaryDTO['nextStep']
): ProfileSummaryDTO['nextStep'] => {
  const allowedKinds: ProfileSummaryDTO['nextStep']['kind'][] = [
    'complete_account',
    'create_match_card',
    'improve_match_card',
    'open_search',
    'open_pair',
    'resume_pair',
    'weekly_checkin',
    'questionnaire',
    'activity_feedback',
    'open_activity',
  ];
  const kind = input?.kind && allowedKinds.includes(input.kind) ? input.kind : fallback.kind;
  const priority =
    input?.priority === 1 || input?.priority === 2 || input?.priority === 3
      ? input.priority
      : fallback.priority;

  return {
    kind,
    title: asString(input?.title) ?? fallback.title,
    description: asString(input?.description) ?? fallback.description,
    href: asString(input?.href) ?? fallback.href,
    ctaLabel: asString(input?.ctaLabel) ?? fallback.ctaLabel,
    priority,
  };
};

const normalizeOptionalNumber = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeStringList = (value: string[] | undefined): string[] =>
  value?.map((item) => item.trim()).filter((item) => item.length > 0) ?? [];

const normalizePairedProfileState = (
  input: ProfileSummaryInput['pairedProfileState']
): ProfileSummaryDTO['pairedProfileState'] => {
  if (!input) return null;
  const pairId = asString(input.pairId);
  if (!pairId || (input.pairStatus !== 'active' && input.pairStatus !== 'paused')) {
    return null;
  }

  const weeklyStatus = input.pairWeeklyCheckIn?.status;
  const contributionLevel = input.contribution?.level;
  const resourceTone = input.resourceMessage?.tone;

  return {
    pairId,
    pairStatus: input.pairStatus,
    myWeeklyCheckIn: {
      weekKey: input.myWeeklyCheckIn?.weekKey ?? '',
      submitted: asBoolean(input.myWeeklyCheckIn?.submitted),
      submittedAt: asString(input.myWeeklyCheckIn?.submittedAt),
      readiness: normalizeOptionalNumber(input.myWeeklyCheckIn?.readiness),
      fatigue: normalizeOptionalNumber(input.myWeeklyCheckIn?.fatigue),
      closeness: normalizeOptionalNumber(input.myWeeklyCheckIn?.closeness),
      irritation: normalizeOptionalNumber(input.myWeeklyCheckIn?.irritation),
    },
    pairWeeklyCheckIn: {
      peerSubmitted: asBoolean(input.pairWeeklyCheckIn?.peerSubmitted),
      bothSubmitted: asBoolean(input.pairWeeklyCheckIn?.bothSubmitted),
      hasDivergence: asBoolean(input.pairWeeklyCheckIn?.hasDivergence),
      status:
        weeklyStatus === 'partial' ||
        weeklyStatus === 'complete' ||
        weeklyStatus === 'divergent' ||
        weeklyStatus === 'missing'
          ? weeklyStatus
          : 'missing',
    },
    myActivityState: {
      hasCurrentActivity: asBoolean(input.myActivityState?.hasCurrentActivity),
      currentActivityId: asString(input.myActivityState?.currentActivityId),
      currentActivityTitle: asString(input.myActivityState?.currentActivityTitle),
      status: asString(input.myActivityState?.status),
      awaitsMyFeedback: asBoolean(input.myActivityState?.awaitsMyFeedback),
      awaitsPartnerFeedback: asBoolean(input.myActivityState?.awaitsPartnerFeedback),
    },
    contribution: {
      score: asPercent(input.contribution?.score),
      level:
        contributionLevel === 'stable' ||
        contributionLevel === 'strong' ||
        contributionLevel === 'low'
          ? contributionLevel
          : 'low',
      completedThisWeek: normalizeStringList(input.contribution?.completedThisWeek),
      pendingFromMe: normalizeStringList(input.contribution?.pendingFromMe),
      message: asString(input.contribution?.message) ?? '',
    },
    resourceMessage: {
      tone:
        resourceTone === 'stable' ||
        resourceTone === 'tired' ||
        resourceTone === 'tense' ||
        resourceTone === 'low_data'
          ? resourceTone
          : 'low_data',
      title: asString(input.resourceMessage?.title) ?? 'Мало данных о состоянии',
      description:
        asString(input.resourceMessage?.description) ??
        'Пройди weekly check-in, чтобы профиль точнее показал твой ресурс в отношениях.',
    },
  };
};

export const profileCompletionLevelLabel = (
  level: ProfileSummaryDTO['profileCompletion']['level']
): string => {
  if (level === 'strong') return 'Сильный';
  if (level === 'good') return 'Хороший';
  if (level === 'basic') return 'Базовый';
  return 'Пустой';
};

export const createEmptyProfileSummary = (): ProfileSummaryDTO => ({
  user: {
    id: '',
    name: '',
    handle: '',
    avatar: null,
    avatarUrl: null,
    status: 'solo:new',
    personal: {
      gender: null,
      age: null,
      city: '',
      relationshipStatus: null,
    },
    featureFlags: {},
  },
  currentPair: null,
  relationshipContext: {
    currentPair: null,
    hasPairHistory: false,
  },
  profileMode: {
    kind: 'solo',
    status: 'solo_new',
    label: 'Профиль ещё настраивается',
    description: 'Заполни базовые данные и карточку, чтобы начать пользоваться продуктом.',
  },
  profileCompletion: {
    score: 0,
    level: 'empty',
    missing: [],
    sections: {
      account: { score: 0, completed: false, missing: [] },
      matchCard: { score: 0, completed: false, isActive: false, missing: [] },
      preferences: { score: 0, completed: false, missing: [] },
      passport: { score: 0, completed: false, missing: [] },
    },
  },
  pairedProfileState: null,
  nextStep: {
    kind: 'complete_account',
    title: 'Заполни базовые данные',
    description: 'Это поможет профилю корректно работать в поиске и личном обзоре.',
    href: '/profile/profile',
    ctaLabel: 'Заполнить профиль',
    priority: 1,
  },
  metrics: {
    streak: { individual: 0 },
    completed: { individual: 0 },
  },
  readiness: {
    score: 0,
  },
  fatigue: {
    score: 0,
  },
  passport: {
    levelsByAxis: defaultAxisLevels(),
    positivesByAxis: defaultAxisKeywords(),
    negativesByAxis: defaultAxisKeywords(),
    strongSides: [],
    growthAreas: [],
    values: [],
    boundaries: [],
  },
  activity: {
    current: null,
    suggested: [],
    historyCount: 0,
  },
  matching: {
    inboxCount: 0,
    outboxCount: 0,
    filters: {
      age: [18, 99],
      radiusKm: 50,
      valuedQualities: [],
      excludeTags: [],
    },
  },
  insights: [],
  featureFlags: {},
  entitlements: {
    plan: 'FREE',
    status: 'inactive',
    periodEnd: null,
  },
});

export const normalizeProfileSummary = (
  input?: ProfileSummaryInput | null
): ProfileSummaryDTO => {
  const fallback = createEmptyProfileSummary();
  if (!input) return fallback;

  const currentActivityId = input.activity?.current
    ? asId(input.activity.current.id, input.activity.current._id)
    : '';
  const currentPair = normalizeCurrentPair(input.currentPair);
  const relationshipContext = {
    currentPair:
      normalizeCurrentPair(input.relationshipContext?.currentPair ?? currentPair) ?? currentPair,
    hasPairHistory:
      typeof input.relationshipContext?.hasPairHistory === 'boolean'
        ? input.relationshipContext.hasPairHistory
        : Boolean(currentPair),
  };
  const profileMode = normalizeProfileMode(input.profileMode, fallback.profileMode);
  const profileCompletion = normalizeProfileCompletion(
    input.profileCompletion,
    fallback.profileCompletion
  );
  const pairedProfileState = normalizePairedProfileState(input.pairedProfileState);
  const nextStep = normalizeNextStep(input.nextStep, fallback.nextStep);

  return {
    user: {
      id: asId(input.user?.id, input.user?._id),
      name: input.user?.name ?? input.user?.handle ?? '',
      handle: input.user?.handle ?? '',
      avatar: input.user?.avatar ?? null,
      avatarUrl: input.user?.avatarUrl ?? input.user?.avatar ?? null,
      joinedAt: asString(input.user?.joinedAt),
      status: input.user?.status ?? fallback.user.status,
      lastActiveAt: asString(input.user?.lastActiveAt),
      personal: {
        gender:
          input.user?.personal?.gender === 'male' || input.user?.personal?.gender === 'female'
            ? input.user.personal.gender
            : null,
        age:
          typeof input.user?.personal?.age === 'number' &&
          Number.isFinite(input.user.personal.age)
            ? input.user.personal.age
            : null,
        city: input.user?.personal?.city ?? '',
        relationshipStatus:
          input.user?.personal?.relationshipStatus === 'seeking' ||
          input.user?.personal?.relationshipStatus === 'in_relationship'
            ? input.user.personal.relationshipStatus
            : null,
      },
      featureFlags: input.user?.featureFlags ?? fallback.user.featureFlags,
    },
    currentPair,
    relationshipContext,
    profileMode,
    profileCompletion,
    pairedProfileState,
    nextStep,
    metrics: {
      streak: {
        individual: asFiniteNumber(input.metrics?.streak?.individual),
      },
      completed: {
        individual: asFiniteNumber(input.metrics?.completed?.individual),
      },
    },
    readiness: {
      score: asFiniteNumber(input.readiness?.score),
      updatedAt: asString(input.readiness?.updatedAt),
    },
    fatigue: {
      score: asFiniteNumber(input.fatigue?.score),
      updatedAt: asString(input.fatigue?.updatedAt),
    },
    passport: {
      levelsByAxis: normalizeAxisLevels(input.passport?.levelsByAxis),
      positivesByAxis: normalizeAxisKeywords(input.passport?.positivesByAxis),
      negativesByAxis: normalizeAxisKeywords(input.passport?.negativesByAxis),
      strongSides: input.passport?.strongSides ?? [],
      growthAreas: input.passport?.growthAreas ?? [],
      values: input.passport?.values ?? [],
      boundaries: input.passport?.boundaries ?? [],
      updatedAt: asString(input.passport?.updatedAt),
    },
    activity: {
      current: input.activity?.current && currentActivityId
        ? {
            id: currentActivityId,
            title: input.activity.current.title,
            progress: asFiniteNumber(input.activity.current.progress),
          }
        : null,
      suggested:
        input.activity?.suggested
          ?.map((item) => ({
            id: asId(item.id, item._id),
            title: item.title,
          }))
          .filter((item) => item.id.length > 0) ?? [],
      historyCount: asFiniteNumber(input.activity?.historyCount),
    },
    matching: {
      inboxCount: asFiniteNumber(input.matching?.inboxCount),
      outboxCount: asFiniteNumber(input.matching?.outboxCount),
      filters: {
        age: input.matching?.filters?.age ?? [18, 99],
        radiusKm: asFiniteNumber(input.matching?.filters?.radiusKm, 50),
        valuedQualities: input.matching?.filters?.valuedQualities ?? [],
        excludeTags: input.matching?.filters?.excludeTags ?? [],
      },
    },
    insights:
      input.insights
        ?.map((item) => ({
          id: asId(item.id, item._id),
          ownerType: item.ownerType,
          userId: item.userId,
          pairId: item.pairId,
          ruleId: item.ruleId,
          title: item.title,
          axis: item.axis,
          severity: item.severity,
          safeWording: item.safeWording,
          recommendedAction: item.recommendedAction,
          activityId: item.activityId,
          questionnaireId: item.questionnaireId,
          pairShared: item.pairShared,
          cooldownUntil: item.cooldownUntil,
          createdAt: item.createdAt,
          delta: item.delta,
        }))
        .filter((item) => item.id.length > 0) ?? [],
    featureFlags: input.featureFlags ?? fallback.featureFlags,
    entitlements: input.entitlements ?? fallback.entitlements,
  };
};
