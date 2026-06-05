import type {
  PairDTO,
  PairDashboardDiagnosticsDTO,
  PairMeDTO,
  PairNextStepDTO,
  PairState,
  PairStatusDTO,
  PublicUserDTO,
} from '@/client/api/types';

export type PairInput = {
  id?: string;
  _id?: string;
  members?: string[];
  key?: string;
  status?: PairState;
  createdAt?: string;
  updatedAt?: string;
  progress?: {
    streak?: number;
    completed?: number;
  };
  readiness?: {
    score?: number;
  };
  fatigue?: {
    score?: number;
  };
};

export type PairStatusInput =
  | {
      hasActive?: false;
    }
  | {
      hasActive?: true;
      pairId?: string;
      pairKey?: string;
      peer?: PublicUserDTO;
    };

export type PairMeInput = {
  pair?: PairInput | null;
  hasActive?: boolean;
  hasAny?: boolean;
  status?: PairState | null;
};

type PairPassport = {
  strongSides: { axis: string; facets: string[] }[];
  riskZones: { axis: string; facets: string[]; severity: 1 | 2 | 3 }[];
  complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
  levelDelta: { axis: string; delta: number }[];
  lastDiagnosticsAt?: string;
};

type PairMember = PublicUserDTO & {
  avatarUrl?: string | null;
};

type PairDashboardDiagnosticsInput = {
  overall?: {
    score?: number;
    confidence?: number;
    status?: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
  };
  strongSides?: { axis?: string; facets?: string[] }[];
  riskZones?: { axis?: string; facets?: string[]; severity?: 1 | 2 | 3 }[];
  complementMap?: { axis?: string; A_covers_B?: string[]; B_covers_A?: string[] }[];
  levelDelta?: { axis?: string; delta?: number }[];
  lastDiagnosticsAt?: string;
};

type PairSummaryPairInput = PairInput & {
  passport?: {
    strongSides?: { axis?: string; facets?: string[] }[];
    riskZones?: { axis?: string; facets?: string[]; severity?: 1 | 2 | 3 }[];
    complementMap?: { axis?: string; A_covers_B?: string[]; B_covers_A?: string[] }[];
    levelDelta?: { axis?: string; delta?: number }[];
    lastDiagnosticsAt?: string;
  };
};

type PairSummaryActivityInput = {
  id?: string;
  _id?: string;
  title?: { ru?: string; en?: string };
  status?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  intensity?: 1 | 2 | 3;
  axis?: string[] | string;
};

export type PairSummaryInput = {
  pair?: PairSummaryPairInput | null;
  members?: PairMember[];
  peer?: PairMember | null;
  currentActivity?: PairSummaryActivityInput | null;
  suggestedCount?: number;
  diagnostics?: PairDashboardDiagnosticsInput | null;
  hasCurrentWeeklyCheckIn?: boolean;
  nextStep?: Partial<PairNextStepDTO> | null;
  lastLike?: {
    id?: string;
    matchScore?: number;
    updatedAt?: string;
    agreements?: boolean[];
    answers?: string[];
    recipientResponse?: {
      agreements?: boolean[];
      answers?: string[];
    } | null;
  } | null;
};

export type PairSummaryDTO = {
  pair: PairDTO & {
    passport?: PairPassport;
  };
  members: PairMember[];
  peer: PairMember | null;
  currentActivity: {
    id: string;
    title: { ru: string; en: string };
    status: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    intensity: 1 | 2 | 3;
    axis: string[];
  } | null;
  suggestedCount: number;
  diagnostics: PairDashboardDiagnosticsDTO;
  hasCurrentWeeklyCheckIn: boolean;
  nextStep: PairNextStepDTO;
  lastLike: {
    id: string;
    matchScore: number;
    updatedAt?: string;
    agreements?: boolean[];
    answers?: string[];
    recipientResponse?: {
      agreements: boolean[];
      answers: string[];
    } | null;
  } | null;
};

