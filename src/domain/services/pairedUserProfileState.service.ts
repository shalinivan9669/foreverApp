import type {
  ProfileCompletion,
  ProfileMode,
  ProfileNextStep,
} from '@/domain/services/userProfileSummary.service';
import type { PairWeeklyCheckInSummaryDTO } from '@/domain/services/weeklyCheckIn.service';

export type PairedProfileState = {
  pairId: string;
  pairStatus: 'active' | 'paused';
  myWeeklyCheckIn: {
    weekKey: string;
    submitted: boolean;
    submittedAt?: string;
    readiness?: number;
    fatigue?: number;
    closeness?: number;
    irritation?: number;
  };
  pairWeeklyCheckIn: {
    peerSubmitted: boolean;
    bothSubmitted: boolean;
    hasDivergence: boolean;
    status: 'missing' | 'partial' | 'complete' | 'divergent';
  };
  myActivityState: {
    hasCurrentActivity: boolean;
    currentActivityId?: string;
    currentActivityTitle?: string;
    status?: string;
    awaitsMyFeedback: boolean;
    awaitsPartnerFeedback: boolean;
  };
  contribution: {
    score: number;
    level: 'low' | 'stable' | 'strong';
    completedThisWeek: string[];
    pendingFromMe: string[];
    message: string;
  };
  resourceMessage: {
    tone: 'stable' | 'tired' | 'tense' | 'low_data';
    title: string;
    description: string;
  };
};

export type PairedActivityStateInput = {
  hasCurrentActivity: boolean;
  currentActivityId?: string;
  currentActivityTitle?: string;
  status?: string;
  currentUserRole?: 'A' | 'B';
  submittedBy?: Array<'A' | 'B'>;
};

const clamp01 = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

const compactStrings = (items: string[]): string[] =>
  items.map((item) => item.trim()).filter((item) => item.length > 0);

const feedbackStatuses = new Set(['awaiting_checkin', 'completed_partial']);

export const buildMyActivityState = (
  input: PairedActivityStateInput | null
): PairedProfileState['myActivityState'] => {
  if (!input?.hasCurrentActivity) {
    return {
      hasCurrentActivity: false,
      awaitsMyFeedback: false,
      awaitsPartnerFeedback: false,
    };
  }

  const submittedBy = new Set(input.submittedBy ?? []);
  const canCheckFeedback = Boolean(input.currentUserRole);
  const partnerRole = input.currentUserRole === 'A' ? 'B' : input.currentUserRole === 'B' ? 'A' : undefined;
  const statusNeedsFeedback = input.status ? feedbackStatuses.has(input.status) : false;

  return {
    hasCurrentActivity: true,
    currentActivityId: input.currentActivityId,
    currentActivityTitle: input.currentActivityTitle,
    status: input.status,
    awaitsMyFeedback:
      statusNeedsFeedback && canCheckFeedback && !submittedBy.has(input.currentUserRole as 'A' | 'B'),
    awaitsPartnerFeedback:
      statusNeedsFeedback && Boolean(partnerRole) && !submittedBy.has(partnerRole as 'A' | 'B'),
  };
};

export const buildResourceMessage = (input: {
  submitted: boolean;
  readiness?: number;
  fatigue?: number;
  irritation?: number;
  closeness?: number;
}): PairedProfileState['resourceMessage'] => {
  if (!input.submitted) {
    return {
      tone: 'low_data',
      title: 'Мало данных о состоянии',
      description:
        'Пройди weekly check-in, чтобы профиль точнее показал твой ресурс в отношениях.',
    };
  }

  const readiness = clamp01(input.readiness);
  const fatigue = clamp01(input.fatigue);
  const irritation = clamp01(input.irritation);

  if ((fatigue !== undefined && fatigue >= 0.75) || (readiness !== undefined && readiness <= 0.35)) {
    return {
      tone: 'tired',
      title: 'Ресурс снижен',
      description:
        'Сейчас лучше выбирать короткие и спокойные действия без тяжёлых разговоров.',
    };
  }

  if (irritation !== undefined && irritation >= 0.65) {
    return {
      tone: 'tense',
      title: 'Есть напряжение',
      description:
        'Лучше не заходить в сложные темы резко. Начни с короткой сверки без обвинений.',
    };
  }

  return {
    tone: 'stable',
    title: 'Состояние стабильное',
    description:
      'Можно брать мягкую активность, разговор или небольшой совместный шаг.',
  };
};

