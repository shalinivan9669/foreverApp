import type { PairState, ProfileSummaryDTO, QuestionnaireAxis } from '@/client/api/types';

type ProfileStatus = 'solo:new' | 'solo:history' | 'paired';

type ProfileSummaryInput = {
  user?: {
    id?: string;
    _id?: string;
    handle?: string;
    avatar?: string | null;
    joinedAt?: string;
    status?: ProfileStatus;
    lastActiveAt?: string;
    featureFlags?: Record<string, boolean>;
  };
  currentPair?: {
    id?: string;
    _id?: string;
    status?: PairState;
    since?: string;
  } | null;
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
    title?: string;
    axis?: QuestionnaireAxis;
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

export const createEmptyProfileSummary = (): ProfileSummaryDTO => ({
  user: {
    id: '',
    handle: '',
    avatar: null,
    status: 'solo:new',
    featureFlags: {},
  },
  currentPair: null,
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

  return {
    user: {
      id: asId(input.user?.id, input.user?._id),
      handle: input.user?.handle ?? '',
      avatar: input.user?.avatar ?? null,
      joinedAt: asString(input.user?.joinedAt),
      status: input.user?.status ?? fallback.user.status,
      lastActiveAt: asString(input.user?.lastActiveAt),
      featureFlags: input.user?.featureFlags ?? fallback.user.featureFlags,
    },
    currentPair: input.currentPair
      ? {
          id: asId(input.currentPair.id, input.currentPair._id),
          status: input.currentPair.status ?? 'active',
          since: input.currentPair.since ?? '',
        }
      : null,
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
          title: item.title,
          axis: item.axis,
          delta: item.delta,
        }))
        .filter((item) => item.id.length > 0) ?? [],
    featureFlags: input.featureFlags ?? fallback.featureFlags,
    entitlements: input.entitlements ?? fallback.entitlements,
  };
};
