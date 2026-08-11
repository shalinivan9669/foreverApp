import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  recommendActions,
  type RecommendationFactorSnapshot,
} from '@/domain/model/recommendations/recommendation';
import type { PairFactorEvaluationSnapshot } from '@/domain/model/snapshots/snapshots';
import type { ActivityTemplateType } from '@/models/ActivityTemplate';
import { CANONICAL_ACTIVITY_FEEDBACK_CHECKINS } from '@/utils/activities';

export type PairActivitySuggestionStatus =
  | 'blocked_by_current_activity'
  | 'blocked_by_pair_state'
  | 'insufficient_factor_data'
  | 'ready';

export type PairActivityPrimaryReason =
  | 'current_activity'
  | 'pair_paused'
  | 'pair_ended'
  | 'insufficient_factor_data'
  | 'factor_signal'
  | 'neutral_fallback';

export type PairActivityDecisionSource =
  | 'factor_engine'
  | 'dashboard'
  | 'manual';

export type PairActivitySourceMeta = {
  trigger?: string;
  factorKey?: string;
  actionKey?: string;
  registryVersion: number;
  decisionVersion: 'activity-decision-v2';
  eventType?: 'first_month' | 'anniversary' | 'march_8' | 'valentines_day';
  eventDate?: string;
};

