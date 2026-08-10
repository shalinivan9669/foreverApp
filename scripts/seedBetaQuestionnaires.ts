import { connectToDatabase } from '@/lib/mongodb';
import {
  Questionnaire,
  type QuestionItem,
  type QuestionnaireType,
} from '@/models/Questionnaire';

export const BETA_SCORING_VERSION = 'scoring_v1';
export const BETA_CONTENT_PUBLICATION_AT = new Date('2026-08-01T00:00:00.000Z');

const LIKERT5_MAP = [-3, -1, 0, 1, 3];
const BOOL_MAP = [-3, 3];

type BetaScope = NonNullable<QuestionItem['scope']>;
type BetaAudience = NonNullable<QuestionItem['audience']>;
type BetaSensitivity = NonNullable<QuestionItem['sensitivity']>;
type Axis = QuestionItem['axis'];

const scaleText = {
  ru: [
    '1 - совсем не про меня',
    '2 - скорее не про меня',
    '3 - иногда',
    '4 - скорее про меня',
    '5 - очень про меня',
  ],
};

const betaQuestion = (input: {
  id: string;
  axis: Axis;
  facet: string;
  polarity: 1 | -1;
  text: string;
  explanation: string;
  scope: BetaScope;
  audience: BetaAudience;
  sensitivity?: BetaSensitivity;
  scale?: 'likert5' | 'bool';
  weight?: number;
  confidenceWeight?: number;
}): QuestionItem => ({
  id: input.id,
  axis: input.axis,
  facet: input.facet,
  polarity: input.polarity === 1 ? '+' : '-',
  polarityNumeric: input.polarity,
  reverseScoring: false,
  scale: input.scale ?? 'likert5',
  map: input.scale === 'bool' ? BOOL_MAP : LIKERT5_MAP,
  weight: input.weight ?? 1,
  confidenceWeight: input.confidenceWeight ?? 1,
  text: { ru: input.text, en: input.text },
  scope: input.scope,
  audience: input.audience,
  sensitivity: input.sensitivity ?? 'medium',
  locale: 'ru',
  explanation: input.explanation,
  scoringVersion: BETA_SCORING_VERSION,
});

const questionnaire = (input: {
  id: string;
  title: string;
  description: string;
  targetType: 'individual' | 'couple';
  axis: Axis;
  tags: string[];
  isStarter?: boolean;
  type: 'baseline' | 'state' | 'pair' | 'weekly_checkin';
  scope: 'solo' | 'pair' | 'pair_or_solo';
  targetLayer: 'trait' | 'state' | 'pair_passport';
  purpose: string;
  questions: QuestionItem[];
  meta?: Record<string, unknown>;
}): QuestionnaireType => ({
  _id: input.id,
  publicationStatus: 'published',
  reviewedAt: BETA_CONTENT_PUBLICATION_AT,
  publishedAt: BETA_CONTENT_PUBLICATION_AT,
  title: { ru: input.title, en: input.title },
  description: { ru: input.description, en: input.description },
  meta: {
    isStarter: input.isStarter,
    isBeta: true,
    type: input.type,
    scope: input.scope,
    targetLayer: input.targetLayer,
    purpose: input.purpose,
    scoringVersion: BETA_SCORING_VERSION,
    scaleText,
    ...(input.meta ?? {}),
  },
  target: {
    type: input.targetType,
    gender: 'unisex',
    vector: 'neutral',
  },
  axis: input.axis,
  difficulty: 1,
  tags: input.tags,
  version: 1,
  randomize: false,
  questions: input.questions,
});

