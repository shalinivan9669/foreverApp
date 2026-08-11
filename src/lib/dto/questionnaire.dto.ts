import type { QuestionItem, QuestionnaireType } from '@/models/Questionnaire';

export type QuestionDTO = {
  id: string;
  domainKey: string;
  topicKey: string;
  scale: QuestionItem['scale'];
  optionCount: number;
  text: Record<string, string>;
  scope?: QuestionItem['scope'];
  audience?: QuestionItem['audience'];
  sensitivity?: QuestionItem['sensitivity'];
  locale?: QuestionItem['locale'];
  explanation?: string;
  contentRevision: string;
};

export type QuestionnaireDTO = {
  id: string;
  contentModel: QuestionnaireType['contentModel'];
  scope: 'personal' | 'couple';
  title: Record<string, string>;
  description?: Record<string, string>;
  target: QuestionnaireType['target'];
  domainKey: string;
  difficulty: QuestionnaireType['difficulty'];
  tags: string[];
  version: number;
  randomize: boolean;
  questions: QuestionDTO[];
};

type ToQuestionnaireDtoOptions = {
  includeQuestions?: boolean;
};

const toQuestionnaireScope = (
  target: QuestionnaireType['target'] | undefined
): 'personal' | 'couple' => (target?.type === 'couple' ? 'couple' : 'personal');

export function toQuestionDTO(question: QuestionItem): QuestionDTO {
  return {
    id: question.id,
    domainKey: question.domainKey,
    topicKey: question.topicKey,
    scale: question.scale,
    optionCount: question.optionCount,
    text: question.text,
    scope: question.scope,
    audience: question.audience,
    sensitivity: question.sensitivity,
    locale: question.locale,
    explanation: question.explanation,
    contentRevision: question.contentRevision,
  };
}

export function toQuestionnaireDTO(
  questionnaire: QuestionnaireType,
  opts: ToQuestionnaireDtoOptions = {}
): QuestionnaireDTO {
  const includeQuestions = opts.includeQuestions ?? true;

  return {
    id: questionnaire._id,
    contentModel: questionnaire.contentModel,
    scope: toQuestionnaireScope(questionnaire.target),
    title: questionnaire.title,
    description: questionnaire.description,
    target: questionnaire.target,
    domainKey: questionnaire.domainKey,
    difficulty: questionnaire.difficulty,
    tags: questionnaire.tags ?? [],
    version: questionnaire.version,
    randomize: questionnaire.randomize,
    questions: includeQuestions
      ? questionnaire.questions.map((question) => toQuestionDTO(question))
      : [],
  };
}
