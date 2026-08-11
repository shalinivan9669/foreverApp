import type {
  PersonalDailyAnswers,
  PersonalTodayMode,
} from '@/models/PersonalDailyCheckIn';

export type PersonalTodaySource =
  | 'daily_checkin'
  | 'weekly_fallback'
  | 'profile_fallback'
  | 'low_data';

export type PersonalTodayDataStatus =
  | 'AVAILABLE'
  | 'MISSING'
  | 'INSUFFICIENT';

export type PersonalTodayMetricValues = {
  resource: number;
  closeness: number;
  tension: number;
  supportNeed: number;
  conversationReadiness: number;
  irritationRisk: number;
  initiative: number;
  repair: number;
};

export type PersonalTodayMetrics = {
  dataStatus: {
    resource: PersonalTodayDataStatus;
    connection: PersonalTodayDataStatus;
  };
  values: Partial<PersonalTodayMetricValues>;
};

export type PersonalTodayAvailableMetrics = PersonalTodayMetrics & {
  dataStatus: {
    resource: 'AVAILABLE';
    connection: 'AVAILABLE';
  };
  values: PersonalTodayMetricValues;
};

export type PersonalTodayFocus = {
  mode: PersonalTodayMode;
  title: string;
  subtitle: string;
  ruleIds: string[];
};

export type WeeklyPersonalSignal = {
  readiness: number;
  fatigue: number;
  closeness: number;
  irritation: number;
  unresolvedTopic?: boolean;
};

export type ProfilePersonalSignal =
  | {
      dataStatus: 'AVAILABLE';
      readiness: number;
      fatigue: number;
    }
  | {
      dataStatus: 'MISSING' | 'INSUFFICIENT';
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
      resourceDataStatus?: 'MISSING' | 'INSUFFICIENT';
    };

export type PersonalTodayFocusInput = {
  source: PersonalTodaySource;
  metrics: PersonalTodayMetrics;
  unresolvedTopic?: boolean;
};

export const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new Error('PERSONAL_TODAY_METRIC_INVALID');
  }
  return Math.max(0, Math.min(1, value));
};

const requireFiniteSignal = (value: number, key: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`PERSONAL_TODAY_SIGNAL_MISSING:${key}`);
  }
  return clamp01(value);
};

const unavailableMetrics = (
  resource: 'MISSING' | 'INSUFFICIENT'
): PersonalTodayMetrics => ({
  dataStatus: {
    resource,
    connection: 'MISSING',
  },
  values: {},
});

export const personalTodayOverallDataStatus = (
  metrics: PersonalTodayMetrics
): PersonalTodayDataStatus => {
  const { resource, connection } = metrics.dataStatus;
  if (resource === 'AVAILABLE' && connection === 'AVAILABLE') return 'AVAILABLE';
  if (resource === 'MISSING' && connection === 'MISSING') return 'MISSING';
  return 'INSUFFICIENT';
};