export type PairActivitySuggestionPlan = {
  pairId: string;
  status: PairActivitySuggestionStatus;
  primaryReason: PairActivityPrimaryReason;
  targetFactorKey?: string;
  recommendedActionKeys: string[];
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

export type BuildPairActivitySuggestionPlanInput = {
  pairId: string;
  pairStatus: 'active' | 'paused' | 'ended';
  hasCurrentActivity: boolean;
  factorSnapshots: readonly RecommendationFactorSnapshot[];
  pairEvaluations: readonly PairFactorEvaluationSnapshot[];
  blockedActionKeys: readonly string[];
  safetyVeto: boolean;
};

const meta = (
  input: Omit<PairActivitySourceMeta, 'registryVersion' | 'decisionVersion'>
): PairActivitySourceMeta => ({
  ...input,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  decisionVersion: 'activity-decision-v2',
});

export const buildPairActivitySuggestionPlan = (
  input: BuildPairActivitySuggestionPlanInput
): PairActivitySuggestionPlan => {
  if (input.pairStatus !== 'active') {
    const paused = input.pairStatus === 'paused';
    return {
      pairId: input.pairId,
      status: 'blocked_by_pair_state',
      primaryReason: paused ? 'pair_paused' : 'pair_ended',
      recommendedActionKeys: [],
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual'],
      explanation: {
        ru: paused
          ? 'Пара сейчас на паузе. Новую активность можно выбрать после возобновления.'
          : 'Пара завершена, поэтому новые совместные активности недоступны.',
      },
      source: 'dashboard',
      sourceMeta: meta({ trigger: input.pairStatus }),
    };
  }

  if (input.hasCurrentActivity) {
    return {
      pairId: input.pairId,
      status: 'blocked_by_current_activity',
      primaryReason: 'current_activity',
      recommendedActionKeys: [],
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit'],
      explanation: {
        ru: 'У пары уже есть активная задача. Завершите её перед выбором следующей.',
      },
      source: 'dashboard',
      sourceMeta: meta({ trigger: 'current_activity' }),
    };
  }

  if (input.safetyVeto) {
    return {
      pairId: input.pairId,
      status: 'ready',
      primaryReason: 'neutral_fallback',
      targetFactorKey: 'communication.weekly.connection',
      recommendedActionKeys: ['action.gentleThreeMinuteCheckIn'],
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual'],
      requiredMode: 'together',
      explanation: {
        ru: 'Доступен короткий нейтральный формат без сложной темы.',
        en: 'A short neutral format is available without a difficult topic.',
      },
      source: 'factor_engine',
      sourceMeta: meta({
        trigger: 'neutral_fallback',
        actionKey: 'action.gentleThreeMinuteCheckIn',
        factorKey: 'communication.weekly.connection',
      }),
    };
  }

  const recommendation = recommendActions({
    actions: MVP_FACTOR_REGISTRY.actions,
    context: 'COMMITTED_RELATIONSHIP',
    factorSnapshots: input.factorSnapshots,
    pairEvaluations: input.pairEvaluations,
    blockedActionKeys: input.blockedActionKeys,
    limit: 3,
  });
  const first = recommendation.recommendations[0];
  if (!first) {
    return {
      pairId: input.pairId,
      status: 'ready',
      primaryReason: 'neutral_fallback',
      targetFactorKey: 'communication.weekly.connection',
      recommendedActionKeys: ['action.gentleThreeMinuteCheckIn'],
      preferredDifficulty: 1,
      maxIntensity: 1,
      preferredArchetypes: ['micro_habit', 'ritual'],
      requiredMode: 'together',
      explanation: {
        ru: 'Доступен короткий нейтральный формат без сложной темы.',
        en: 'A short neutral format is available without a difficult topic.',
      },
      source: 'factor_engine',
      sourceMeta: meta({
        trigger: 'neutral_fallback',
        actionKey: 'action.gentleThreeMinuteCheckIn',
        factorKey: 'communication.weekly.connection',
      }),
    };
  }

  const action = MVP_FACTOR_REGISTRY.actions.find(
    (candidate) => candidate.key === first.actionKey
  );
  if (!action) {
    throw new Error('CANONICAL_ACTION_MISSING');
  }
  return {
    pairId: input.pairId,
    status: 'ready',
    primaryReason: 'factor_signal',
    targetFactorKey: first.targetFactorKeys[0],
    recommendedActionKeys: recommendation.recommendations.map(
      (item) => item.actionKey
    ),
    preferredDifficulty: action.difficulty,
    maxIntensity: action.difficulty >= 3 ? 2 : 1,
    preferredArchetypes:
      action.key === 'action.repairConversation'
        ? ['dialogue', 'task']
        : action.key === 'action.householdRoleMap'
          ? ['task', 'ritual']
          : ['micro_habit', 'ritual'],
    requiredMode: 'together',
    explanation: {
      ru: 'Выбран один посильный шаг по актуальному фактору пары.',
    },
    source: 'factor_engine',
    sourceMeta: meta({
      trigger: 'factor_signal',
      actionKey: action.key,
      factorKey: first.targetFactorKeys[0],
    }),
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
  actionKey:
    | 'action.gentleThreeMinuteCheckIn'
    | 'action.repairConversation'
    | 'action.householdRoleMap';
  title: string;
  description: string;
  why: string;
  archetype: ActivityTemplateType['archetype'];
  intensity?: 1 | 2;
};

const template = (seed: TemplateSeed): SystemActivityTemplate => {
  const action = MVP_FACTOR_REGISTRY.actions.find(
    (candidate) => candidate.key === seed.actionKey
  );
  if (!action) throw new Error('CANONICAL_ACTION_MISSING');
  const publishedAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: `system-${seed.id}`,
    contentVersion: action.publicationVersion,
    publicationStatus: 'published',
    reviewedAt: publishedAt,
    publishedAt,
    intent: 'improve',
    archetype: seed.archetype,
    actionDefinition: {
      key: action.key,
      actionVersion: action.actionVersion,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    },
    targetFactorKeys: [...action.targetFactors],
    difficulty: action.difficulty,
    intensity: seed.intensity ?? 1,
    timeEstimateMin: action.durationMinutes,
    location: 'any',
    requiresConsent: false,
    title: { ru: seed.title, en: seed.title },
    description: { ru: seed.description, en: seed.description },
    materials: [],
    checkIns: CANONICAL_ACTIVITY_FEEDBACK_CHECKINS.map((item) => ({
      ...item,
      map: [...item.map],
      text: { ...item.text },
    })),
    cooldownDays: action.cooldownDays,
    why: { ru: seed.why, en: seed.why },
    mode: 'together',
    sync: 'sync',
    visibility: 'both',
  };
};

export const SYSTEM_ACTIVITY_TEMPLATES: SystemActivityTemplate[] = [
  template({
    id: 'resource-phone-free',
    actionKey: 'action.gentleThreeMinuteCheckIn',
    title: 'Три минуты на контакт',
    description:
      'По очереди коротко назовите своё состояние. Не ищите решение и не оценивайте ответ партнёра.',
    why: 'Короткий нейтральный формат помогает обозначить состояние без перегруза.',
    archetype: 'micro_habit',
  }),
  template({
    id: 'resource-relief',
    actionKey: 'action.gentleThreeMinuteCheckIn',
    title: 'Одна посильная поддержка',
    description:
      'Каждый называет одну небольшую вещь, которая могла бы облегчить ближайший день.',
    why: 'Помогает увидеть доступный шаг без требований и сложного разговора.',
    archetype: 'ritual',
  }),
  template({
    id: 'communication-rules',
    actionKey: 'action.repairConversation',
    title: 'Правила спокойного разговора',
    description:
      'Выберите сигнал паузы и способ вернуться к теме после короткого перерыва.',
    why: 'Создаёт понятную рамку для восстановления разговора.',
    archetype: 'dialogue',
    intensity: 2,
  }),
  template({
    id: 'domestic-load-map',
    actionKey: 'action.householdRoleMap',
    title: 'Карта бытовых ролей',
    description:
      'Запишите несколько текущих задач и выберите одну роль, которую можно распределить яснее.',
    why: 'Делает нагрузку видимой и переводит обсуждение в конкретный шаг.',
    archetype: 'task',
    intensity: 2,
  }),
  template({
    id: 'maintenance-week',
    actionKey: 'action.gentleThreeMinuteCheckIn',
    title: 'Короткая сверка недели',
    description:
      'Закончите две фразы: «Сейчас мне важно…» и «На этой неделе мне поможет…».',
    why: 'Поддерживает общий ритм без попытки решить всё за один разговор.',
    archetype: 'ritual',
  }),
];