export const BETA_QUESTIONNAIRES: QuestionnaireType[] = [
  questionnaire({
    id: 'beta_baseline_communication_style',
    title: 'Стиль сложного разговора',
    description: 'Короткая анкета о том, как вы обычно ведете себя в трудных разговорах.',
    targetType: 'individual',
    axis: 'communication',
    tags: ['baseline', 'starter', 'communication', 'beta'],
    isStarter: true,
    type: 'baseline',
    scope: 'solo',
    targetLayer: 'trait',
    purpose: 'Understand how the user usually behaves in difficult conversations.',
    questions: [
      betaQuestion({
        id: 'comm_style_directness_1',
        axis: 'communication',
        facet: 'communication.directness',
        polarity: 1,
        text: 'В сложном разговоре я стараюсь прямо назвать, что именно меня волнует.',
        explanation: 'Сигнал прямоты без давления и обвинений.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_listening_1',
        axis: 'communication',
        facet: 'communication.listening',
        polarity: 1,
        text: 'Я уточняю, правильно ли понял(а) другого человека, прежде чем отвечать.',
        explanation: 'Сигнал привычки проверять понимание.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_repair_1',
        axis: 'communication',
        facet: 'communication.conflict_repair',
        polarity: 1,
        text: 'После ссоры я готов(а) вернуться к теме и договориться о следующем шаге.',
        explanation: 'Сигнал восстановления контакта после напряжения.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_avoidance_1',
        axis: 'communication',
        facet: 'communication.avoidance',
        polarity: -1,
        text: 'Если тема неприятная, я часто откладываю разговор, даже когда он нужен.',
        explanation: 'Сигнал избегания сложной темы.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_criticism_1',
        axis: 'communication',
        facet: 'communication.criticism_tolerance',
        polarity: 1,
        text: 'Когда слышу критику, я стараюсь отделить полезную часть от резкого тона.',
        explanation: 'Сигнал переносимости обратной связи.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_tone_1',
        axis: 'communication',
        facet: 'communication.tone_control',
        polarity: 1,
        text: 'Даже в споре я стараюсь не повышать голос и не переходить на личности.',
        explanation: 'Сигнал контроля тона в напряжении.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_directness_2',
        axis: 'communication',
        facet: 'communication.directness',
        polarity: -1,
        text: 'Я ожидаю, что партнер сам поймет, что не так, без прямого объяснения.',
        explanation: 'Сигнал непрямого ожидания вместо явного запроса.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_listening_2',
        axis: 'communication',
        facet: 'communication.listening',
        polarity: 1,
        text: 'Я могу дослушать позицию партнера, даже если сначала не согласен(на).',
        explanation: 'Сигнал выдерживания другой позиции.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_repair_2',
        axis: 'communication',
        facet: 'communication.conflict_repair',
        polarity: 1,
        text: 'Мне важно завершить трудный разговор понятной договоренностью.',
        explanation: 'Сигнал ориентации на договоренность.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'comm_style_tone_2',
        axis: 'communication',
        facet: 'communication.tone_control',
        polarity: -1,
        text: 'В напряжении я могу сказать резче, чем хотел(а), и потом долго не возвращаться к этому.',
        explanation: 'Сигнал риска резкого тона без восстановления.',
        scope: 'solo',
        audience: 'personal',
      }),
    ],
  }),

  questionnaire({
    id: 'beta_state_resource_fatigue',
    title: 'Ресурс и усталость',
    description: 'Текущий ресурс, усталость и готовность к разговору без выводов о характере.',
    targetType: 'individual',
    axis: 'psyche',
    tags: ['state', 'resource', 'fatigue', 'beta'],
    type: 'state',
    scope: 'solo',
    targetLayer: 'state',
    purpose: 'Measure current resource/fatigue/readiness without treating it as stable personality.',
    questions: [
      betaQuestion({
        id: 'resource_stress_1',
        axis: 'psyche',
        facet: 'psyche.stress_load',
        polarity: -1,
        text: 'На этой неделе у меня было много нагрузки, и она заметно влияет на общение.',
        explanation: 'Сигнал текущей нагрузки, а не устойчивой черты.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_recovery_1',
        axis: 'psyche',
        facet: 'psyche.recovery',
        polarity: 1,
        text: 'У меня было достаточно времени восстановиться после напряженных дней.',
        explanation: 'Сигнал восстановления ресурса.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_regulation_1',
        axis: 'psyche',
        facet: 'psyche.emotional_regulation',
        polarity: 1,
        text: 'Когда эмоции поднимаются, я могу сделать паузу перед ответом.',
        explanation: 'Сигнал текущей саморегуляции.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_irritability_1',
        axis: 'psyche',
        facet: 'psyche.irritability',
        polarity: -1,
        text: 'В последние дни я быстрее раздражаюсь на мелочи.',
        explanation: 'Сигнал текущей раздражительности.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_readiness_1',
        axis: 'psyche',
        facet: 'psyche.conversation_readiness',
        polarity: 1,
        text: 'Сейчас у меня есть силы спокойно обсудить важную тему.',
        explanation: 'Сигнал готовности к разговору.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_support_1',
        axis: 'psyche',
        facet: 'psyche.support_request',
        polarity: 1,
        text: 'Мне легко попросить поддержки, когда ресурса мало.',
        explanation: 'Сигнал способности просить поддержку.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_comm_tone_1',
        axis: 'communication',
        facet: 'psyche.conversation_readiness',
        polarity: -1,
        text: 'Когда я устаю, мне сложнее держать спокойный тон в разговоре.',
        explanation: 'Сигнал влияния усталости на общение.',
        scope: 'solo',
        audience: 'personal',
      }),
      betaQuestion({
        id: 'resource_recovery_2',
        axis: 'psyche',
        facet: 'psyche.recovery',
        polarity: 1,
        text: 'Я понимаю, что помогает мне восстановиться после сложной недели.',
        explanation: 'Сигнал ясности про восстановление.',
        scope: 'solo',
        audience: 'personal',
      }),
    ],
  }),

  questionnaire({
    id: 'beta_pair_expectations',
    title: 'Ожидания в паре',
    description: 'Безопасное сравнение ожиданий о разговорах, быте, деньгах и совместном времени.',
    targetType: 'couple',
    axis: 'communication',
    tags: ['pair', 'expectations', 'communication', 'domestic', 'finance', 'beta'],
    isStarter: true,
    type: 'pair',
    scope: 'pair',
    targetLayer: 'pair_passport',
    purpose: 'Compare partner expectations safely.',
    questions: [
      betaQuestion({
        id: 'pair_comm_directness_1',
        axis: 'communication',
        facet: 'communication.directness',
        polarity: 1,
        text: 'Мне важно говорить о сложных темах прямо, но без давления.',
        explanation: 'Сигнал ожидания прямого разговора.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_comm_avoidance_1',
        axis: 'communication',
        facet: 'communication.avoidance',
        polarity: -1,
        text: 'Лучше подождать, пока проблема сама станет менее острой.',
        explanation: 'Сигнал склонности откладывать напряженную тему.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_comm_repair_1',
        axis: 'communication',
        facet: 'communication.conflict_repair',
        polarity: 1,
        text: 'После спора нам стоит коротко зафиксировать, о чем договорились.',
        explanation: 'Сигнал ценности восстановления после спора.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_domestic_fairness_1',
        axis: 'domestic',
        facet: 'domestic.fairness',
        polarity: 1,
        text: 'Бытовые задачи должны распределяться так, чтобы нагрузка ощущалась справедливой.',
        explanation: 'Сигнал ожидания справедливости в быту.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_domestic_ownership_1',
        axis: 'domestic',
        facet: 'domestic.task_ownership',
        polarity: 1,
        text: 'Лучше заранее закрепить, кто за какую бытовую зону отвечает.',
        explanation: 'Сигнал ожидания явного владения задачами.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_domestic_fairness_2',
        axis: 'domestic',
        facet: 'domestic.fairness',
        polarity: -1,
        text: 'Если один человек делает больше по дому, это нормально и не требует обсуждения.',
        explanation: 'Сигнал риска неявного перекоса нагрузки.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_finance_transparency_1',
        axis: 'finance',
        facet: 'finance.transparency',
        polarity: 1,
        text: 'Крупные траты лучше обсуждать заранее, даже если бюджет раздельный.',
        explanation: 'Сигнал прозрачности финансовых решений.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_finance_budgeting_1',
        axis: 'finance',
        facet: 'finance.budgeting',
        polarity: 1,
        text: 'Мне спокойнее, когда у пары есть понятные правила общего бюджета.',
        explanation: 'Сигнал ценности правил бюджета.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_finance_transparency_2',
        axis: 'finance',
        facet: 'finance.transparency',
        polarity: -1,
        text: 'Личные траты не нужно объяснять партнеру ни при каких обстоятельствах.',
        explanation: 'Сигнал ожидания высокой автономии в деньгах.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_views_shared_time_1',
        axis: 'personalViews',
        facet: 'personalViews.shared_time',
        polarity: 1,
        text: 'Мне важно заранее планировать хотя бы небольшое совместное время.',
        explanation: 'Сигнал ожидания совместного времени.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_views_autonomy_1',
        axis: 'personalViews',
        facet: 'personalViews.autonomy',
        polarity: 1,
        text: 'Даже в близкой паре каждому нужно личное пространство без объяснений.',
        explanation: 'Сигнал ожидания автономии.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_views_shared_time_2',
        axis: 'personalViews',
        facet: 'personalViews.shared_time',
        polarity: -1,
        text: 'Если мы рядом дома, отдельное время для пары можно не планировать.',
        explanation: 'Сигнал риска неявного ожидания близости.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_comm_directness_2',
        axis: 'communication',
        facet: 'communication.directness',
        polarity: 1,
        text: 'Если ожидания расходятся, лучше сначала назвать правила разговора.',
        explanation: 'Сигнал готовности структурировать сложную тему.',
        scope: 'pair',
        audience: 'couple',
      }),
      betaQuestion({
        id: 'pair_domestic_ownership_2',
        axis: 'domestic',
        facet: 'domestic.task_ownership',
        polarity: -1,
        text: 'Бытовые задачи лучше решать по ситуации, без заранее закрепленных зон.',
        explanation: 'Сигнал предпочтения гибкого, но менее явного распределения.',
        scope: 'pair',
        audience: 'couple',
      }),
    ],
  }),

  questionnaire({
    id: 'beta_weekly_checkin',
    title: 'Как прошла неделя',
    description: 'Пять коротких полей для текущей готовности, усталости и следующего шага.',
    targetType: 'couple',
    axis: 'psyche',
    tags: ['weekly_checkin', 'state', 'retention', 'beta'],
    type: 'weekly_checkin',
    scope: 'pair_or_solo',
    targetLayer: 'state',
    purpose: 'Weekly retention loop and current state tracking.',
    meta: {
      weeklyFields: ['closeness', 'fatigue', 'irritation', 'readiness', 'unresolvedTopic'],
      apiRoute: '/api/checkins/weekly',
    },
    questions: [
      betaQuestion({
        id: 'weekly_closeness',
        axis: 'personalViews',
        facet: 'personalViews.shared_time',
        polarity: 1,
        text: 'На этой неделе было достаточно ощущения близости.',
        explanation: 'Сигнал closeness для weekly check-in.',
        scope: 'pair_or_solo',
        audience: 'weekly',
        confidenceWeight: 0.8,
      }),
      betaQuestion({
        id: 'weekly_fatigue',
        axis: 'psyche',
        facet: 'psyche.stress_load',
        polarity: -1,
        text: 'Усталость на этой неделе заметно мешала общению.',
        explanation: 'Сигнал fatigue для weekly check-in.',
        scope: 'pair_or_solo',
        audience: 'weekly',
        confidenceWeight: 0.8,
      }),
      betaQuestion({
        id: 'weekly_irritation',
        axis: 'psyche',
        facet: 'psyche.irritability',
        polarity: -1,
        text: 'Раздражения было больше, чем обычно.',
        explanation: 'Сигнал irritation для weekly check-in.',
        scope: 'pair_or_solo',
        audience: 'weekly',
        confidenceWeight: 0.8,
      }),
      betaQuestion({
        id: 'weekly_readiness',
        axis: 'psyche',
        facet: 'psyche.conversation_readiness',
        polarity: 1,
        text: 'Сейчас есть готовность спокойно обсудить один важный вопрос.',
        explanation: 'Сигнал readiness для weekly check-in.',
        scope: 'pair_or_solo',
        audience: 'weekly',
        confidenceWeight: 0.8,
      }),
      betaQuestion({
        id: 'weekly_unresolved_topic',
        axis: 'communication',
        facet: 'communication.avoidance',
        polarity: -1,
        text: 'Осталась тема, которую лучше не откладывать на следующую неделю.',
        explanation: 'Boolean-сигнал unresolvedTopic для weekly check-in.',
        scope: 'pair_or_solo',
        audience: 'weekly',
        scale: 'bool',
        confidenceWeight: 0.7,
      }),
    ],
  }),
];

export const seedBetaQuestionnaires = async (): Promise<void> => {
  await connectToDatabase();

  for (const item of BETA_QUESTIONNAIRES) {
    await Questionnaire.updateOne(
      { _id: item._id },
      {
        $set: {
          title: item.title,
          description: item.description,
          meta: item.meta,
          target: item.target,
          axis: item.axis,
          difficulty: item.difficulty,
          tags: item.tags,
          version: item.version,
          publicationStatus: item.publicationStatus,
          reviewedAt: item.reviewedAt,
          publishedAt: item.publishedAt,
          retiredAt: item.retiredAt,
          randomize: item.randomize,
          questions: item.questions,
        },
      },
      { upsert: true }
    );
  }
};

const isDirectRun = typeof require !== 'undefined' && require.main === module;

if (isDirectRun) {
  seedBetaQuestionnaires()
    .then(() => {
      console.log(`seeded ${BETA_QUESTIONNAIRES.length} beta questionnaires`);
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}