export const buildContribution = (input: {
  myWeeklySubmitted: boolean;
  bothSubmitted: boolean;
  awaitsMyFeedback: boolean;
}): PairedProfileState['contribution'] => {
  const completedThisWeek = compactStrings([
    input.myWeeklySubmitted ? 'Weekly check-in сдан' : '',
  ]);
  const pendingFromMe = compactStrings([
    input.myWeeklySubmitted ? '' : 'Пройти weekly check-in',
    input.awaitsMyFeedback ? 'Оставить feedback по активности' : '',
  ]);
  const score = clampPercent(
    (input.myWeeklySubmitted ? 40 : 0) +
      (input.bothSubmitted ? 20 : 0) +
      (pendingFromMe.length === 0 ? 20 : 0) +
      (completedThisWeek.length > 0 ? 20 : 0)
  );
  const level =
    score >= 75 ? 'strong' : score >= 40 ? 'stable' : 'low';

  const message =
    level === 'strong'
      ? 'На этой неделе твой вклад стабильный: основные действия выполнены.'
      : level === 'stable'
        ? 'Базовое участие есть. Проверь, не осталось ли действий по активности.'
        : 'Пара сейчас ждёт твоего участия. Начни с короткого weekly check-in.';

  return {
    score,
    level,
    completedThisWeek,
    pendingFromMe,
    message,
  };
};

export const buildPairedProfileState = (input: {
  pairId: string;
  pairStatus: 'active' | 'paused';
  weeklySummary: PairWeeklyCheckInSummaryDTO | null;
  myActivityState: PairedProfileState['myActivityState'];
}): PairedProfileState => {
  const currentUser = input.weeklySummary?.currentUser;
  const myWeeklySubmitted = currentUser?.submitted === true;
  const pairStatus = input.weeklySummary?.pair.status ?? 'missing';
  const contribution = buildContribution({
    myWeeklySubmitted,
    bothSubmitted: input.weeklySummary?.pair.bothSubmitted === true,
    awaitsMyFeedback: input.myActivityState.awaitsMyFeedback,
  });

  return {
    pairId: input.pairId,
    pairStatus: input.pairStatus,
    myWeeklyCheckIn: {
      weekKey: input.weeklySummary?.weekKey ?? '',
      submitted: myWeeklySubmitted,
      submittedAt: currentUser?.updatedAt,
      readiness: clamp01(currentUser?.readiness),
      fatigue: clamp01(currentUser?.fatigue),
      closeness: clamp01(currentUser?.closeness),
      irritation: clamp01(currentUser?.irritation),
    },
    pairWeeklyCheckIn: {
      peerSubmitted: input.weeklySummary?.peer.submitted === true,
      bothSubmitted: input.weeklySummary?.pair.bothSubmitted === true,
      hasDivergence: input.weeklySummary?.pair.hasDivergence === true,
      status: pairStatus,
    },
    myActivityState: input.myActivityState,
    contribution,
    resourceMessage: buildResourceMessage({
      submitted: myWeeklySubmitted,
      readiness: currentUser?.readiness,
      fatigue: currentUser?.fatigue,
      closeness: currentUser?.closeness,
      irritation: currentUser?.irritation,
    }),
  };
};

export const buildPairedProfileNextStep = (input: {
  mode: ProfileMode;
  completion: ProfileCompletion;
  pairedProfileState: PairedProfileState | null;
}): ProfileNextStep | null => {
  const state = input.pairedProfileState;
  if (!state || input.mode.kind !== 'paired') return null;

  if (input.mode.status === 'paired_paused') {
    return {
      kind: 'resume_pair',
      title: 'Пара на паузе',
      description:
        'Профиль пары сохранён. Можно вернуться к нему и продолжить, когда будете готовы.',
      href: `/pair/${state.pairId}`,
      ctaLabel: 'Открыть пару',
      priority: 1,
    };
  }

  if (!state.myWeeklyCheckIn.submitted) {
    return {
      kind: 'weekly_checkin',
      title: 'Пройди weekly check-in',
      description:
        'Без твоего ответа система видит только половину состояния пары.',
      href: '/profile#weekly-checkin',
      ctaLabel: 'Пройти check-in',
      priority: 1,
    };
  }

  if (state.myActivityState.awaitsMyFeedback) {
    return {
      kind: 'activity_feedback',
      title: 'Оставь feedback по активности',
      description:
        'Пара ждёт твою обратную связь, чтобы корректно завершить активность.',
      href: '/couple-activity',
      ctaLabel: 'Открыть активность',
      priority: 1,
    };
  }

  if (state.myActivityState.hasCurrentActivity) {
    return {
      kind: 'open_activity',
      title: 'Открой текущую активность',
      description:
        'У пары уже есть активность. Лучше довести её до результата.',
      href: '/couple-activity',
      ctaLabel: 'Открыть активность',
      priority: 2,
    };
  }

  if (!input.completion.sections.passport.completed) {
    return {
      kind: 'questionnaire',
      title: 'Уточни личный паспорт',
      description:
        'Дополнительная анкета сделает профиль точнее для пары и рекомендаций.',
      href: '/questionnaires',
      ctaLabel: 'Открыть анкеты',
      priority: 2,
    };
  }

  return {
    kind: 'open_pair',
    title: 'Посмотри состояние пары',
    description:
      'Открой профиль пары, чтобы увидеть check-in, активности и общий контекст.',
    href: `/pair/${state.pairId}`,
    ctaLabel: 'Открыть пару',
    priority: 3,
  };
};
