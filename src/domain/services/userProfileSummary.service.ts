import type { DataStatus } from '@/domain/services/vectorScoring.service';

export type ProfileModeKind = 'solo' | 'paired';

export type ProfileModeStatus =
  | 'solo_new'
  | 'solo_with_history'
  | 'paired_active'
  | 'paired_paused';

export type LegacyProfileStatus = 'solo:new' | 'solo:history' | 'paired';

export type ProfileMode = {
  kind: ProfileModeKind;
  status: ProfileModeStatus;
  label: string;
  description: string;
};

export type ProfilePairStatus = 'active' | 'paused' | 'ended';

export type ProfilePairInput = {
  id: string;
  status: ProfilePairStatus;
  createdAt?: Date | string;
};

export type RelationshipContext = {
  currentPair: null | {
    id: string;
    status: 'active' | 'paused';
    since: string;
    daysTogether: number;
  };
  hasPairHistory: boolean;
};

export type ProfileCompletionLevel = 'empty' | 'basic' | 'good' | 'strong';

export type ProfileCompletionMissingItem = {
  key: string;
  label: string;
  href: string;
};

type CompletionSection = {
  score: number;
  completed: boolean;
  missing: string[];
};

export type ProfileCompletion = {
  score: number;
  level: ProfileCompletionLevel;
  missing: ProfileCompletionMissingItem[];
  sections: {
    account: CompletionSection;
    matchCard: CompletionSection & {
      isActive: boolean;
    };
    preferences: CompletionSection;
    passport: CompletionSection;
    pairContext?: CompletionSection;
  };
};

export type ProfileNextStepKind =
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

export type ProfileNextStep = {
  kind: ProfileNextStepKind;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  priority: 1 | 2 | 3;
};

type PersonalInput = Partial<{
  gender: 'male' | 'female';
  age: number;
  city: string;
  relationshipStatus: 'seeking' | 'in_relationship';
}>;

type PreferencesInput = Partial<{
  desiredAgeRange: Partial<{
    min: number;
    max: number;
  }>;
  maxDistanceKm: number;
}>;

type MatchCardInput = Partial<{
  requirements: string[];
  give: string[];
  questions: string[];
  isActive: boolean;
}>;

export type PassportCompletionAxisInput = {
  dataStatus: DataStatus;
  confidence: number;
  evidenceCount: number;
};

export type ProfileCompletionInput = {
  mode: ProfileMode;
  relationshipContext: RelationshipContext;
  personal?: PersonalInput;
  preferences?: PreferencesInput;
  matchCard?: MatchCardInput | null;
  passportAxes: Record<string, PassportCompletionAxisInput>;
};

const trim = (value: string | undefined): string => value?.trim() ?? '';

const hasText = (value: string | undefined): boolean => trim(value).length > 0;

const finiteNumber = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

const scoreFromChecks = (checks: boolean[]): number => {
  if (checks.length === 0) return 0;
  const passed = checks.filter(Boolean).length;
  return clampPercent((passed / checks.length) * 100);
};

