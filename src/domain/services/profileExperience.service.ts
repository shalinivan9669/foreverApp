import type { PairedProfileState } from '@/domain/services/pairedUserProfileState.service';
import type {
  ProfileCompletion,
  ProfileMode,
  ProfileNextStep,
} from '@/domain/services/userProfileSummary.service';

type QuestionnaireAxis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

export type ExperienceSummary = {
  mode: 'solo' | 'paired';
  tone: 'empty' | 'calm' | 'good' | 'attention' | 'warning';
  title: string;
  message: string;
  reason?: string;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
};

export type PersonalAxisCard = {
  axis: QuestionnaireAxis;
  label: string;
  level: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  status: 'strength' | 'growth' | 'low_data' | 'balanced';
  title: string;
  description: string;
  relationshipImpact: string;
  nextAction?: {
    label: string;
    href: string;
  };
};

export type PartnerHelpfulNotes = {
  visibility: 'private_preview';
  items: string[];
  disclaimer: string;
};

export type NeedsAndBoundariesLite = {
  title: string;
  items: string[];
  source: 'low_data' | 'onboarding' | 'weekly_checkin' | 'passport' | 'mixed';
};

export type ProfileExperience = {
  experienceSummary: ExperienceSummary;
  personalAxisCards: PersonalAxisCard[];
  partnerHelpfulNotes: PartnerHelpfulNotes;
  needsAndBoundariesLite: NeedsAndBoundariesLite;
};

export type ProfileExperienceAxisInput = {
  level: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  positives: string[];
  negatives: string[];
  dataStatus: 'enough' | 'low_confidence' | 'missing';
};

type SeekingInput = Partial<{
  valuedQualities: string[];
  relationshipPriority:
    | 'emotional_intimacy'
    | 'shared_interests'
    | 'financial_stability'
    | 'other';
  dealBreakers: string;
}>;

const AXES: QuestionnaireAxis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
];

const AXIS_COPY: Record<
  QuestionnaireAxis,
  {
    label: string;
    titles: Record<PersonalAxisCard['status'], string>;
    impact: string;
  }
> = {
  communication: {
    label: 'Коммуникация',
    titles: {
      strength: 'Ты можешь быть сильным в прямом разговоре',
      growth: 'Разговоры могут требовать больше мягкости',
      low_data: 'Пока мало данных о коммуникации',
      balanced: 'Коммуникация выглядит без явного перекоса',
    },
    impact: 'Партнёру может быть проще, если важные ожидания проговариваются заранее.',
  },
  domestic: {
    label: 'Быт',
    titles: {
      strength: 'Бытовые договорённости могут даваться тебе легче',
      growth: 'Быт может становиться источником напряжения',
      low_data: 'Пока мало данных о бытовых ожиданиях',
      balanced: 'По быту пока нет сильного перекоса',
    },
    impact: 'Эта зона влияет на ясность повседневных договорённостей в паре.',
  },
  personalViews: {
    label: 'Личные взгляды',
    titles: {
      strength: 'Ценности выглядят достаточно собранно',
      growth: 'Ценности и ожидания лучше уточнять словами',
      low_data: 'Пока мало данных о личных взглядах',
      balanced: 'По личным взглядам нет явного перекоса',
    },
    impact: 'Открытый разговор о ценностях помогает раньше замечать различия в ожиданиях.',
  },
  finance: {
    label: 'Финансы',
    titles: {
      strength: 'В финансовых вопросах может быть больше ясности',
      growth: 'Финансовые ожидания лучше проговаривать заранее',
      low_data: 'Пока мало данных о финансовой оси',
      balanced: 'Финансовая ось выглядит без явного перекоса',
    },
    impact: 'Конкретные договорённости о деньгах снижают пространство для недопонимания.',
  },
  sexuality: {
    label: 'Близость',
    titles: {
      strength: 'В теме близости может быть больше ясности',
      growth: 'Тему близости лучше обсуждать бережно и конкретно',
      low_data: 'Пока мало данных о близости',
      balanced: 'По близости пока нет явного перекоса',
    },
    impact: 'Бережный и конкретный разговор помогает учитывать темп и границы обоих.',
  },
  psyche: {
    label: 'Психика и ресурс',
    titles: {
      strength: 'Ресурс и саморегуляция выглядят устойчивее',
      growth: 'Ресурс может сильнее влиять на стиль общения',
      low_data: 'Пока мало данных о ресурсе',
      balanced: 'По ресурсу нет явного сигнала риска',
    },
    impact: 'В усталости лучше выбирать короткий и спокойный формат разговора.',
  },
};

