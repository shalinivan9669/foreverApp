import { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import {
  MvpOnboardingSession,
  type MvpOnboardingAnswer,
  type MvpOnboardingAnswerValue,
  type MvpOnboardingCapturePolicy,
  type MvpOnboardingSessionType,
} from '@/models/MvpOnboardingSession';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';
import { materializeOnboardingFactorEvidence } from '@/domain/services/onboardingFactorEngine.service';

export const MVP_ONBOARDING_CONTENT_REVISION = 'mvp-onboarding-v2';
export const MVP_ONBOARDING_POLICY_VERSION = 'mvp-privacy-v1';

export type MvpOnboardingQuestionKind = 'single' | 'multi' | 'boolean';

export type MvpOnboardingQuestionChoice = {
  id: string;
  label: string;
};

export type MvpOnboardingQuestionDefinition = {
  id: string;
  revision: string;
  kind: MvpOnboardingQuestionKind;
  title: string;
  description: string;
  optional: boolean;
  sensitive: boolean;
  choices?: MvpOnboardingQuestionChoice[];
  minSelections?: number;
  maxSelections?: number;
  allowedCapturePolicies: MvpOnboardingCapturePolicy[];
};

const ALL_CAPTURE_POLICIES: MvpOnboardingCapturePolicy[] = [
  'PRIVATE',
  'PAIR_MODEL_ONLY',
  'SHARED',
];

export const MVP_ONBOARDING_CAPTURE_POLICIES: Array<{
  id: MvpOnboardingCapturePolicy;
  title: string;
  description: string;
}> = [
  {
    id: 'PRIVATE',
    title: 'Только для меня',
    description: 'Ответ виден только тебе и не используется в сводке пары.',
  },
  {
    id: 'PAIR_MODEL_ONLY',
    title: 'Только для расчёта',
    description:
      'Ответ может участвовать в общем расчёте, но его точное значение не показывается партнёру.',
  },
  {
    id: 'SHARED',
    title: 'Можно показать',
    description:
      'Точный ответ можно будет показать в специально обозначенном общем экране.',
  },
];

export const MVP_ONBOARDING_QUESTIONS: MvpOnboardingQuestionDefinition[] = [
  {
    id: 'important_conversation_start',
    revision: 'important-conversation-start-v1',
    kind: 'single',
    title: 'Как тебе удобнее начинать важный разговор?',
    description: 'Выбери наиболее комфортный старт разговора.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'brief_and_direct', label: 'Коротко обозначить тему' },
      { id: 'context_first', label: 'Сначала объяснить контекст' },
      { id: 'agree_on_time', label: 'Сначала договориться о времени' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'support_preference',
    revision: 'support-preference-v1',
    kind: 'multi',
    title: 'Какая поддержка обычно помогает тебе больше?',
    description: 'Можно выбрать один или два варианта.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'listen', label: 'Спокойно выслушать' },
      { id: 'practical_help', label: 'Помочь с конкретным делом' },
      { id: 'space', label: 'Дать немного пространства' },
      { id: 'shared_plan', label: 'Вместе составить короткий план' },
    ],
    minSelections: 1,
    maxSelections: 2,
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'pause_preference',
    revision: 'pause-preference-v1',
    kind: 'single',
    title: 'Что помогает, когда разговор становится напряжённым?',
    description: 'Выбери безопасный для тебя способ сделать паузу.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'short_pause', label: 'Короткая пауза на несколько минут' },
      { id: 'return_later', label: 'Вернуться к теме позже' },
      { id: 'write_first', label: 'Сначала сформулировать мысль письменно' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'repair_confidence',
    revision: 'repair-confidence-v1',
    kind: 'single',
    title: 'Насколько уверенно тебе обычно удаётся вернуться к разговору после паузы?',
    description: 'Это самооценка текущего навыка, а не оценка личности.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'need_guidance', label: 'Пока нужна понятная опора' },
      { id: 'sometimes_manage', label: 'Иногда удаётся самостоятельно' },
      { id: 'usually_manage', label: 'Обычно удаётся спокойно вернуться' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'activity_duration',
    revision: 'activity-duration-v1',
    kind: 'single',
    title: 'Сколько времени удобно выделить на небольшое совместное действие?',
    description: 'Это предпочтение, а не обязательство.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'five_minutes', label: 'Около 5 минут' },
      { id: 'fifteen_minutes', label: 'Около 15 минут' },
      { id: 'thirty_minutes', label: 'До 30 минут' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'shared_activity_format',
    revision: 'shared-activity-format-v1',
    kind: 'multi',
    title: 'Какие форматы небольших совместных действий тебе ближе?',
    description: 'Можно выбрать один или два варианта.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'conversation', label: 'Короткий разговор' },
      { id: 'shared_task', label: 'Небольшое общее дело' },
      { id: 'quiet_time', label: 'Спокойное время рядом' },
      { id: 'walk', label: 'Прогулка или лёгкое движение' },
    ],
    minSelections: 1,
    maxSelections: 2,
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'feedback_style',
    revision: 'feedback-style-v1',
    kind: 'single',
    title: 'Как тебе удобнее получать обратную связь?',
    description: 'Выбери привычный темп и степень прямоты.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'gentle', label: 'Мягко и постепенно' },
      { id: 'direct', label: 'Коротко и прямо' },
      { id: 'balanced', label: 'Сначала поддержка, затем конкретика' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'planning_style',
    revision: 'planning-style-v1',
    kind: 'single',
    title: 'Какой способ планировать небольшие действия тебе удобнее?',
    description: 'Выбери вариант, который проще поддерживать регулярно.',
    optional: false,
    sensitive: false,
    choices: [
      { id: 'fixed_time', label: 'Заранее выбрать время' },
      { id: 'same_day', label: 'Решить в тот же день' },
      { id: 'flexible_window', label: 'Оставить гибкое окно' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'reminders_enabled',
    revision: 'reminders-enabled-v1',
    kind: 'boolean',
    title: 'Нужны ли тебе нейтральные напоминания о короткой сверке?',
    description: 'Напоминание не будет содержать ответ или чувствительную тему.',
    optional: false,
    sensitive: false,
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'low_resource_boundary',
    revision: 'low-resource-boundary-v1',
    kind: 'single',
    title: 'Если сил мало, какой формат для тебя безопаснее?',
    description: 'Чувствительный вопрос: его можно пропустить.',
    optional: true,
    sensitive: true,
    choices: [
      { id: 'quiet_support', label: 'Спокойная поддержка без обсуждения' },
      { id: 'brief_checkin', label: 'Очень короткая сверка' },
      { id: 'more_space', label: 'Больше личного пространства' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'closeness_topic_boundary',
    revision: 'closeness-topic-boundary-v1',
    kind: 'single',
    title: 'Как сейчас лучше обращаться с темой близости?',
    description: 'Чувствительный вопрос: его можно пропустить.',
    optional: true,
    sensitive: true,
    choices: [
      { id: 'comfortable', label: 'Можно обсуждать спокойно' },
      { id: 'ask_first', label: 'Сначала спросить о готовности' },
      { id: 'not_now', label: 'Сейчас эту тему лучше не поднимать' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
  {
    id: 'children_intent',
    revision: 'children-intent-v1',
    kind: 'single',
    title: 'Есть ли у тебя сейчас определённый план относительно детей?',
    description:
      'Чувствительный вопрос: можно выбрать «не определился» или пропустить. Ответ не показывается партнёру автоматически.',
    optional: true,
    sensitive: true,
    choices: [
      { id: 'yes', label: 'Да, хочу детей' },
      { id: 'no', label: 'Нет, не планирую' },
      { id: 'unsure', label: 'Пока не определился' },
    ],
    allowedCapturePolicies: [...ALL_CAPTURE_POLICIES],
  },
];

export type MvpOnboardingOwnerSessionDTO = {
  status: MvpOnboardingSessionType['status'];
  contentRevision: string;
  policyVersion: string;
  consent: {
    adultConfirmed: boolean;
    voluntaryParticipationConfirmed: boolean;
    privacyAcknowledged: boolean;
    confirmedAt: string;
  };
  cursor: number;
  modelStatus: 'PENDING' | 'MATERIALIZED';
  answers: Array<{
    questionId: string;
    questionRevision: string;
    answerRevision: number;
    capturePolicy: MvpOnboardingCapturePolicy;
    value: MvpOnboardingAnswerValue;
    answeredAt: string;
  }>;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
};

export type MvpOnboardingResponseDTO = {
  definition: {
    contentRevision: string;
    policyVersion: string;
    questions: MvpOnboardingQuestionDefinition[];
    capturePolicies: typeof MVP_ONBOARDING_CAPTURE_POLICIES;
  };
  session: MvpOnboardingOwnerSessionDTO | null;
};

export type MvpOnboardingStartInput = {
  action: 'start';
  contentRevision: string;
  policyVersion: string;
  consent: {
    adultConfirmed: boolean;
    voluntaryParticipationConfirmed: boolean;
    privacyAcknowledged: boolean;
  };
};

export type MvpOnboardingAnswerInput = {
  action: 'answer';
  questionId: string;
  questionRevision: string;
  capturePolicy: MvpOnboardingCapturePolicy;
  value: MvpOnboardingAnswerValue;
};

export type MvpOnboardingCompleteInput = {
  action: 'complete';
};

export type MvpOnboardingMutationInput =
  | MvpOnboardingStartInput
  | MvpOnboardingAnswerInput
  | MvpOnboardingCompleteInput;

type StoredSession = MvpOnboardingSessionType & { _id: Types.ObjectId };

const currentSessionFilter = (currentUserId: string) => ({
  userId: currentUserId,
  contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
  policyVersion: MVP_ONBOARDING_POLICY_VERSION,
});

const validationError = (message: string): never => {
  throw new DomainError({
    code: 'VALIDATION_ERROR',
    status: 400,
    message,
  });
};

const stateConflict = (code: string, message: string): never => {
  throw new DomainError({
    code,
    status: 409,
    message,
  });
};

const assertCurrentRevisions = (input: {
  contentRevision: string;
  policyVersion: string;
}): void => {
  if (input.contentRevision !== MVP_ONBOARDING_CONTENT_REVISION) {
    stateConflict(
      'MVP_ONBOARDING_CONTENT_REVISION_CONFLICT',
      'Onboarding content revision is no longer current'
    );
  }
  if (input.policyVersion !== MVP_ONBOARDING_POLICY_VERSION) {
    stateConflict(
      'MVP_ONBOARDING_POLICY_VERSION_CONFLICT',
      'Privacy policy version is no longer current'
    );
  }
};

const questionById = (questionId: string): MvpOnboardingQuestionDefinition => {
  const question = MVP_ONBOARDING_QUESTIONS.find((item) => item.id === questionId);
  if (!question) return validationError('Unknown MVP onboarding question');
  return question;
};

const choiceIds = (question: MvpOnboardingQuestionDefinition): Set<string> =>
  new Set((question.choices ?? []).map((choice) => choice.id));

export const validateMvpOnboardingAnswer = (input: {
  question: MvpOnboardingQuestionDefinition;
  questionRevision: string;
  capturePolicy: MvpOnboardingCapturePolicy;
  value: MvpOnboardingAnswerValue;
}): {
  capturePolicy: MvpOnboardingCapturePolicy;
  value: MvpOnboardingAnswerValue;
} => {
  const { question, value } = input;
  if (input.questionRevision !== question.revision) {
    stateConflict(
      'MVP_ONBOARDING_QUESTION_REVISION_CONFLICT',
      'Question revision is no longer current'
    );
  }
  if (!question.allowedCapturePolicies.includes(input.capturePolicy)) {
    validationError('Capture policy is not allowed for this question');
  }

  if (value.kind === 'skipped') {
    if (!question.optional) validationError('Required question cannot be skipped');
    if (input.capturePolicy !== 'PRIVATE') {
      validationError('Skipped sensitive answers must remain private');
    }
    return { capturePolicy: 'PRIVATE', value: { kind: 'skipped' } };
  }

  if (value.kind !== question.kind) {
    validationError('Answer type does not match question type');
  }

  if (question.kind === 'single') {
    if (!value.optionId || !choiceIds(question).has(value.optionId)) {
      validationError('Answer option is not allowed');
    }
    return {
      capturePolicy: input.capturePolicy,
      value: { kind: 'single', optionId: value.optionId },
    };
  }

  if (question.kind === 'multi') {
    const optionIds = Array.from(new Set(value.optionIds ?? []));
    const min = question.minSelections ?? 1;
    const max = question.maxSelections ?? optionIds.length;
    if (
      optionIds.length < min ||
      optionIds.length > max ||
      optionIds.some((optionId) => !choiceIds(question).has(optionId))
    ) {
      validationError('Selected answer options are not allowed');
    }
    return {
      capturePolicy: input.capturePolicy,
      value: { kind: 'multi', optionIds },
    };
  }

  if (typeof value.booleanValue !== 'boolean') {
    validationError('Boolean answer is required');
  }
  return {
    capturePolicy: input.capturePolicy,
    value: { kind: 'boolean', booleanValue: value.booleanValue },
  };
};

const sameAnswerValue = (
  left: MvpOnboardingAnswerValue,
  right: MvpOnboardingAnswerValue
): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'single') return left.optionId === right.optionId;
  if (left.kind === 'boolean') return left.booleanValue === right.booleanValue;
  if (left.kind === 'skipped') return true;
  const leftIds = [...(left.optionIds ?? [])].sort();
  const rightIds = [...(right.optionIds ?? [])].sort();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((value, index) => value === rightIds[index])
  );
};

export const buildMvpOnboardingCursor = (
  answers: MvpOnboardingAnswer[]
): number => {
  const answeredIds = new Set(answers.map((answer) => answer.questionId));
  const nextIndex = MVP_ONBOARDING_QUESTIONS.findIndex(
    (question) => !answeredIds.has(question.id)
  );
  return nextIndex === -1 ? MVP_ONBOARDING_QUESTIONS.length : nextIndex;
};

export const reviseMvpOnboardingAnswers = (input: {
  answers: MvpOnboardingAnswer[];
  question: MvpOnboardingQuestionDefinition;
  questionRevision: string;
  capturePolicy: MvpOnboardingCapturePolicy;
  value: MvpOnboardingAnswerValue;
  answeredAt: Date;
}): { answers: MvpOnboardingAnswer[]; changed: boolean } => {
  const normalized = validateMvpOnboardingAnswer(input);
  const existingIndex = input.answers.findIndex(
    (answer) => answer.questionId === input.question.id
  );
  const existing = existingIndex >= 0 ? input.answers[existingIndex] : undefined;

  if (
    existing &&
    existing.questionRevision === input.question.revision &&
    existing.capturePolicy === normalized.capturePolicy &&
    sameAnswerValue(existing.value, normalized.value)
  ) {
    return { answers: input.answers, changed: false };
  }

  const revised: MvpOnboardingAnswer = {
    questionId: input.question.id,
    questionRevision: input.question.revision,
    answerRevision: (existing?.answerRevision ?? 0) + 1,
    capturePolicy: normalized.capturePolicy,
    value: normalized.value,
    answeredAt: input.answeredAt,
  };
  const answers = [...input.answers];
  if (existingIndex >= 0) {
    answers[existingIndex] = revised;
  } else {
    answers.push(revised);
  }
  return { answers, changed: true };
};

export const canCompleteMvpOnboarding = (
  answers: MvpOnboardingAnswer[]
): boolean => {
  const answerByQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer])
  );
  return MVP_ONBOARDING_QUESTIONS.filter((question) => !question.optional).every(
    (question) => {
      const answer = answerByQuestion.get(question.id);
      if (
        !answer ||
        answer.value.kind === 'skipped' ||
        answer.questionRevision !== question.revision
      ) {
        return false;
      }

      try {
        validateMvpOnboardingAnswer({
          question,
          questionRevision: answer.questionRevision,
          capturePolicy: answer.capturePolicy,
          value: answer.value,
        });
        return true;
      } catch {
        return false;
      }
    }
  );
};

export const toMvpOnboardingOwnerDTO = (
  session: MvpOnboardingSessionType
): MvpOnboardingOwnerSessionDTO => ({
  status: session.status,
  contentRevision: session.contentRevision,
  policyVersion: session.policyVersion,
  consent: {
    adultConfirmed: session.consent.adultConfirmed,
    voluntaryParticipationConfirmed:
      session.consent.voluntaryParticipationConfirmed,
    privacyAcknowledged: session.consent.privacyAcknowledged,
    confirmedAt: session.consent.confirmedAt.toISOString(),
  },
  cursor: session.cursor,
  modelStatus: session.factorEngine?.status ?? 'PENDING',
  answers: session.answers.map((answer) => ({
    questionId: answer.questionId,
    questionRevision: answer.questionRevision,
    answerRevision: answer.answerRevision,
    capturePolicy: answer.capturePolicy,
    value: answer.value,
    answeredAt: answer.answeredAt.toISOString(),
  })),
  startedAt: session.startedAt.toISOString(),
  ...(session.completedAt ? { completedAt: session.completedAt.toISOString() } : {}),
  updatedAt: session.updatedAt.toISOString(),
});

const responseDTO = (
  session: MvpOnboardingSessionType | null
): MvpOnboardingResponseDTO => ({
  definition: {
    contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
    policyVersion: MVP_ONBOARDING_POLICY_VERSION,
    questions: MVP_ONBOARDING_QUESTIONS,
    capturePolicies: MVP_ONBOARDING_CAPTURE_POLICIES,
  },
  session: session ? toMvpOnboardingOwnerDTO(session) : null,
});

const requireCurrentSession = async (
  currentUserId: string
): Promise<StoredSession> => {
  const session = await MvpOnboardingSession.findOne(
    currentSessionFilter(currentUserId)
  ).lean<StoredSession | null>();
  if (!session) {
    throw new DomainError({
      code: 'MVP_ONBOARDING_NOT_STARTED',
      status: 409,
      message: 'MVP onboarding consent must be confirmed first',
    });
  }
  return session;
};

const start = async (input: {
  currentUserId: string;
  mutation: MvpOnboardingStartInput;
}): Promise<MvpOnboardingResponseDTO> => {
  assertCurrentRevisions(input.mutation);
  const consent = input.mutation.consent;
  if (
    !consent.adultConfirmed ||
    !consent.voluntaryParticipationConfirmed ||
    !consent.privacyAcknowledged
  ) {
    validationError(
      'Adult age, voluntary participation, and privacy acknowledgement are required'
    );
  }

  const now = new Date();
  const session = await MvpOnboardingSession.findOneAndUpdate(
    currentSessionFilter(input.currentUserId),
    {
      $setOnInsert: {
        userId: input.currentUserId,
        status: 'in_progress',
        contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
        policyVersion: MVP_ONBOARDING_POLICY_VERSION,
        consent: {
          adultConfirmed: true,
          voluntaryParticipationConfirmed: true,
          privacyAcknowledged: true,
          confirmedAt: now,
        },
        cursor: 0,
        answers: [],
        factorEngine: {
          status: 'PENDING',
          evidenceEventIds: [],
          individualSnapshotIds: [],
        },
        startedAt: now,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean<StoredSession | null>();

  if (!session) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'MVP onboarding session was not created',
    });
  }
  return responseDTO(session);
};

const saveAnswer = async (input: {
  currentUserId: string;
  mutation: MvpOnboardingAnswerInput;
}): Promise<MvpOnboardingResponseDTO> => {
  const question = questionById(input.mutation.questionId);
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const session = await requireCurrentSession(input.currentUserId);
    if (session.status === 'completed') {
      stateConflict(
        'MVP_ONBOARDING_ALREADY_COMPLETED',
        'Completed MVP onboarding cannot be edited'
      );
    }

    const revised = reviseMvpOnboardingAnswers({
      answers: session.answers,
      question,
      questionRevision: input.mutation.questionRevision,
      capturePolicy: input.mutation.capturePolicy,
      value: input.mutation.value,
      answeredAt: new Date(),
    });
    if (!revised.changed) return responseDTO(session);

    const now = new Date();
    const updated = await MvpOnboardingSession.findOneAndUpdate(
      {
        _id: session._id,
        status: 'in_progress',
        updatedAt: session.updatedAt,
      },
      {
        $set: {
          answers: revised.answers,
          cursor: buildMvpOnboardingCursor(revised.answers),
          updatedAt: now,
        },
      },
      { new: true }
    ).lean<StoredSession | null>();
    if (updated) return responseDTO(updated);
  }

  return stateConflict(
    'MVP_ONBOARDING_CONCURRENT_UPDATE',
    'Onboarding changed concurrently; retry the request'
  );
};

const materializeCompletedOnboarding = async (input: {
  currentUserId: string;
  session: StoredSession;
}): Promise<StoredSession> => {
  if (input.session.factorEngine?.status === 'MATERIALIZED') {
    return input.session;
  }
  const materialized = await materializeOnboardingFactorEvidence({
    sessionId: String(input.session._id),
    subjectId: input.currentUserId,
    session: input.session,
  });
  const updated = await MvpOnboardingSession.findOneAndUpdate(
    {
      _id: input.session._id,
      userId: input.currentUserId,
      status: 'completed',
      $or: [
        { 'factorEngine.status': 'PENDING' },
        { factorEngine: { $exists: false } },
      ],
    },
    {
      $set: {
        factorEngine: {
          status: 'MATERIALIZED',
          registryVersion: materialized.registryVersion,
          evidenceEventIds: materialized.evidenceEventIds,
          individualSnapshotIds: materialized.individualSnapshotIds,
        },
      },
    },
    { new: true }
  ).lean<StoredSession | null>();
  if (updated) return updated;
  const canonical = await MvpOnboardingSession.findById(input.session._id).lean<
    StoredSession | null
  >();
  if (canonical?.factorEngine?.status === 'MATERIALIZED') return canonical;
  throw new DomainError({
    code: 'IDEMPOTENCY_IN_PROGRESS',
    status: 503,
    message: 'Onboarding Factor Engine materialization is still in progress',
  });
};

const complete = async (input: {
  currentUserId: string;
}): Promise<MvpOnboardingResponseDTO> => {
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const session = await requireCurrentSession(input.currentUserId);
    if (session.status === 'completed') {
      return responseDTO(
        await materializeCompletedOnboarding({
          currentUserId: input.currentUserId,
          session,
        })
      );
    }
    if (!canCompleteMvpOnboarding(session.answers)) {
      stateConflict(
        'MVP_ONBOARDING_INCOMPLETE',
        'Answer every required onboarding question before completion'
      );
    }

    const now = new Date();
    const updated = await MvpOnboardingSession.findOneAndUpdate(
      {
        _id: session._id,
        status: 'in_progress',
        updatedAt: session.updatedAt,
      },
      {
        $set: {
          status: 'completed',
          cursor: MVP_ONBOARDING_QUESTIONS.length,
          completedAt: now,
          updatedAt: now,
        },
      },
      { new: true }
    ).lean<StoredSession | null>();
    if (updated) {
      recordProductAnalyticsEvent({
        name: 'onboarding_completed',
        technicalScope: 'onboarding',
        at: now,
      });
      return responseDTO(
        await materializeCompletedOnboarding({
          currentUserId: input.currentUserId,
          session: updated,
        })
      );
    }
  }

  return stateConflict(
    'MVP_ONBOARDING_CONCURRENT_UPDATE',
    'Onboarding changed concurrently; retry the request'
  );
};

export const mvpOnboardingService = {
  async getOwnerState(input: {
    currentUserId: string;
  }): Promise<MvpOnboardingResponseDTO> {
    await connectToDatabase();
    const session = await MvpOnboardingSession.findOne(
      currentSessionFilter(input.currentUserId)
    ).lean<StoredSession | null>();
    return responseDTO(session);
  },

  async mutate(input: {
    currentUserId: string;
    mutation: MvpOnboardingMutationInput;
  }): Promise<MvpOnboardingResponseDTO> {
    await connectToDatabase();
    if (input.mutation.action === 'start') {
      return start({ currentUserId: input.currentUserId, mutation: input.mutation });
    }
    if (input.mutation.action === 'answer') {
      return saveAnswer({
        currentUserId: input.currentUserId,
        mutation: input.mutation,
      });
    }
    return complete({ currentUserId: input.currentUserId });
  },
};