const toDate = (value: Date | string | undefined): Date => {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const toIso = (value: Date | string | undefined): string => toDate(value).toISOString();

export const buildRelationshipContext = (input: {
  activeOrPausedPair: ProfilePairInput | null;
  lastAnyPair: ProfilePairInput | null;
  now?: Date;
}): RelationshipContext => {
  const pair = input.activeOrPausedPair;
  const now = input.now ?? new Date();
  const since = pair ? toDate(pair.createdAt) : null;
  const currentStatus =
    pair?.status === 'active' || pair?.status === 'paused' ? pair.status : null;

  return {
    currentPair:
      pair && since && currentStatus
        ? {
            id: pair.id,
            status: currentStatus,
            since: since.toISOString(),
            daysTogether: Math.max(
              0,
              Math.floor((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000))
            ),
          }
        : null,
    hasPairHistory: Boolean(pair ?? input.lastAnyPair),
  };
};

export const buildProfileMode = (
  relationshipContext: RelationshipContext
): ProfileMode => {
  const currentPair = relationshipContext.currentPair;
  if (currentPair?.status === 'active') {
    return {
      kind: 'paired',
      status: 'paired_active',
      label: 'В активной паре',
      description: 'У тебя есть активная пара. Основные действия доступны в профиле пары.',
    };
  }

  if (currentPair?.status === 'paused') {
    return {
      kind: 'paired',
      status: 'paired_paused',
      label: 'Пара на паузе',
      description: 'Пара существует, но сейчас находится на паузе.',
    };
  }

  if (relationshipContext.hasPairHistory) {
    return {
      kind: 'solo',
      status: 'solo_with_history',
      label: 'Сейчас без активной пары',
      description: 'Можно обновить профиль и вернуться к поиску, когда будешь готов.',
    };
  }

  return {
    kind: 'solo',
    status: 'solo_new',
    label: 'Профиль ещё настраивается',
    description: 'Заполни базовые данные и карточку, чтобы начать пользоваться продуктом.',
  };
};

export const toLegacyProfileStatus = (profileMode: ProfileMode): LegacyProfileStatus => {
  if (profileMode.kind === 'paired') return 'paired';
  return profileMode.status === 'solo_with_history' ? 'solo:history' : 'solo:new';
};

const buildAccountSection = (personal: PersonalInput | undefined): CompletionSection => {
  const age = finiteNumber(personal?.age);
  const checks = {
    gender: personal?.gender === 'male' || personal?.gender === 'female',
    age: age !== null && age >= 18 && age <= 99,
    city: hasText(personal?.city),
    relationshipStatus:
      personal?.relationshipStatus === 'seeking' ||
      personal?.relationshipStatus === 'in_relationship',
  };
  const missing = [
    checks.gender ? '' : 'Пол',
    checks.age ? '' : 'Возраст',
    checks.city ? '' : 'Город',
    checks.relationshipStatus ? '' : 'Статус отношений',
  ].filter(hasText);

  return {
    score: scoreFromChecks(Object.values(checks)),
    completed: missing.length === 0,
    missing,
  };
};

const hasFilledItems = (items: string[] | undefined, count: number): boolean =>
  (items ?? []).slice(0, count).filter((item) => hasText(item)).length >= count;

const buildMatchCardSection = (
  matchCard: MatchCardInput | null | undefined
): CompletionSection & { isActive: boolean } => {
  const exists = Boolean(matchCard);
  const checks = {
    exists,
    requirements: hasFilledItems(matchCard?.requirements, 3),
    give: hasFilledItems(matchCard?.give, 3),
    questions: hasFilledItems(matchCard?.questions, 2),
  };
  const missing = [
    checks.exists ? '' : 'Создать карточку',
    checks.requirements ? '' : '3 ожидания',
    checks.give ? '' : '3 вклада',
    checks.questions ? '' : '2 вопроса',
  ].filter(hasText);

  return {
    score: scoreFromChecks(Object.values(checks)),
    completed: missing.length === 0,
    missing,
    isActive: matchCard?.isActive === true,
  };
};

const buildPreferencesSection = (
  preferences: PreferencesInput | undefined
): CompletionSection => {
  const min = finiteNumber(preferences?.desiredAgeRange?.min);
  const max = finiteNumber(preferences?.desiredAgeRange?.max);
  const maxDistanceKm = finiteNumber(preferences?.maxDistanceKm);
  const checks = {
    desiredAgeRange: min !== null && max !== null,
    validAgeRange: min !== null && max !== null && min >= 18 && max >= min,
    maxDistanceKm: maxDistanceKm !== null && maxDistanceKm > 0,
  };
  const missing = [
    checks.desiredAgeRange ? '' : 'Возраст партнёра',
    checks.validAgeRange ? '' : 'Корректный возрастной диапазон',
    checks.maxDistanceKm ? '' : 'Радиус поиска',
  ].filter(hasText);

  return {
    score: scoreFromChecks(Object.values(checks)),
    completed: missing.length === 0,
    missing,
  };
};

const buildPassportSection = (
  passportAxes: Record<string, PassportCompletionAxisInput>
): CompletionSection => {
  const axes = Object.values(passportAxes);
  const axesWithData = axes.filter(
    (axis) =>
      axis.dataStatus !== 'missing' ||
      axis.confidence > 0 ||
      axis.evidenceCount > 0
  ).length;
  const completed = axesWithData >= 3;

  return {
    score: clampPercent((axesWithData / Math.max(axes.length, 1)) * 100),
    completed,
    missing: completed ? [] : ['Минимум 3 оси с данными'],
  };
};

const levelFromScore = (score: number): ProfileCompletionLevel => {
  if (score >= 85) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 25) return 'basic';
  return 'empty';
};