export function buildPersonalTodayMetrics(input: {
  source: 'daily_checkin';
  answers: PersonalDailyAnswers;
}): PersonalTodayAvailableMetrics;
export function buildPersonalTodayMetrics(input: {
  source: 'weekly_fallback';
  weekly: WeeklyPersonalSignal;
}): PersonalTodayAvailableMetrics;
export function buildPersonalTodayMetrics(
  input: Extract<PersonalTodayMetricsInput, { source: 'profile_fallback' | 'low_data' }>
): PersonalTodayMetrics;
export function buildPersonalTodayMetrics(
  input: PersonalTodayMetricsInput
): PersonalTodayMetrics {
  if (input.source === 'daily_checkin') {
    const answers = input.answers;
    const energy = requireFiniteSignal(answers.energy, 'energy');
    const stress = requireFiniteSignal(answers.stress, 'stress');
    const closenessNeed = requireFiniteSignal(answers.closenessNeed, 'closenessNeed');
    const supportNeed = requireFiniteSignal(answers.supportNeed, 'supportNeed');
    const conflictSensitivity = requireFiniteSignal(
      answers.conflictSensitivity,
      'conflictSensitivity'
    );
    const conversationReadiness = requireFiniteSignal(
      answers.conversationReadiness,
      'conversationReadiness'
    );
    const resource = clamp01(
      0.45 * energy + 0.25 * conversationReadiness + 0.3 * (1 - stress)
    );
    const tension = clamp01(Math.max(stress, conflictSensitivity));
    return {
      dataStatus: { resource: 'AVAILABLE', connection: 'AVAILABLE' },
      values: {
        resource,
        closeness: closenessNeed,
        tension,
        supportNeed,
        conversationReadiness,
        irritationRisk: clamp01(0.65 * conflictSensitivity + 0.35 * stress),
        initiative: clamp01(0.55 * resource + 0.45 * conversationReadiness),
        repair: clamp01(0.55 * tension + 0.45 * conversationReadiness),
      },
    };
  }

  if (input.source === 'weekly_fallback') {
    const readiness = requireFiniteSignal(input.weekly.readiness, 'readiness');
    const fatigue = requireFiniteSignal(input.weekly.fatigue, 'fatigue');
    const irritation = requireFiniteSignal(input.weekly.irritation, 'irritation');
    const closeness = requireFiniteSignal(input.weekly.closeness, 'closeness');
    const tension = clamp01(Math.max(irritation, fatigue * 0.65));
    const resource = clamp01(0.55 * readiness + 0.45 * (1 - fatigue));
    return {
      dataStatus: { resource: 'AVAILABLE', connection: 'AVAILABLE' },
      values: {
        resource,
        closeness,
        tension,
        supportNeed: clamp01(0.45 + fatigue * 0.35 + closeness * 0.2),
        conversationReadiness: readiness,
        irritationRisk: irritation,
        initiative: clamp01(0.6 * resource + 0.4 * readiness),
        repair: input.weekly.unresolvedTopic ? 0.85 : clamp01(0.35 * tension),
      },
    };
  }

  if (input.source === 'profile_fallback') {
    if (input.profile.dataStatus !== 'AVAILABLE') {
      return unavailableMetrics(input.profile.dataStatus);
    }
    const readiness = requireFiniteSignal(input.profile.readiness, 'readiness');
    const fatigue = requireFiniteSignal(input.profile.fatigue, 'fatigue');
    const resource = clamp01(0.6 * readiness + 0.4 * (1 - fatigue));
    return {
      dataStatus: {
        resource: 'AVAILABLE',
        connection: 'MISSING',
      },
      values: {
        resource,
        conversationReadiness: readiness,
        initiative: clamp01(0.55 * resource + 0.45 * readiness),
      },
    };
  }

  return unavailableMetrics(input.resourceDataStatus ?? 'MISSING');
}

const metricValue = (
  metrics: PersonalTodayMetrics,
  key: keyof PersonalTodayMetricValues
): number => {
  const value = metrics.values[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`PERSONAL_TODAY_METRIC_MISSING:${key}`);
  }
  return value;
};

export const buildPersonalTodayFocus = (
  input: PersonalTodayFocusInput
): PersonalTodayFocus => {
  if (personalTodayOverallDataStatus(input.metrics) !== 'AVAILABLE') {
    return {
      mode: 'low_data',
      title: 'Для фокуса дня пока недостаточно данных',
      subtitle: 'Отметьте своё состояние, чтобы увидеть личную сводку без догадок',
      ruleIds: ['low_data'],
    };
  }

  const resource = metricValue(input.metrics, 'resource');
  const closeness = metricValue(input.metrics, 'closeness');
  const tension = metricValue(input.metrics, 'tension');
  const conversationReadiness = metricValue(input.metrics, 'conversationReadiness');

  if (input.unresolvedTopic) {
    return {
      mode: 'repair',
      title: 'Лучше зайти через спокойное восстановление контакта',
      subtitle: 'Один короткий сигнал может быть бережнее длинного разговора',
      ruleIds: ['repair_signal'],
    };
  }

  if (tension >= 0.72) {
    return {
      mode: 'conflict_risk',
      title: 'Сегодня важен мягкий вход в контакт',
      subtitle: 'Лучше начинать с короткой фразы без давления',
      ruleIds: ['high_tension'],
    };
  }

  if (resource <= 0.38) {
    return {
      mode: 'low_resource',
      title: 'Хочется тепла и бережности',
      subtitle: 'Лучше без тяжёлых тем',
      ruleIds: ['low_resource'],
    };
  }

  if (closeness >= 0.7 && tension <= 0.55) {
    return {
      mode: 'closeness',
      title: 'Сегодня может подойти больше близости',
      subtitle: 'Можно начать с простой тёплой фразы',
      ruleIds: ['closeness_need'],
    };
  }

  if (
    resource >= 0.68 &&
    tension <= 0.35 &&
    conversationReadiness >= 0.6
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