const asNonEmptyString = (value?: string): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const asFiniteNumber = (value: number | undefined, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: boolean | undefined, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asPairState = (value?: PairState | null): PairState =>
  value === 'paused' || value === 'ended' ? value : 'active';

const normalizePairMembers = (members?: string[]): [string, string] => {
  if (!Array.isArray(members)) return ['', ''];
  return [members[0] ?? '', members[1] ?? ''];
};

export const normalizePair = (pair?: PairInput | null): PairDTO | null => {
  if (!pair) return null;
  const id = asNonEmptyString(pair.id) ?? asNonEmptyString(pair._id);
  if (!id) return null;

  return {
    id,
    members: normalizePairMembers(pair.members),
    key: asNonEmptyString(pair.key) ?? '',
    status: asPairState(pair.status),
    createdAt: asNonEmptyString(pair.createdAt) ?? undefined,
    updatedAt: asNonEmptyString(pair.updatedAt) ?? undefined,
    progress: pair.progress
      ? {
          streak: asFiniteNumber(pair.progress.streak),
          completed: asFiniteNumber(pair.progress.completed),
        }
      : undefined,
    readiness: pair.readiness
      ? {
          score: asFiniteNumber(pair.readiness.score),
        }
      : undefined,
    fatigue: pair.fatigue
      ? {
          score: asFiniteNumber(pair.fatigue.score),
        }
      : undefined,
  };
};

export const normalizePairStatus = (status: PairStatusInput): PairStatusDTO => {
  if (!status.hasActive) return { hasActive: false };

  const pairId = asNonEmptyString(status.pairId);
  if (!pairId || !status.peer) return { hasActive: false };

  return {
    hasActive: true,
    pairId,
    pairKey: asNonEmptyString(status.pairKey) ?? '',
    peer: status.peer,
  };
};

export const normalizePairMe = (pairMe: PairMeInput): PairMeDTO => {
  const pair = normalizePair(pairMe.pair);

  return {
    pair,
    hasActive: pairMe.hasActive === true && pair?.status === 'active',
    hasAny: pairMe.hasAny === true || Boolean(pair),
    status: pairMe.status ?? pair?.status ?? null,
  };
};

const normalizePassport = (passport?: PairSummaryPairInput['passport']): PairPassport => ({
  strongSides:
    passport?.strongSides?.map((item) => ({
      axis: item.axis ?? '',
      facets: item.facets ?? [],
    })) ?? [],
  riskZones:
    passport?.riskZones?.map((item) => ({
      axis: item.axis ?? '',
      facets: item.facets ?? [],
      severity: item.severity ?? 1,
    })) ?? [],
  complementMap:
    passport?.complementMap?.map((item) => ({
      axis: item.axis ?? '',
      A_covers_B: item.A_covers_B ?? [],
      B_covers_A: item.B_covers_A ?? [],
    })) ?? [],
  levelDelta:
    passport?.levelDelta?.map((item) => ({
      axis: item.axis ?? '',
      delta: asFiniteNumber(item.delta),
    })) ?? [],
  lastDiagnosticsAt: asNonEmptyString(passport?.lastDiagnosticsAt) ?? undefined,
});

const normalizeMember = (member?: PairMember | null): PairMember | null => {
  if (!member) return null;
  const id = asNonEmptyString(member.id);
  if (!id) return null;

  return {
    id,
    username: asNonEmptyString(member.username) ?? 'Участник пары',
    avatar: asNonEmptyString(member.avatar) ?? '',
    avatarUrl: asNonEmptyString(member.avatarUrl ?? undefined),
  };
};

const normalizeOverallStatus = (
  status?: NonNullable<PairDashboardDiagnosticsInput['overall']>['status']
): NonNullable<PairDashboardDiagnosticsDTO['overall']>['status'] =>
  status === 'strong' || status === 'neutral' || status === 'risk'
    ? status
    : 'insufficient_data';

const normalizeDashboardDiagnostics = (
  diagnostics?: PairDashboardDiagnosticsInput | null,
  fallbackPassport?: PairPassport
): PairDashboardDiagnosticsDTO => {
  const strongSides =
    diagnostics?.strongSides?.map((item) => ({
      axis: item.axis ?? '',
      facets: item.facets ?? [],
    })) ?? fallbackPassport?.strongSides ?? [];
  const riskZones =
    diagnostics?.riskZones?.map((item) => ({
      axis: item.axis ?? '',
      facets: item.facets ?? [],
      severity: item.severity ?? 1,
    })) ?? fallbackPassport?.riskZones ?? [];
  const complementMap =
    diagnostics?.complementMap?.map((item) => ({
      axis: item.axis ?? '',
      A_covers_B: item.A_covers_B ?? [],
      B_covers_A: item.B_covers_A ?? [],
    })) ?? fallbackPassport?.complementMap ?? [];
  const levelDelta =
    diagnostics?.levelDelta?.map((item) => ({
      axis: item.axis ?? '',
      delta: asFiniteNumber(item.delta),
    })) ?? fallbackPassport?.levelDelta ?? [];

  return {
    overall: diagnostics?.overall
      ? {
          score: asFiniteNumber(diagnostics.overall.score),
          confidence: asFiniteNumber(diagnostics.overall.confidence),
          status: normalizeOverallStatus(diagnostics.overall.status),
        }
      : undefined,
    strongSides,
    riskZones,
    complementMap,
    levelDelta,
    lastDiagnosticsAt:
      asNonEmptyString(diagnostics?.lastDiagnosticsAt) ??
      fallbackPassport?.lastDiagnosticsAt,
  };
};

const normalizeNextStep = (nextStep?: Partial<PairNextStepDTO> | null): PairNextStepDTO => {
  const kind = nextStep?.kind;
  const normalizedKind =
    kind === 'complete_weekly_checkin' ||
    kind === 'complete_current_activity' ||
    kind === 'run_pair_diagnostics' ||
    kind === 'review_risk_zone' ||
    kind === 'suggest_activity'
      ? kind
      : 'none';

  return {
    kind: normalizedKind,
    title: asNonEmptyString(nextStep?.title) ?? 'Следующий шаг пока не определён',
    description:
      asNonEmptyString(nextStep?.description) ??
      'Пока можно открыть активности пары и выбрать короткое действие.',
    href: asNonEmptyString(nextStep?.href) ?? undefined,
    ctaLabel: asNonEmptyString(nextStep?.ctaLabel) ?? undefined,
    axis: asNonEmptyString(nextStep?.axis) ?? undefined,
    severity: nextStep?.severity,
  };
};

const normalizeCurrentActivity = (
  currentActivity?: PairSummaryActivityInput | null
): PairSummaryDTO['currentActivity'] => {
  if (!currentActivity) return null;
  const id = asNonEmptyString(currentActivity.id) ?? asNonEmptyString(currentActivity._id);
  if (!id) return null;

  const axisSingle =
    typeof currentActivity.axis === 'string'
      ? asNonEmptyString(currentActivity.axis)
      : null;

  return {
    id,
    title: {
      ru: currentActivity.title?.ru ?? '',
      en: currentActivity.title?.en ?? '',
    },
    status: asNonEmptyString(currentActivity.status) ?? '',
    difficulty: currentActivity.difficulty ?? 1,
    intensity: currentActivity.intensity ?? 1,
    axis: Array.isArray(currentActivity.axis) ? currentActivity.axis : axisSingle ? [axisSingle] : [],
  };
};

export const normalizePairSummary = (
  summary?: PairSummaryInput | null
): PairSummaryDTO | null => {
  const pair = normalizePair(summary?.pair);
  if (!pair) return null;
  const passport = normalizePassport(summary?.pair?.passport);

  return {
    pair: {
      ...pair,
      passport,
    },
    members:
      summary?.members?.map(normalizeMember).filter((member): member is PairMember => member !== null) ??
      [],
    peer: normalizeMember(summary?.peer),
    currentActivity: normalizeCurrentActivity(summary?.currentActivity),
    suggestedCount: asFiniteNumber(summary?.suggestedCount),
    diagnostics: normalizeDashboardDiagnostics(summary?.diagnostics, passport),
    hasCurrentWeeklyCheckIn: asBoolean(summary?.hasCurrentWeeklyCheckIn),
    nextStep: normalizeNextStep(summary?.nextStep),
    lastLike: summary?.lastLike
      ? {
          id: asNonEmptyString(summary.lastLike.id) ?? '',
          matchScore: asFiniteNumber(summary.lastLike.matchScore),
          updatedAt: asNonEmptyString(summary.lastLike.updatedAt) ?? undefined,
          agreements: summary.lastLike.agreements ?? [],
          answers: summary.lastLike.answers ?? [],
          recipientResponse: summary.lastLike.recipientResponse
            ? {
                agreements: summary.lastLike.recipientResponse.agreements ?? [],
                answers: summary.lastLike.recipientResponse.answers ?? [],
              }
            : null,
        }
      : null,
  };
};