const buildMissingItems = (input: {
  completion: Omit<ProfileCompletion, 'missing'>;
  mode: ProfileMode;
  relationshipContext: RelationshipContext;
}): ProfileCompletionMissingItem[] => {
  const pairHref = input.relationshipContext.currentPair
    ? `/pair/${input.relationshipContext.currentPair.id}`
    : '/profile/profile';
  const candidates: ProfileCompletionMissingItem[] = [];

  if (!input.completion.sections.account.completed) {
    candidates.push({
      key: 'account',
      label: 'Заполнить базовые данные',
      href: '/profile/profile',
    });
  }
  if (input.mode.kind === 'solo' && !input.completion.sections.matchCard.completed) {
    candidates.push({
      key: 'matchCard',
      label: 'Создать карточку знакомства',
      href: '/match-card/create',
    });
  }
  if (!input.completion.sections.passport.completed) {
    candidates.push({
      key: 'passport',
      label: 'Пройти анкету для паспорта',
      href: '/questionnaires',
    });
  }
  if (!input.completion.sections.preferences.completed) {
    candidates.push({
      key: 'preferences',
      label: 'Настроить предпочтения',
      href: '/profile/settings',
    });
  }
  if (input.mode.kind === 'paired' && !input.completion.sections.pairContext?.completed) {
    candidates.push({
      key: 'pairContext',
      label: 'Открыть профиль пары',
      href: pairHref,
    });
  }

  return candidates.slice(0, 5);
};

export const buildProfileCompletion = (
  input: ProfileCompletionInput
): ProfileCompletion => {
  const account = buildAccountSection(input.personal);
  const matchCard = buildMatchCardSection(input.matchCard);
  const preferences = buildPreferencesSection(input.preferences);
  const passport = buildPassportSection(input.passportAxes);
  const pairContext =
    input.mode.kind === 'paired'
      ? {
          score: input.relationshipContext.currentPair ? 100 : 0,
          completed: Boolean(input.relationshipContext.currentPair),
          missing: input.relationshipContext.currentPair ? [] : ['Текущая пара'],
        }
      : undefined;

  const score =
    input.mode.kind === 'paired'
      ? clampPercent(
          account.score * 0.25 +
            (pairContext?.score ?? 0) * 0.25 +
            passport.score * 0.3 +
            preferences.score * 0.2
        )
      : clampPercent(
          account.score * 0.3 +
            matchCard.score * 0.3 +
            preferences.score * 0.2 +
            passport.score * 0.2
        );
  const completionWithoutMissing = {
    score,
    level: levelFromScore(score),
    sections: {
      account,
      matchCard,
      preferences,
      passport,
      ...(pairContext ? { pairContext } : {}),
    },
  };

  return {
    ...completionWithoutMissing,
    missing: buildMissingItems({
      completion: completionWithoutMissing,
      mode: input.mode,
      relationshipContext: input.relationshipContext,
    }),
  };
};

export const buildProfileNextStep = (input: {
  mode: ProfileMode;
  completion: ProfileCompletion;
  relationshipContext: RelationshipContext;
}): ProfileNextStep => {
  const currentPair = input.relationshipContext.currentPair;

  if (input.mode.status === 'paired_paused' && currentPair) {
    return {
      kind: 'resume_pair',
      title: 'Пара на паузе',
      description:
        'Профиль пары сохранён. Можно вернуться к нему и продолжить, когда будете готовы.',
      href: `/pair/${currentPair.id}`,
      ctaLabel: 'Открыть пару',
      priority: 1,
    };
  }

  if (input.mode.status === 'paired_active' && currentPair) {
    return {
      kind: 'open_pair',
      title: 'Открой профиль пары',
      description:
        'Там видны weekly check-in, события пары, активность и состояние отношений.',
      href: `/pair/${currentPair.id}`,
      ctaLabel: 'Открыть пару',
      priority: 1,
    };
  }

  if (!input.completion.sections.account.completed) {
    return {
      kind: 'complete_account',
      title: 'Заполни базовые данные',
      description: 'Это поможет профилю корректно работать в поиске и личном обзоре.',
      href: '/profile/profile',
      ctaLabel: 'Заполнить профиль',
      priority: 1,
    };
  }

  if (!input.completion.sections.matchCard.completed) {
    return {
      kind: 'create_match_card',
      title: 'Создай карточку знакомства',
      description: 'Так потенциальный партнёр поймёт, чего ты ждёшь и что готов дать.',
      href: '/match-card/create',
      ctaLabel: 'Создать карточку',
      priority: 1,
    };
  }

  if (!input.completion.sections.passport.completed) {
    return {
      kind: 'questionnaire',
      title: 'Пройди первую анкету',
      description: 'Анкета даст профилю первые данные для паспорта и рекомендаций.',
      href: '/questionnaires',
      ctaLabel: 'Открыть анкеты',
      priority: 2,
    };
  }

  return {
    kind: 'open_search',
    title: 'Перейди к поиску',
    description: 'Профиль готов к следующему шагу: можно смотреть подходящих людей.',
    href: '/search',
    ctaLabel: 'Искать пару',
    priority: 3,
  };
};

export const normalizePairInput = (
  pair: { id: string; status: ProfilePairStatus; createdAt?: Date | string } | null
): ProfilePairInput | null =>
  pair
    ? {
        id: pair.id,
        status: pair.status,
        createdAt: toIso(pair.createdAt),
      }
    : null;
