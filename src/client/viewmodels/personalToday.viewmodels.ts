import type { PersonalTodayDTO } from '@/client/api/types';

type PersonalTodayInput = Partial<PersonalTodayDTO> | null | undefined;

export const clamp01 = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;

export const clampPercent = (value: number | undefined): number =>
  Math.max(0, Math.min(100, Math.round(clamp01(value) * 100)));

const asString = (value: string | undefined | null): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const currentDateKey = (): string => new Date().toISOString().slice(0, 10);

const currentDateLabel = (): string =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

export const createEmptyPersonalToday = (): PersonalTodayDTO => ({
  user: {
    id: '',
    name: 'Друг',
    avatarUrl: null,
    gender: null,
  },
  date: {
    dateKey: currentDateKey(),
    label: currentDateLabel(),
    freshness: 'low_data',
  },
  lens: {
    type: 'balanced',
    source: 'gender_default',
    canChange: true,
  },
  privacy: {
    mode: 'private',
    label: 'Лично',
    explanation:
      'Видно только тебе. Партнёр увидит только явно отправленную фразу. Дневник и детали состояния не отправляются.',
  },
  pairContext: {
    hasPair: false,
    label: 'Пара пока не активна',
  },
  hero: {
    mode: 'low_data',
    title: 'Сегодня можно начать с короткой сверки',
    subtitle: 'Данных пока мало, поэтому лучше выбрать мягкий ориентир',
    rings: {
      resource: 0.5,
      closeness: 0.5,
      tension: 0.25,
    },
    hints: [
      'Можно отметить состояние за 30 секунд',
      'Дневник останется только для тебя',
    ],
  },
  quickCards: [
    {
      key: 'state',
      title: 'Моё состояние',
      body: 'Сегодня полезно начать с честной и короткой сверки с собой.',
      icon: 'heart',
    },
    {
      key: 'need',
      title: 'Что сейчас важно',
      body: 'Мягкий темп, простая фраза и право оставить детали личными.',
      icon: 'hand',
    },
    {
      key: 'influence',
      title: 'Что влияет',
      body: 'Ресурс, напряжение, потребность в близости и готовность говорить.',
      icon: 'cloud',
    },
  ],
  partnerSignal: {
    available: false,
    title: 'Фраза для себя',
    text: 'Мне хочется немного тепла и спокойного контакта. Можно вечером просто побыть рядом.',
    visibility: 'disabled',
    primaryCta: 'Отправить',
    secondaryCta: 'Оставить себе',
  },
  softOption: {
    title: 'Мягкий вариант',
    intro: 'Один бережный вариант на сегодня.',
    phrase: 'Можно попробовать один мягкий вариант контакта.',
    alternatives: [
      'Если захочется контакта, можно начать с одной простой фразы.',
      'Можно оставить это только для себя.',
    ],
    primaryCta: 'Выбрать фразу',
    secondaryCta: 'Оставить себе',
  },
  todayMap: [
    { key: 'resource', label: 'Ресурс', value: 0.5 },
    { key: 'closeness', label: 'Близость', value: 0.5 },
    { key: 'stress', label: 'Стресс', value: 0.25 },
    { key: 'support', label: 'Поддержка', value: 0.5 },
    { key: 'conversation', label: 'Разговор', value: 0.45 },
    { key: 'irritation', label: 'Раздражение', value: 0.2 },
  ],
  privateJournal: {
    hasEntry: false,
    placeholder: 'Что сегодня важно оставить только для себя?',
    maxLength: 2000,
  },
  checkIn: {
    submittedToday: false,
    editable: true,
  },
});

const normalizeLens = (input: PersonalTodayInput): PersonalTodayDTO['lens'] => {
  const type = input?.lens?.type;
  const source = input?.lens?.source;
  return {
    type:
      type === 'feminine' || type === 'masculine' || type === 'custom'
        ? type
        : 'balanced',
    source: source === 'user_setting' ? 'user_setting' : 'gender_default',
    canChange: input?.lens?.canChange !== false,
  };
};

const normalizeHero = (
  input: PersonalTodayInput,
  fallback: PersonalTodayDTO
): PersonalTodayDTO['hero'] => {
  const mode = input?.hero?.mode;
  const allowedModes: PersonalTodayDTO['hero']['mode'][] = [
    'low_data',
    'stable',
    'low_resource',
    'closeness',
    'conflict_risk',
    'repair',
    'growth',
  ];
  return {
    mode: mode && allowedModes.includes(mode) ? mode : fallback.hero.mode,
    title: asString(input?.hero?.title) ?? fallback.hero.title,
    subtitle: asString(input?.hero?.subtitle) ?? fallback.hero.subtitle,
    rings: {
      resource: clamp01(input?.hero?.rings?.resource ?? fallback.hero.rings.resource),
      closeness: clamp01(input?.hero?.rings?.closeness ?? fallback.hero.rings.closeness),
      tension: clamp01(input?.hero?.rings?.tension ?? fallback.hero.rings.tension),
    },
    hints:
      input?.hero?.hints
        ?.map((hint) => hint.trim())
        .filter((hint) => hint.length > 0)
        .slice(0, 3) ?? fallback.hero.hints,
  };
};