const DESCRIPTION_BY_STATUS: Record<PersonalAxisCard['status'], string> = {
  strength: 'В ответах по этой теме чаще видны опоры, чем сложности.',
  growth: 'Здесь есть несколько сигналов, которые полезно уточнять без спешки.',
  low_data: 'Нужно больше ответов, прежде чем делать устойчивые выводы.',
  balanced: 'Данные не показывают выраженной сильной стороны или зоны роста.',
};

const toAction = (nextStep: ProfileNextStep): ExperienceSummary['primaryAction'] => ({
  label: nextStep.ctaLabel,
  href: nextStep.href,
});

const pairAction = (
  pairedProfileState: PairedProfileState | null
): ExperienceSummary['secondaryAction'] =>
  pairedProfileState
    ? { label: 'Открыть пару', href: `/pair/${pairedProfileState.pairId}` }
    : undefined;

export const buildExperienceSummary = (input: {
  mode: ProfileMode;
  completion: ProfileCompletion;
  pairedProfileState: PairedProfileState | null;
  nextStep: ProfileNextStep;
}): ExperienceSummary => {
  const primaryAction = toAction(input.nextStep);
  const state = input.pairedProfileState;

  if (input.mode.status === 'paired_paused') {
    return {
      mode: 'paired',
      tone: 'calm',
      title: 'Пара на паузе',
      message: 'Профиль пары сохранён. Можно вернуться к нему, когда будете готовы.',
      primaryAction,
    };
  }

  if (input.mode.kind === 'paired' && state) {
    const secondaryAction = pairAction(state);
    if (!state.myWeeklyCheckIn.submitted) {
      return {
        mode: 'paired',
        tone: 'attention',
        title: 'Сегодня начни с короткой сверки',
        message: 'Без твоего weekly check-in профиль видит только часть состояния пары.',
        reason:
          'Ответ займёт меньше минуты и поможет точнее подобрать следующий шаг.',
        primaryAction: {
          label: 'Пройти check-in',
          href: '/profile#weekly-checkin',
        },
        secondaryAction,
      };
    }

    if (state.resourceMessage.tone === 'tired') {
      return {
        mode: 'paired',
        tone: 'attention',
        title: 'Сегодня лучше беречь ресурс',
        message:
          'Сейчас не лучший момент для тяжёлых разговоров. Выбирай короткое и спокойное действие.',
        reason: state.resourceMessage.description,
        primaryAction,
        secondaryAction,
      };
    }

    if (state.resourceMessage.tone === 'tense') {
      return {
        mode: 'paired',
        tone: 'warning',
        title: 'Сегодня важен мягкий вход в разговор',
        message:
          'Есть признаки напряжения. Лучше начать с короткой сверки без обвинений.',
        reason: 'Один спокойный вопрос может быть полезнее попытки решить всё сразу.',
        primaryAction,
        secondaryAction,
      };
    }

    if (state.contribution.pendingFromMe.length > 0) {
      return {
        mode: 'paired',
        tone: 'attention',
        title: 'Пара ждёт твоего действия',
        message: `Сейчас главное: ${state.contribution.pendingFromMe[0]}.`,
        reason: 'Один короткий шаг лучше, чем пытаться решить всё сразу.',
        primaryAction,
        secondaryAction,
      };
    }

    return {
      mode: 'paired',
      tone: 'good',
      title: 'Сегодня состояние выглядит стабильным',
      message:
        'Основные действия выполнены. Можно спокойно посмотреть профиль пары или выбрать мягкую активность.',
      primaryAction,
      secondaryAction,
    };
  }

  if (input.completion.score < 25) {
    return {
      mode: 'solo',
      tone: 'empty',
      title: 'Профиль только начинается',
      message:
        'Заполни базовые данные, чтобы приложение могло корректно вести тебя дальше.',
      primaryAction,
    };
  }

  if (!input.completion.sections.matchCard.completed) {
    return {
      mode: 'solo',
      tone: 'attention',
      title: 'Тебя пока сложно понять в поиске',
      message:
        'Карточка знакомства помогает показать, чего ты ждёшь и что готов дать.',
      primaryAction,
    };
  }

  if (!input.completion.sections.passport.completed) {
    return {
      mode: 'solo',
      tone: 'calm',
      title: 'Паспорт ещё собирается',
      message:
        'Ответь на несколько вопросов, и профиль начнёт точнее описывать твои сильные стороны и зоны роста.',
      primaryAction,
    };
  }

  return {
    mode: 'solo',
    tone: 'good',
    title: 'Профиль готов к следующему шагу',
    message: 'Можно переходить к поиску или уточнить предпочтения партнёра.',
    primaryAction,
  };
};

