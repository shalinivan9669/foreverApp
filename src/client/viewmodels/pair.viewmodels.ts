import type {
  PairDTO,
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

type PairMember = PublicUserDTO & {
  avatarUrl?: string | null;
};

type PairSummaryActivityInput = {
  id?: string;
  _id?: string;
  title?: { ru?: string; en?: string };
  status?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  intensity?: 1 | 2 | 3;
  targetFactorKeys?: string[];
};

export type PairSummaryInput = {
  pair?: PairInput | null;
  members?: PairMember[];
  peer?: PairMember | null;
  currentActivity?: PairSummaryActivityInput | null;
  suggestedCount?: number;
  hasCurrentWeeklyCheckIn?: boolean;
  nextStep?: Partial<PairNextStepDTO> | null;
};

export type PairSummaryDTO = {
  pair: PairDTO;
  members: PairMember[];
  peer: PairMember | null;
  currentActivity: {
    id: string;
    title: { ru: string; en: string };
    status: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    intensity: 1 | 2 | 3;
    targetFactorKeys: string[];
  } | null;
  suggestedCount: number;
  hasCurrentWeeklyCheckIn: boolean;
  nextStep: PairNextStepDTO;
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

const normalizeNextStep = (nextStep?: Partial<PairNextStepDTO> | null): PairNextStepDTO => {
  const kind = nextStep?.kind;
  const normalizedKind =
    kind === 'complete_weekly_checkin' ||
    kind === 'wait_or_invite_peer_checkin' ||
    kind === 'review_weekly_divergence' ||
    kind === 'complete_current_activity' ||
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
  };
};

const normalizeCurrentActivity = (
  currentActivity?: PairSummaryActivityInput | null
): PairSummaryDTO['currentActivity'] => {
  if (!currentActivity) return null;
  const id = asNonEmptyString(currentActivity.id) ?? asNonEmptyString(currentActivity._id);
  if (!id) return null;

  return {
    id,
    title: {
      ru: currentActivity.title?.ru ?? '',
      en: currentActivity.title?.en ?? '',
    },
    status: asNonEmptyString(currentActivity.status) ?? '',
    difficulty: currentActivity.difficulty ?? 1,
    intensity: currentActivity.intensity ?? 1,
    targetFactorKeys: Array.isArray(currentActivity.targetFactorKeys)
      ? currentActivity.targetFactorKeys.filter(
          (factorKey): factorKey is string =>
            typeof factorKey === 'string' && factorKey.trim().length > 0
        )
      : [],
  };
};

export const normalizePairSummary = (
  summary?: PairSummaryInput | null
): PairSummaryDTO | null => {
  const pair = normalizePair(summary?.pair);
  if (!pair) return null;
  return {
    pair,
    members:
      summary?.members?.map(normalizeMember).filter((member): member is PairMember => member !== null) ??
      [],
    peer: normalizeMember(summary?.peer),
    currentActivity: normalizeCurrentActivity(summary?.currentActivity),
    suggestedCount: asFiniteNumber(summary?.suggestedCount),
    hasCurrentWeeklyCheckIn: asBoolean(summary?.hasCurrentWeeklyCheckIn),
    nextStep: normalizeNextStep(summary?.nextStep),
  };
};
