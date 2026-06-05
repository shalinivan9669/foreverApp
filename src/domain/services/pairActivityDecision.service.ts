import type { ActivityTemplateType, Axis } from '@/models/ActivityTemplate';
import type { PairWeeklyCheckInSummaryDTO } from '@/domain/services/weeklyCheckIn.service';

export type PairActivitySuggestionStatus =
  | 'blocked_by_current_activity'
  | 'blocked_by_pair_state'
  | 'needs_diagnostics'
  | 'needs_weekly_checkin'
  | 'ready';

export type PairActivityPrimaryReason =
  | 'current_activity'
  | 'pair_paused'
  | 'pair_ended'
  | 'insufficient_diagnostics'
  | 'missing_weekly_checkin'
  | 'high_fatigue'
  | 'weekly_divergence'
  | 'risk_zone'
  | 'low_closeness'
  | 'maintenance';

export type PairActivityDecisionSource =
  | 'diagnostics'
  | 'weekly_checkin'
  | 'dashboard'
  | 'manual';

export type PairActivitySourceMeta = {
  trigger?: string;
  weekKey?: string;
  axis?: string;
  severity?: 1 | 2 | 3;
  divergenceMetric?: 'readiness' | 'fatigue' | 'closeness' | 'irritation';
  decisionVersion: 'activity-decision-v1';
  eventType?: 'first_month' | 'anniversary' | 'march_8' | 'valentines_day';
  eventDate?: string;
};

export type PairActivitySuggestionPlan = {
  pairId: string;
  status: PairActivitySuggestionStatus;
  primaryReason: PairActivityPrimaryReason;
  axis?: Axis;
  severity?: 1 | 2 | 3;
  fatigue?: number;
  readiness?: number;
  closeness?: number;
  irritation?: number;
  preferredDifficulty: 1 | 2 | 3 | 4 | 5;
  maxIntensity: 1 | 2 | 3;
  preferredArchetypes: ActivityTemplateType['archetype'][];
  requiredMode?: 'together' | 'soloA' | 'soloB';
  requiredSync?: 'sync' | 'async';
  explanation: {
    ru: string;
    en?: string;
  };
  source: PairActivityDecisionSource;
  sourceMeta: PairActivitySourceMeta;
};

type DiagnosticsInput = {
  overall?: {
    confidence: number;
    status: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
  };
  riskZones?: Array<{
    axis: string;
    severity: 1 | 2 | 3;
  }>;
  lastDiagnosticsAt?: Date | string;
};

export type BuildPairActivitySuggestionPlanInput = {
  pairId: string;
  pairStatus: 'active' | 'paused' | 'ended';
  fatigue?: number;
  readiness?: number;
  diagnostics?: DiagnosticsInput;
  weekly: PairWeeklyCheckInSummaryDTO;
  hasCurrentActivity: boolean;
};

const AXES = new Set<Axis>([
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
]);

const toAxis = (value?: string): Axis | undefined =>
  value && AXES.has(value as Axis) ? (value as Axis) : undefined;

const basePlan = (
  input: BuildPairActivitySuggestionPlanInput
): Pick<
  PairActivitySuggestionPlan,
  'pairId' | 'fatigue' | 'readiness' | 'closeness' | 'irritation'
> => ({
  pairId: input.pairId,
  fatigue: input.weekly.pair.fatigue ?? input.fatigue,
  readiness: input.weekly.pair.readiness ?? input.readiness,
  closeness: input.weekly.pair.closeness,
  irritation: input.weekly.pair.irritation,
});

const largestDivergence = (
  divergence: NonNullable<PairWeeklyCheckInSummaryDTO['pair']['divergence']>
): {
  metric: 'readiness' | 'fatigue' | 'closeness' | 'irritation';
  value: number;
} | null => {
  const entries = Object.entries(divergence).filter(
    (entry): entry is [
      'readiness' | 'fatigue' | 'closeness' | 'irritation',
      number,
    ] => typeof entry[1] === 'number'
  );
  return entries.sort((left, right) => right[1] - left[1])[0]
    ? { metric: entries[0][0], value: entries[0][1] }
    : null;
};