const axisStatus = (axis: ProfileExperienceAxisInput): PersonalAxisCard['status'] => {
  if (axis.dataStatus === 'missing' || axis.confidenceLabel === 'low') return 'low_data';
  if (axis.negatives.length >= 2) return 'growth';
  if (axis.positives.length >= 2 && axis.negatives.length <= 1) return 'strength';
  return 'balanced';
};

export const buildPersonalAxisCards = (
  axes: Record<QuestionnaireAxis, ProfileExperienceAxisInput>
): PersonalAxisCard[] =>
  AXES.map((axis) => {
    const value = axes[axis];
    const status = axisStatus(value);
    return {
      axis,
      label: AXIS_COPY[axis].label,
      level: Math.max(0, Math.min(100, Math.round(value.level))),
      confidenceLabel: value.confidenceLabel,
      status,
      title: AXIS_COPY[axis].titles[status],
      description: DESCRIPTION_BY_STATUS[status],
      relationshipImpact: AXIS_COPY[axis].impact,
      ...(status === 'growth' || status === 'low_data'
        ? {
            nextAction: {
              label: 'Пройти анкету',
              href: '/questionnaires',
            },
          }
        : {}),
    };
  });

const unique = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const priorityNote = (priority: SeekingInput['relationshipPriority']): string | null => {
  if (priority === 'emotional_intimacy') return 'Мне важны эмоциональная близость и честный диалог.';
  if (priority === 'shared_interests') return 'Мне важно находить общие интересы и время друг для друга.';
  if (priority === 'financial_stability') return 'Мне полезно заранее обсуждать финансовые ожидания.';
  if (priority === 'other') return 'Мне важно словами уточнять ожидания от отношений.';
  return null;
};

export const buildPartnerHelpfulNotes = (input: {
  mode: ProfileMode;
  pairedProfileState: PairedProfileState | null;
  personalAxisCards: PersonalAxisCard[];
  seeking?: SeekingInput;
}): PartnerHelpfulNotes => {
  const notes: string[] = [];
  const tone = input.pairedProfileState?.resourceMessage.tone;

  if (tone === 'tired') {
    notes.push('Когда ресурс снижен, мне лучше начинать с короткого разговора.');
  } else if (tone === 'tense') {
    notes.push('Сложные темы лучше поднимать мягко, без давления и резкого тона.');
  } else if (tone === 'stable') {
    notes.push('Мне помогают регулярные короткие сверки и понятные договорённости.');
  }

  const growthAxis = input.personalAxisCards.find((card) => card.status === 'growth');
  if (growthAxis) {
    notes.push(`В теме «${growthAxis.label.toLowerCase()}» мне полезны конкретика и спокойный темп.`);
  }

  const strengthAxis = input.personalAxisCards.find((card) => card.status === 'strength');
  if (strengthAxis) {
    notes.push(`В теме «${strengthAxis.label.toLowerCase()}» у меня чаще есть понятная опора.`);
  }

  const priority = priorityNote(input.seeking?.relationshipPriority);
  if (priority) notes.push(priority);

  const qualities = unique(input.seeking?.valuedQualities ?? []);
  if (qualities.length > 0) {
    notes.push('Мне важно заранее называть качества, которые я ценю в отношениях.');
  }

  const items = unique(notes).slice(0, 5);
  return {
    visibility: 'private_preview',
    items:
      items.length > 0
        ? items
        : [
            'Пока данных мало. После нескольких анкет профиль сможет точнее подсказать, как со мной лучше строить контакт.',
          ],
    disclaimer:
      'Пока это видно только тебе. Позже можно будет выбирать, чем делиться с партнёром.',
  };
};

