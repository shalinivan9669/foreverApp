import type { RelationshipLens } from '@/domain/services/relationshipLens.service';
import type {
  PersonalTodayFocus,
  PersonalTodayMetrics,
} from '@/domain/services/personalTodayRules.service';

export type PersonalTodayPairContext = {
  hasPair: boolean;
  label: string;
};

export type PersonalTodayCopy = {
  hero: {
    title: string;
    subtitle: string;
    hints: string[];
  };
  quickCards: Array<{
    key: 'state' | 'need' | 'influence' | 'resource' | 'contribution' | 'risk';
    title: string;
    body: string;
    icon: string;
  }>;
  partnerSignal: {
    title: string;
    text: string;
  };
  softOption: {
    title: string;
    intro: string;
    phrase: string;
    alternatives: string[];
    primaryCta: string;
    secondaryCta: string;
  };
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
};

export type PersonalTodayCopyInput = {
  lens: RelationshipLens;
  focus: PersonalTodayFocus;
  metrics: PersonalTodayMetrics;
  userName: string;
  pairContext: PersonalTodayPairContext;
};

const percentValue = (value: number): number => Math.max(0, Math.min(1, value));

const hintsForFocus = (
  focus: PersonalTodayFocus,
  metrics: PersonalTodayMetrics
): string[] => {
  if (focus.mode === 'low_data') {
    return [
      'Можно отметить состояние за 30 секунд',
      'Дневник останется только для тебя',
    ];
  }
  if (focus.mode === 'repair') {
    return [
      'Начать лучше с короткой фразы',
      'Детали можно оставить личными',
    ];
  }
  if (focus.mode === 'conflict_risk') {
    return [
      'Лучше без резкого входа в сложные темы',
      `Напряжение ${Math.round(metrics.tension * 100)}%`,
    ];
  }
  if (focus.mode === 'low_resource') {
    return [
      `Ресурс ${Math.round(metrics.resource * 100)}%`,
      'Лучше без тяжёлых тем',
    ];
  }
  if (focus.mode === 'closeness') {
    return [
      `Близость ${Math.round(metrics.closeness * 100)}%`,
      'Можно выбрать тёплый контакт',
    ];
  }
  if (focus.mode === 'growth') {
    return [
      'Есть ресурс на маленький шаг',
      'Подойдёт спокойный разговор',
    ];
  }
  return [
    `Ресурс ${Math.round(metrics.resource * 100)}%`,
    'Подойдёт спокойный темп',
  ];
};

const feminineCards = (
  focus: PersonalTodayFocus
): PersonalTodayCopy['quickCards'] => {
  if (focus.mode === 'low_resource' || focus.mode === 'closeness') {
    return [
      {
        key: 'state',
        title: 'Моё состояние',
        body: 'Устала, хочется спокойствия и ощущения, что меня видят.',
        icon: 'heart',
      },
      {
        key: 'need',
        title: 'Что мне важно',
        body: 'Без давления и советов. Лучше обнять, выслушать, побыть рядом.',
        icon: 'hand',
      },
      {
        key: 'influence',
        title: 'Что влияет',
        body: 'Недосып, много дел, накопилась усталость.',
        icon: 'cloud',
      },
    ];
  }

  return [
    {
      key: 'state',
      title: 'Моё состояние',
      body: 'Сегодня полезно заметить свой темп и не торопить себя.',
      icon: 'heart',
    },
    {
      key: 'need',
      title: 'Что мне важно',
      body: 'Мягкий контакт, ясная фраза и возможность оставить часть внутри.',
      icon: 'hand',
    },
    {
      key: 'influence',
      title: 'Что влияет',
      body: 'Ресурс, напряжение и готовность говорить сегодня могут меняться.',
      icon: 'cloud',
    },
  ];
};

const masculineCards = (): PersonalTodayCopy['quickCards'] => [
  {
    key: 'resource',
    title: 'Мой ресурс',
    body: 'Силы средние. Лучше не заходить в спор на автомате.',
    icon: 'battery',
  },
  {
    key: 'contribution',
    title: 'Мой вклад',
    body: 'Сегодня может сработать один заметный жест заботы.',
    icon: 'hand',
  },
  {
    key: 'risk',
    title: 'Риск дня',
    body: 'Можно уйти в молчание или начать решать вместо того, чтобы услышать.',
    icon: 'alert',
  },
];

