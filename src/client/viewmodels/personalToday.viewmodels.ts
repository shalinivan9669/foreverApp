import type {
  PersonalTodayDataStatus,
  PersonalTodayDTO,
} from '@/client/api/types';

type PersonalTodayInput = Partial<PersonalTodayDTO> | null | undefined;

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(clamp01(value) * 100)));

const normalizeMetric = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : null;

const asString = (value: string | undefined | null): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const currentDateKey = (): string => new Date().toISOString().slice(0, 10);

const currentDateLabel = (): string =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

const safeFallback = (): PersonalTodayDTO => ({
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
      'Видно только вам. Другой человек увидит только явно отправленную фразу.',
  },
  pairContext: {
    hasPair: false,
    label: 'Пара пока не активна',
  },
  dataStatus: {
    overall: 'MISSING',
    metricGroups: {
      resource: 'MISSING',
      connection: 'MISSING',
    },
  },
  hero: {
    mode: 'low_data',
    title: 'Для фокуса дня пока недостаточно данных',
    subtitle: 'Отметьте своё состояние, чтобы увидеть личную сводку без догадок',
    rings: {},
    hints: [
      'Числовые выводы появятся только после вашей отметки',
      'Дневник останется только для вас',
    ],
  },
  quickCards: [],
  partnerSignal: {
    available: false,
    title: 'Сигнал партнёру',
    text: '',
    visibility: 'disabled',
    primaryCta: 'Отправить',
    secondaryCta: 'Оставить себе',
  },
  softOption: null,
  todayMap: [],
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

const normalizeDataStatus = (
  value: PersonalTodayDataStatus | undefined
): PersonalTodayDataStatus =>
  value === 'AVAILABLE' || value === 'INSUFFICIENT' ? value : 'MISSING';

const overallStatus = (
  resource: PersonalTodayDataStatus,
  connection: PersonalTodayDataStatus
): PersonalTodayDataStatus => {
  if (resource === 'AVAILABLE' && connection === 'AVAILABLE') return 'AVAILABLE';
  if (resource === 'MISSING' && connection === 'MISSING') return 'MISSING';
  return 'INSUFFICIENT';
};

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

export const normalizePersonalToday = (
  input?: Partial<PersonalTodayDTO> | null
): PersonalTodayDTO | null => {
  if (!input) return null;

  const fallback = safeFallback();
  const resource = normalizeMetric(input.hero?.rings?.resource);
  const closeness = normalizeMetric(input.hero?.rings?.closeness);
  const tension = normalizeMetric(input.hero?.rings?.tension);
  const requestedResourceStatus = normalizeDataStatus(
    input.dataStatus?.metricGroups.resource
  );
  const requestedConnectionStatus = normalizeDataStatus(
    input.dataStatus?.metricGroups.connection
  );
  const resourceStatus =
    requestedResourceStatus === 'AVAILABLE' && resource === null
      ? 'INSUFFICIENT'
      : requestedResourceStatus;
  const connectionStatus =
    requestedConnectionStatus === 'AVAILABLE' &&
    (closeness === null || tension === null)
      ? 'INSUFFICIENT'
      : requestedConnectionStatus;
  const dataStatus = overallStatus(resourceStatus, connectionStatus);
  const metricsAvailable = dataStatus === 'AVAILABLE';
  const mode = input.hero?.mode;
  const allowedModes: PersonalTodayDTO['hero']['mode'][] = [
    'stable',
    'low_resource',
    'closeness',
    'conflict_risk',
    'repair',
    'growth',
  ];
  const quickCards = metricsAvailable
    ? input.quickCards
        ?.filter((card) => asString(card.title) && asString(card.body))
        .map((card) => ({
          key: card.key ?? 'state',
          title: card.title,
          body: card.body,
          icon: card.icon ?? 'heart',
        }))
        .slice(0, 3) ?? []
    : [];
  const todayMap = metricsAvailable
    ? input.todayMap
        ?.flatMap((item) => {
          const label = asString(item.label);
          const value = normalizeMetric(item.value);
          return label && value !== null
            ? [{ key: item.key ?? 'resource', label, value }]
            : [];
        })
        .slice(0, 8) ?? []
    : [];
  const softOption = metricsAvailable && input.softOption
    ? {
        title: asString(input.softOption.title) ?? 'Мягкий вариант',
        intro: asString(input.softOption.intro) ?? '',
        phrase: asString(input.softOption.phrase) ?? '',
        alternatives:
          input.softOption.alternatives
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 4),
        primaryCta: asString(input.softOption.primaryCta) ?? 'Выбрать фразу',
        secondaryCta: asString(input.softOption.secondaryCta) ?? 'Оставить себе',
      }
    : null;

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
      label: asString(input.privacy?.label) ?? fallback.privacy.label,
      explanation:
        asString(input.privacy?.explanation) ?? fallback.privacy.explanation,
    },
    pairContext: {
      hasPair: input.pairContext?.hasPair === true,
      pairId: asString(input.pairContext?.pairId),
      status:
        input.pairContext?.status === 'active' ||
        input.pairContext?.status === 'paused'
          ? input.pairContext.status
          : undefined,
      label: asString(input.pairContext?.label) ?? fallback.pairContext.label,
    },
    dataStatus: {
      overall: dataStatus,
      metricGroups: {
        resource: resourceStatus,
        connection: connectionStatus,
      },
    },
    hero: metricsAvailable
      ? {
          mode: mode && allowedModes.includes(mode) ? mode : 'stable',
          title: asString(input.hero?.title) ?? 'Личная сводка на сегодня',
          subtitle: asString(input.hero?.subtitle) ?? '',
          rings: {
            resource: resource ?? undefined,
            closeness: closeness ?? undefined,
            tension: tension ?? undefined,
          },
          hints:
            input.hero?.hints
              ?.map((hint) => hint.trim())
              .filter((hint) => hint.length > 0)
              .slice(0, 3) ?? [],
        }
      : fallback.hero,
    quickCards,
    partnerSignal: {
      available: metricsAvailable && input.partnerSignal?.available === true,
      title: asString(input.partnerSignal?.title) ?? fallback.partnerSignal.title,
      text: asString(input.partnerSignal?.text) ?? '',
      visibility:
        input.partnerSignal?.visibility === 'private_draft' ||
        input.partnerSignal?.visibility === 'sent'
          ? input.partnerSignal.visibility
          : 'disabled',
      primaryCta: asString(input.partnerSignal?.primaryCta) ?? 'Отправить',
      secondaryCta:
        asString(input.partnerSignal?.secondaryCta) ?? 'Оставить себе',
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
    softOption,
    todayMap,
    privateJournal: {
      hasEntry: input.privateJournal?.hasEntry === true,
      text: input.privateJournal?.text,
      placeholder:
        asString(input.privateJournal?.placeholder) ??
        fallback.privateJournal.placeholder,
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