export const normalizePersonalToday = (input?: Partial<PersonalTodayDTO> | null): PersonalTodayDTO => {
  const fallback = createEmptyPersonalToday();
  if (!input) return fallback;

  const quickCards =
    input.quickCards
      ?.filter((card) => asString(card.title) && asString(card.body))
      .map((card) => ({
        key: card.key ?? 'state',
        title: card.title,
        body: card.body,
        icon: card.icon ?? 'heart',
      }))
      .slice(0, 3) ?? fallback.quickCards;
  const todayMap =
    input.todayMap
      ?.filter((item) => asString(item.label))
      .map((item) => ({
        key: item.key ?? 'resource',
        label: item.label,
        value: clamp01(item.value),
      }))
      .slice(0, 8) ?? fallback.todayMap;

  return {
    user: {
      id: asString(input.user?.id) ?? fallback.user.id,
      name: asString(input.user?.name) ?? fallback.user.name,
      avatarUrl: input.user?.avatarUrl ?? fallback.user.avatarUrl,
      gender:
        input.user?.gender === 'male' || input.user?.gender === 'female'
          ? input.user.gender
          : null,
    },
    date: {
      dateKey: asString(input.date?.dateKey) ?? fallback.date.dateKey,
      label: asString(input.date?.label) ?? fallback.date.label,
      freshness:
        input.date?.freshness === 'today' ||
        input.date?.freshness === 'stale' ||
        input.date?.freshness === 'weekly_fallback' ||
        input.date?.freshness === 'profile_fallback'
          ? input.date.freshness
          : 'low_data',
    },
    lens: normalizeLens(input),
    privacy: {
      mode: 'private',
      label: asString(input.privacy?.label) ?? 'Лично',
      explanation: asString(input.privacy?.explanation) ?? fallback.privacy.explanation,
    },
    pairContext: {
      hasPair: input.pairContext?.hasPair === true,
      pairId: asString(input.pairContext?.pairId),
      status:
        input.pairContext?.status === 'active' || input.pairContext?.status === 'paused'
          ? input.pairContext.status
          : undefined,
      warmth:
        typeof input.pairContext?.warmth === 'number'
          ? clamp01(input.pairContext.warmth)
          : undefined,
      label: asString(input.pairContext?.label) ?? fallback.pairContext.label,
    },
    hero: normalizeHero(input, fallback),
    quickCards,
    partnerSignal: {
      available: input.partnerSignal?.available === true,
      title: asString(input.partnerSignal?.title) ?? fallback.partnerSignal.title,
      text: asString(input.partnerSignal?.text) ?? fallback.partnerSignal.text,
      visibility:
        input.partnerSignal?.visibility === 'private_draft' ||
        input.partnerSignal?.visibility === 'sent'
          ? input.partnerSignal.visibility
          : 'disabled',
      primaryCta: asString(input.partnerSignal?.primaryCta) ?? 'Отправить',
      secondaryCta: asString(input.partnerSignal?.secondaryCta) ?? 'Оставить себе',
      sentAt: asString(input.partnerSignal?.sentAt),
    },
    ...(input.incomingPartnerSignal
      ? {
          incomingPartnerSignal: {
            id: asString(input.incomingPartnerSignal.id) ?? '',
            from: {
              id: asString(input.incomingPartnerSignal.from.id) ?? '',
              username:
                asString(input.incomingPartnerSignal.from.username) ?? 'Партнёр',
              avatarUrl: input.incomingPartnerSignal.from.avatarUrl ?? null,
            },
            text: asString(input.incomingPartnerSignal.text) ?? '',
            tone: input.incomingPartnerSignal.tone ?? 'neutral',
            createdAt: asString(input.incomingPartnerSignal.createdAt),
          },
        }
      : {}),
    softOption: {
      title: asString(input.softOption?.title) ?? fallback.softOption.title,
      intro: asString(input.softOption?.intro) ?? fallback.softOption.intro,
      phrase: asString(input.softOption?.phrase) ?? fallback.softOption.phrase,
      alternatives:
        input.softOption?.alternatives
          ?.map((item) => item.trim())
          .filter((item) => item.length > 0)
          .slice(0, 4) ?? fallback.softOption.alternatives,
      primaryCta: asString(input.softOption?.primaryCta) ?? fallback.softOption.primaryCta,
      secondaryCta:
        asString(input.softOption?.secondaryCta) ?? fallback.softOption.secondaryCta,
    },
    todayMap,
    privateJournal: {
      hasEntry: input.privateJournal?.hasEntry === true,
      text: input.privateJournal?.text,
      placeholder:
        asString(input.privateJournal?.placeholder) ?? fallback.privateJournal.placeholder,
      maxLength:
        typeof input.privateJournal?.maxLength === 'number'
          ? Math.max(1, Math.min(2000, Math.round(input.privateJournal.maxLength)))
          : fallback.privateJournal.maxLength,
    },
    checkIn: {
      id: asString(input.checkIn?.id),
      submittedToday: input.checkIn?.submittedToday === true,
      editable: input.checkIn?.editable !== false,
    },
  };
};