export const buildPairActivitySuggestionPlan = (
  input: BuildPairActivitySuggestionPlanInput
): PairActivitySuggestionPlan => {
  const shared = basePlan(input);
  const weekKey = input.weekly.weekKey;

  if (input.pairStatus !== 'active') {
    const paused = input.pairStatus === 'paused';
    return {
      ...shared,
      status: 'blocked_by_pair_state',
      primaryReason: paused ? 'pair_paused' : 'pair_ended',
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual'],
      explanation: {
        ru: paused
          ? 'Пара сейчас на паузе. Новые задачи можно получить после возобновления пары.'
          : 'Пара завершена, поэтому новые совместные задачи не создаются.',
      },
      source: 'dashboard',
      sourceMeta: {
        trigger: input.pairStatus,
        weekKey,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  if (input.hasCurrentActivity) {
    return {
      ...shared,
      status: 'blocked_by_current_activity',
      primaryReason: 'current_activity',
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit'],
      explanation: {
        ru: 'У пары уже есть активная задача. Лучше завершить её, прежде чем брать новую.',
      },
      source: 'dashboard',
      sourceMeta: {
        trigger: 'current_activity',
        weekKey,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  const diagnostics = input.diagnostics;
  const hasDiagnostics = Boolean(
    diagnostics?.lastDiagnosticsAt &&
      diagnostics.overall &&
      diagnostics.overall.status !== 'insufficient_data' &&
      diagnostics.overall.confidence >= 0.35
  );
  if (!hasDiagnostics) {
    return {
      ...shared,
      status: 'needs_diagnostics',
      primaryReason: 'insufficient_diagnostics',
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual', 'dialogue'],
      requiredMode: 'together',
      explanation: {
        ru: 'Пока мало данных о паре. Предложены только лёгкие универсальные форматы без чувствительных тем.',
      },
      source: 'diagnostics',
      sourceMeta: {
        trigger: 'insufficient_diagnostics',
        weekKey,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  if (!input.weekly.currentUser.submitted) {
    return {
      ...shared,
      status: 'needs_weekly_checkin',
      primaryReason: 'missing_weekly_checkin',
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual'],
      explanation: {
        ru: 'Сначала лучше заполнить weekly check-in. Пока доступен только один лёгкий базовый вариант.',
      },
      source: 'weekly_checkin',
      sourceMeta: {
        trigger: 'missing_current_user_checkin',
        weekKey,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  const fatigue = input.weekly.pair.fatigue ?? input.fatigue ?? 0;
  const readiness = input.weekly.pair.readiness ?? input.readiness ?? 0.5;
  if (fatigue >= 0.7) {
    return {
      ...shared,
      status: 'ready',
      primaryReason: 'high_fatigue',
      axis: 'psyche',
      severity: fatigue >= 0.85 ? 3 : 2,
      preferredDifficulty: 2,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual', 'date', 'task'],
      requiredMode: 'together',
      explanation: {
        ru: 'По check-in этой недели усталость высокая, поэтому лучше мягкий формат без перегруза и тяжёлого разговора.',
      },
      source: 'weekly_checkin',
      sourceMeta: {
        trigger: 'high_fatigue',
        weekKey,
        axis: 'psyche',
        severity: fatigue >= 0.85 ? 3 : 2,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  if (input.weekly.pair.hasDivergence && input.weekly.pair.divergence) {
    const top = largestDivergence(input.weekly.pair.divergence);
    const metric = top?.metric ?? 'readiness';
    const axis: Axis =
      metric === 'fatigue'
        ? 'psyche'
        : metric === 'closeness'
          ? 'sexuality'
          : 'communication';
    const archetypes: ActivityTemplateType['archetype'][] =
      metric === 'fatigue'
        ? ['micro_habit', 'ritual', 'task']
        : metric === 'closeness'
          ? ['ritual', 'date', 'dialogue']
          : ['dialogue', 'ritual'];

    return {
      ...shared,
      status: 'ready',
      primaryReason: 'weekly_divergence',
      axis,
      severity: top && top.value >= 0.55 ? 3 : 2,
      preferredDifficulty: 2,
      maxIntensity: metric === 'irritation' ? 2 : 1,
      preferredArchetypes: archetypes,
      requiredMode: 'together',
      explanation: {
        ru: 'По ответам этой недели видно расхождение. Лучше начать с короткой сверки без обвинений и тяжёлого разговора.',
      },
      source: 'weekly_checkin',
      sourceMeta: {
        trigger: 'weekly_divergence',
        weekKey,
        axis,
        severity: top && top.value >= 0.55 ? 3 : 2,
        divergenceMetric: metric,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  const topRisk = (diagnostics?.riskZones ?? [])
    .slice()
    .sort((left, right) => right.severity - left.severity)[0];
  const riskAxis = toAxis(topRisk?.axis);
  if (topRisk && riskAxis && topRisk.severity >= 2) {
    return {
      ...shared,
      status: 'ready',
      primaryReason: 'risk_zone',
      axis: riskAxis,
      severity: topRisk.severity,
      preferredDifficulty:
        topRisk.severity === 3 && readiness >= 0.4 ? 3 : 2,
      maxIntensity: topRisk.severity === 3 ? 2 : 1,
      preferredArchetypes:
        riskAxis === 'sexuality'
          ? ['dialogue', 'ritual']
          : ['dialogue', 'task', 'micro_habit', 'education'],
      requiredMode: 'together',
      explanation: {
        ru:
          topRisk.severity === 3
            ? 'В диагностике есть высокий сигнал по выбранной зоне. Предложен один целевой шаг и более мягкая альтернатива.'
            : 'В диагностике есть умеренный сигнал. Небольшая практическая задача поможет обсудить тему без драматизации.',
      },
      source: 'diagnostics',
      sourceMeta: {
        trigger: 'risk_zone',
        weekKey,
        axis: riskAxis,
        severity: topRisk.severity,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  const closeness = input.weekly.pair.closeness;
  if (typeof closeness === 'number' && closeness <= 0.35) {
    return {
      ...shared,
      status: 'ready',
      primaryReason: 'low_closeness',
      axis: 'sexuality',
      severity: closeness <= 0.2 ? 3 : 2,
      preferredDifficulty: 2,
      maxIntensity: 1,
      preferredArchetypes: ['ritual', 'date', 'dialogue'],
      requiredMode: 'together',
      explanation: {
        ru: 'По check-in сейчас меньше ощущения близости. Подойдёт мягкая активность на контакт, комфорт и внимание без давления.',
      },
      source: 'weekly_checkin',
      sourceMeta: {
        trigger: 'low_closeness',
        weekKey,
        axis: 'sexuality',
        severity: closeness <= 0.2 ? 3 : 2,
        decisionVersion: 'activity-decision-v1',
      },
    };
  }

  return {
    ...shared,
    status: 'ready',
    primaryReason: 'maintenance',
    preferredDifficulty: readiness < 0.4 ? 1 : 2,
    maxIntensity: 1,
    preferredArchetypes: ['ritual', 'game', 'date', 'micro_habit', 'task'],
    requiredMode: 'together',
    explanation: {
      ru: 'Сейчас нет острого сигнала. Это короткая поддерживающая активность, чтобы сохранить общий ритм.',
    },
    source: 'dashboard',
    sourceMeta: {
      trigger: 'maintenance',
      weekKey,
      decisionVersion: 'activity-decision-v1',
    },
  };
};

export type SystemActivityTemplate = ActivityTemplateType & {
  why: { ru: string; en: string };
  mode: 'together' | 'soloA' | 'soloB';
  sync: 'sync' | 'async';
  visibility: 'both' | 'privateA' | 'privateB';
};

type TemplateSeed = {
  id: string;
  axis: Axis;
  title: string;
  description: string;
  why: string;
  archetype: ActivityTemplateType['archetype'];
  difficulty?: 1 | 2 | 3;
  intensity?: 1 | 2;
  minutes?: number;
  consent?: boolean;
  location?: ActivityTemplateType['location'];
  maxFatigue?: number;
};

const template = (seed: TemplateSeed): SystemActivityTemplate => ({
  _id: `system-${seed.id}`,
  intent: seed.archetype === 'game' || seed.archetype === 'date' ? 'celebrate' : 'improve',
  archetype: seed.archetype,
  axis: [seed.axis],
  facetsTarget: [],
  difficulty: seed.difficulty ?? 2,
  intensity: seed.intensity ?? 1,
  timeEstimateMin: seed.minutes ?? 15,
  location: seed.location ?? 'any',
  requiresConsent: seed.consent ?? false,
  title: { ru: seed.title, en: seed.title },
  description: { ru: seed.description, en: seed.description },
  why: { ru: seed.why, en: seed.why },
  steps: { ru: [], en: [] },
  materials: [],
  checkIns: [],
  effect: [{ axis: seed.axis, baseDelta: 0.04, target: 'both' }],
  preconditions:
    typeof seed.maxFatigue === 'number' ? { maxFatigue: seed.maxFatigue } : undefined,
  cooldownDays: 14,
  mode: 'together',
  sync: seed.archetype === 'micro_habit' ? 'async' : 'sync',
  visibility: 'both',
});

export const SYSTEM_ACTIVITY_TEMPLATES: SystemActivityTemplate[] = [
  template({ id: 'communication-expectations', axis: 'communication', title: 'Сверка ожиданий на неделю', description: 'По очереди назовите один важный приоритет и одну просьбу на ближайшие дни.', why: 'Помогает заранее согласовать ожидания без длинного разговора.', archetype: 'dialogue', minutes: 15 }),
  template({ id: 'communication-rules', axis: 'communication', title: 'Правила спокойного разговора', description: 'Выберите паузу, стоп-слово и способ вернуться к теме после перерыва.', why: 'Создаёт безопасную рамку до сложного разговора.', archetype: 'task', difficulty: 3, intensity: 2, minutes: 20, maxFatigue: 0.65 }),
  template({ id: 'communication-listen', axis: 'communication', title: 'Пять минут слушать без решения', description: 'Один говорит пять минут, второй только уточняет и кратко пересказывает услышанное.', why: 'Тренирует ясность и снижает желание сразу спорить или исправлять.', archetype: 'dialogue', minutes: 12 }),
  template({ id: 'communication-good-week', axis: 'communication', title: 'Что у нас получилось', description: 'Назовите по одному моменту недели, который хотелось бы повторить.', why: 'Поддерживает контакт через конкретные удачные действия.', archetype: 'ritual', difficulty: 1, minutes: 10 }),
  template({ id: 'domestic-load-map', axis: 'domestic', title: 'Карта бытовой нагрузки', description: 'Запишите текущие бытовые задачи и выберите одну, которую можно перераспределить.', why: 'Делает невидимую нагрузку заметной и обсуждаемой.', archetype: 'task', difficulty: 3, intensity: 2, minutes: 25, maxFatigue: 0.65 }),
  template({ id: 'domestic-one-relief', axis: 'domestic', title: 'Облегчить одну мелочь', description: 'Выберите одну небольшую бытовую задачу, которую сегодня возьмёт на себя другой партнёр.', why: 'Снижает нагрузку без большого пересмотра обязанностей.', archetype: 'micro_habit', difficulty: 1, minutes: 10 }),
  template({ id: 'domestic-week-plan', axis: 'domestic', title: 'Бытовой план на семь дней', description: 'Согласуйте три обязательных дела и оставьте запас на непредвиденное.', why: 'Помогает сделать ожидания по быту конкретными.', archetype: 'ritual', minutes: 20 }),
  template({ id: 'finance-comfort', axis: 'finance', title: 'Комфортный разговор о деньгах', description: 'Сначала договоритесь, какие финансовые темы сейчас безопасно обсуждать и сколько времени на это есть.', why: 'Начинает финансовый разговор с границ и формата, а не с обвинений.', archetype: 'dialogue', difficulty: 2, intensity: 1, minutes: 15, maxFatigue: 0.6 }),
  template({ id: 'finance-week-view', axis: 'finance', title: 'Финансовый обзор недели', description: 'Посмотрите только ближайшие обязательные траты и выберите один общий приоритет.', why: 'Снижает неопределённость без полного разбора бюджета.', archetype: 'task', difficulty: 3, intensity: 2, minutes: 20, maxFatigue: 0.55 }),
  template({ id: 'finance-values-game', axis: 'finance', title: 'Три полезные траты', description: 'Каждый называет три траты, которые действительно улучшают качество жизни.', why: 'Помогает увидеть ценности за финансовыми решениями.', archetype: 'game', difficulty: 2, minutes: 15 }),
  template({ id: 'closeness-comfort', axis: 'sexuality', title: 'Разговор о комфорте и границах', description: 'Обсудите, какой контакт сейчас приятен, нейтрален или нежелателен. Любой ответ допустим.', why: 'Помогает согласовать близость без давления и ожидания физического продолжения.', archetype: 'dialogue', difficulty: 2, minutes: 15, consent: true, maxFatigue: 0.65 }),
  template({ id: 'closeness-phone-free', axis: 'sexuality', title: 'Двадцать минут рядом без телефонов', description: 'Проведите двадцать минут рядом, выбрав комфортный формат: чай, музыка или спокойный разговор.', why: 'Создаёт пространство для контакта без обязательного сценария.', archetype: 'ritual', difficulty: 1, minutes: 20, consent: true }),
  template({ id: 'closeness-walk', axis: 'sexuality', title: 'Небольшая прогулка без сложных тем', description: 'Пройдитесь вместе и обсуждайте только нейтральные или приятные вещи.', why: 'Поддерживает близость через спокойное совместное время.', archetype: 'date', difficulty: 1, minutes: 30, consent: true, location: 'outdoor' }),
  template({ id: 'views-priorities', axis: 'personalViews', title: 'Три приоритета этого месяца', description: 'Каждый выбирает три личных приоритета, затем вы ищете одно пересечение.', why: 'Помогает увидеть текущие ценности без требования полного совпадения.', archetype: 'dialogue', minutes: 20 }),
  template({ id: 'views-curiosity', axis: 'personalViews', title: 'Вопрос из любопытства', description: 'Задайте друг другу по одному вопросу о взглядах и не пытайтесь переубедить.', why: 'Поддерживает уважительный интерес к различиям.', archetype: 'ritual', difficulty: 1, minutes: 12 }),
  template({ id: 'views-week-choice', axis: 'personalViews', title: 'Один общий выбор на неделю', description: 'Выберите одно небольшое решение, которое отражает важную для вас обоих ценность.', why: 'Переводит общие взгляды в конкретное совместное действие.', archetype: 'task', minutes: 15 }),
  template({ id: 'resource-phone-free', axis: 'psyche', title: 'Тихие двадцать минут', description: 'Проведите двадцать минут рядом без телефонов и без необходимости что-либо обсуждать.', why: 'Даёт восстановительный контакт при высокой усталости.', archetype: 'micro_habit', difficulty: 1, minutes: 20 }),
  template({ id: 'resource-gratitude', axis: 'psyche', title: 'Короткий ритуал благодарности', description: 'Каждый называет одно конкретное действие партнёра, которое помогло на этой неделе.', why: 'Поддерживает ощущение опоры без эмоциональной перегрузки.', archetype: 'ritual', difficulty: 1, minutes: 8 }),
  template({ id: 'resource-walk', axis: 'psyche', title: 'Лёгкая прогулка', description: 'Пройдитесь в спокойном темпе и не поднимайте сложные темы.', why: 'Помогает снизить нагрузку и побыть вместе без требований.', archetype: 'date', difficulty: 1, minutes: 25, location: 'outdoor' }),
  template({ id: 'resource-relief', axis: 'psyche', title: 'Снять одну нагрузку', description: 'Каждый называет одну мелочь, которую можно упростить или отложить на этой неделе.', why: 'Возвращает чувство управляемости при усталости.', archetype: 'task', difficulty: 1, minutes: 10 }),
  template({ id: 'maintenance-week', axis: 'communication', title: 'План приятного момента', description: 'Выберите один короткий приятный совместный момент на ближайшие семь дней.', why: 'Поддерживает общий ритм, когда нет острой проблемы.', archetype: 'date', difficulty: 1, minutes: 10 }),
  template({ id: 'maintenance-question', axis: 'personalViews', title: 'Один новый вопрос', description: 'Каждый задаёт один вопрос, ответ на который ещё не знает.', why: 'Добавляет любопытство и обновляет привычный разговор.', archetype: 'game', difficulty: 1, minutes: 15 }),
  template({ id: 'maintenance-ritual', axis: 'psyche', title: 'Итог недели в двух фразах', description: 'Закончите фразы: «На этой неделе мне помогло…» и «На следующей неделе мне важно…».', why: 'Даёт короткую регулярную сверку без перегруза.', archetype: 'ritual', difficulty: 1, minutes: 10 }),
  template({ id: 'maintenance-support', axis: 'domestic', title: 'Маленький обмен поддержкой', description: 'Каждый выбирает одно небольшое действие, которое облегчит день партнёру.', why: 'Поддерживает взаимность через конкретные посильные действия.', archetype: 'micro_habit', difficulty: 1, minutes: 10 }),
];