export const buildNeedsAndBoundariesLite = (input: {
  mode: ProfileMode;
  pairedProfileState: PairedProfileState | null;
  personalAxisCards: PersonalAxisCard[];
  seeking?: SeekingInput;
}): NeedsAndBoundariesLite => {
  const tone = input.pairedProfileState?.resourceMessage.tone;
  if (input.mode.kind === 'paired' && tone === 'tired') {
    return {
      title: 'Сейчас мне может быть важно',
      items: [
        'Больше коротких и спокойных действий.',
        'Меньше тяжёлых разговоров без подготовки.',
        'Больше конкретики и меньше давления.',
      ],
      source: 'weekly_checkin',
    };
  }
  if (input.mode.kind === 'paired' && tone === 'tense') {
    return {
      title: 'Сейчас мне может быть важно',
      items: [
        'Начинать сложные темы мягко.',
        'Говорить коротко и без обвинений.',
        'Не пытаться решить всё за один разговор.',
      ],
      source: 'weekly_checkin',
    };
  }
  if (input.mode.kind === 'paired' && tone === 'stable') {
    return {
      title: 'Сейчас мне может быть важно',
      items: [
        'Поддерживать регулярные короткие сверки.',
        'Не откладывать маленькие договорённости.',
        'Выбирать один понятный следующий шаг.',
      ],
      source: 'weekly_checkin',
    };
  }

  const items: string[] = [];
  const qualities = unique(input.seeking?.valuedQualities ?? []);
  if (qualities.length > 0) {
    items.push('Заранее обсуждать качества, которые важны для отношений.');
  }
  const priority = priorityNote(input.seeking?.relationshipPriority);
  if (priority) items.push(priority);
  if (input.seeking?.dealBreakers?.trim()) {
    items.push('Заранее обозначать важные ограничения и ожидания.');
  }

  const growthAxis = input.personalAxisCards.find((card) => card.status === 'growth');
  if (growthAxis) {
    items.push(`Бережно обсуждать тему «${growthAxis.label.toLowerCase()}».`);
  }

  const normalized = unique(items).slice(0, 4);
  if (normalized.length > 0) {
    return {
      title: 'В отношениях мне может быть важно',
      items: normalized,
      source: growthAxis && input.seeking ? 'mixed' : input.seeking ? 'onboarding' : 'passport',
    };
  }

  return {
    title: 'В отношениях мне может быть важно',
    items: [
      'Честный диалог.',
      'Уважение границ.',
      'Готовность обсуждать быт, деньги и ожидания.',
    ],
    source: 'low_data',
  };
};

export const buildProfileExperience = (input: {
  mode: ProfileMode;
  completion: ProfileCompletion;
  pairedProfileState: PairedProfileState | null;
  nextStep: ProfileNextStep;
  axes: Record<QuestionnaireAxis, ProfileExperienceAxisInput>;
  seeking?: SeekingInput;
}): ProfileExperience => {
  const personalAxisCards = buildPersonalAxisCards(input.axes);
  return {
    experienceSummary: buildExperienceSummary(input),
    personalAxisCards,
    partnerHelpfulNotes: buildPartnerHelpfulNotes({
      mode: input.mode,
      pairedProfileState: input.pairedProfileState,
      personalAxisCards,
      seeking: input.seeking,
    }),
    needsAndBoundariesLite: buildNeedsAndBoundariesLite({
      mode: input.mode,
      pairedProfileState: input.pairedProfileState,
      personalAxisCards,
      seeking: input.seeking,
    }),
  };
};