const balancedCards = (): PersonalTodayCopy['quickCards'] => [
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
];

const partnerSignalText = (
  lens: RelationshipLens,
  focus: PersonalTodayFocus
): string => {
  if (lens.type === 'feminine') {
    if (focus.mode === 'repair') {
      return 'Я хочу начать мягко. Мне важно быть рядом без спешки и давления.';
    }
    return 'Я сегодня немного уставшая. Мне было бы тепло, если бы мы просто побыли рядом.';
  }

  if (lens.type === 'masculine') {
    if (focus.mode === 'repair') {
      return 'Я хочу спокойно восстановить контакт. Давай начнём с короткой фразы.';
    }
    return 'Я сегодня немного перегружен, но я рядом. Давай вечером спокойно побудем вместе.';
  }

  if (focus.mode === 'repair') {
    return 'Мне хочется начать мягко и без спешки. Можно просто свериться друг с другом.';
  }
  if (focus.mode === 'conflict_risk') {
    return 'Сегодня я могу быть чувствительнее обычного. Мне поможет спокойный и короткий контакт.';
  }
  return 'Мне хочется немного тепла и спокойного контакта. Можно вечером просто побыть рядом.';
};

const softPhrase = (
  lens: RelationshipLens,
  focus: PersonalTodayFocus
): { phrase: string; alternatives: string[] } => {
  if (lens.type === 'masculine') {
    return {
      phrase: 'Я рядом. Хочешь, я просто послушаю?',
      alternatives: [
        'Давай спокойно побудем вместе вечером.',
        'Мне важно быть с тобой в контакте, без спешки.',
      ],
    };
  }

  if (lens.type === 'feminine') {
    return {
      phrase: 'Мне хочется немного побыть рядом с тобой.',
      alternatives: [
        'Мне сейчас было бы тепло от спокойного контакта.',
        'Если захочется, давай просто побудем рядом.',
      ],
    };
  }

  if (focus.mode === 'repair') {
    return {
      phrase: 'Можно начать с одной спокойной фразы и не торопиться дальше.',
      alternatives: [
        'Мне хочется восстановить контакт бережно.',
        'Давай начнём с короткой сверки.',
      ],
    };
  }

  return {
    phrase: 'Можно попробовать один мягкий вариант контакта.',
    alternatives: [
      'Если захочется контакта, можно начать с одной простой фразы.',
      'Можно оставить это только для себя.',
    ],
  };
};

export const buildPersonalTodayCopy = (
  input: PersonalTodayCopyInput
): PersonalTodayCopy => {
  const quickCards =
    input.lens.type === 'feminine'
      ? feminineCards(input.focus)
      : input.lens.type === 'masculine'
        ? masculineCards()
        : balancedCards();
  const soft = softPhrase(input.lens, input.focus);

  return {
    hero: {
      title: input.focus.title,
      subtitle: input.focus.subtitle,
      hints: hintsForFocus(input.focus, input.metrics),
    },
    quickCards,
    partnerSignal: {
      title: input.pairContext.hasPair ? 'Сигнал партнёру' : 'Фраза для себя',
      text: partnerSignalText(input.lens, input.focus),
    },
    softOption: {
      title: 'Мягкий вариант',
      intro: 'Один бережный вариант на сегодня.',
      phrase: soft.phrase,
      alternatives: soft.alternatives,
      primaryCta: 'Выбрать фразу',
      secondaryCta: 'Оставить себе',
    },
    todayMap: [
      { key: 'resource', label: 'Ресурс', value: percentValue(input.metrics.resource) },
      { key: 'closeness', label: 'Близость', value: percentValue(input.metrics.closeness) },
      { key: 'stress', label: 'Стресс', value: percentValue(input.metrics.tension) },
      { key: 'support', label: 'Поддержка', value: percentValue(input.metrics.supportNeed) },
      {
        key: 'conversation',
        label: 'Разговор',
        value: percentValue(input.metrics.conversationReadiness),
      },
      {
        key: 'irritation',
        label: 'Раздражение',
        value: percentValue(input.metrics.irritationRisk),
      },
    ],
  };
};
