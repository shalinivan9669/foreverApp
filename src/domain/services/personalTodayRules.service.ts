import type {
  PersonalDailyAnswers,
  PersonalTodayMode,
} from '@/models/PersonalDailyCheckIn';

export type PersonalTodaySource =
  | 'daily_checkin'
  | 'weekly_fallback'
  | 'profile_fallback'
  | 'low_data';

export type PersonalTodayMetrics = {
  resource: number;
  closeness: number;
  tension: number;
  supportNeed: number;
  conversationReadiness: number;
  irritationRisk: number;
  initiative: number;
  repair: number;
};

export type PersonalTodayFocus = {
  mode: PersonalTodayMode;
  title: string;
  subtitle: string;
  ruleIds: string[];
};

export type WeeklyPersonalSignal = {
  readiness?: number;
  fatigue?: number;
  closeness?: number;
  irritation?: number;
  unresolvedTopic?: boolean;
};

export type ProfilePersonalSignal = {
  readiness?: number;
  fatigue?: number;
  hasUsefulData?: boolean;
};

export type PersonalTodayMetricsInput =
  | {
      source: 'daily_checkin';
      answers: PersonalDailyAnswers;
    }
  | {
      source: 'weekly_fallback';
      weekly: WeeklyPersonalSignal;
    }
  | {
      source: 'profile_fallback';
      profile: ProfilePersonalSignal;
    }
  | {
      source: 'low_data';
    };

export type PersonalTodayFocusInput = {
  source: PersonalTodaySource;
  metrics: PersonalTodayMetrics;
  unresolvedTopic?: boolean;
};

export const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const neutralMetrics = (): PersonalTodayMetrics => ({
  resource: 0.5,
  closeness: 0.5,
  tension: 0.25,
  supportNeed: 0.5,
  conversationReadiness: 0.45,
  irritationRisk: 0.2,
  initiative: 0.45,
  repair: 0,
});

export const buildPersonalTodayMetrics = (
  input: PersonalTodayMetricsInput
): PersonalTodayMetrics => {
  if (input.source === 'daily_checkin') {
    const answers = input.answers;
    const energy = clamp01(answers.energy);
    const stress = clamp01(answers.stress);
    const closenessNeed = clamp01(answers.closenessNeed);
    const supportNeed = clamp01(answers.supportNeed);
    const conflictSensitivity = clamp01(answers.conflictSensitivity);
    const conversationReadiness = clamp01(answers.conversationReadiness);
    const resource = clamp01(
      0.45 * energy + 0.25 * conversationReadiness + 0.3 * (1 - stress)
    );
    const tension = clamp01(Math.max(stress, conflictSensitivity));
    return {
      resource,
      closeness: closenessNeed,
      tension,
      supportNeed,
      conversationReadiness,
      irritationRisk: clamp01(0.65 * conflictSensitivity + 0.35 * stress),
      initiative: clamp01(0.55 * resource + 0.45 * conversationReadiness),
      repair: clamp01(0.55 * tension + 0.45 * conversationReadiness),
    };
  }

  if (input.source === 'weekly_fallback') {
    const readiness = clamp01(input.weekly.readiness ?? 0.5);
    const fatigue = clamp01(input.weekly.fatigue ?? 0.5);
    const irritation = clamp01(input.weekly.irritation ?? 0.2);
    const closeness = clamp01(input.weekly.closeness ?? 0.5);
    const tension = clamp01(Math.max(irritation, fatigue * 0.65));
    const resource = clamp01(0.55 * readiness + 0.45 * (1 - fatigue));
    return {
      resource,
      closeness,
      tension,
      supportNeed: clamp01(0.45 + fatigue * 0.35 + closeness * 0.2),
      conversationReadiness: readiness,
      irritationRisk: irritation,
      initiative: clamp01(0.6 * resource + 0.4 * readiness),
      repair: input.weekly.unresolvedTopic ? 0.85 : clamp01(0.35 * tension),
    };
  }

  if (input.source === 'profile_fallback') {
    const readiness = clamp01(input.profile.readiness ?? 0.45);
    const fatigue = clamp01(input.profile.fatigue ?? 0.45);
    const resource = clamp01(0.6 * readiness + 0.4 * (1 - fatigue));
    return {
      resource,
      closeness: 0.5,
      tension: clamp01(fatigue * 0.45),
      supportNeed: 0.5,
      conversationReadiness: readiness,
      irritationRisk: clamp01(fatigue * 0.35),
      initiative: clamp01(0.55 * resource + 0.45 * readiness),
      repair: 0,
    };
  }

  return neutralMetrics();
};

export const buildPersonalTodayFocus = (
  input: PersonalTodayFocusInput
): PersonalTodayFocus => {
  const { metrics } = input;

  if (input.source === 'low_data') {
    return {
      mode: 'low_data',
      title: 'Сегодня можно начать с короткой сверки',
      subtitle: 'Данных пока мало, поэтому лучше выбрать мягкий ориентир',
      ruleIds: ['low_data'],
    };
  }

  if (input.unresolvedTopic) {
    return {
      mode: 'repair',
      title: 'Лучше зайти через спокойное восстановление контакта',
      subtitle: 'Один короткий сигнал может быть бережнее длинного разговора',
      ruleIds: ['repair_signal'],
    };
  }

  if (metrics.tension >= 0.72) {
    return {
      mode: 'conflict_risk',
      title: 'Сегодня важен мягкий вход в контакт',
      subtitle: 'Лучше начинать с короткой фразы без давления',
      ruleIds: ['high_tension'],
    };
  }

  if (metrics.resource <= 0.38) {
    return {
      mode: 'low_resource',
      title: 'Хочется тепла и бережности',
      subtitle: 'Лучше без тяжёлых тем',
      ruleIds: ['low_resource'],
    };
  }

  if (metrics.closeness >= 0.7 && metrics.tension <= 0.55) {
    return {
      mode: 'closeness',
      title: 'Сегодня может подойти больше близости',
      subtitle: 'Можно начать с простой тёплой фразы',
      ruleIds: ['closeness_need'],
    };
  }

  if (
    metrics.resource >= 0.68 &&
    metrics.tension <= 0.35 &&
    metrics.conversationReadiness >= 0.6
  ) {
    return {
      mode: 'growth',
      title: 'Есть ресурс на маленький шаг навстречу',
      subtitle: 'Можно выбрать спокойный разговор или жест заботы',
      ruleIds: ['growth_window'],
    };
  }

  return {
    mode: 'stable',
    title: 'Сегодня можно держать спокойный темп',
    subtitle: 'Подойдёт короткая сверка и один понятный шаг',
    ruleIds: ['stable_fallback'],
  };
};
