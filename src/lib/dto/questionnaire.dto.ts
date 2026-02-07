import type { QuestionType } from '@/models/Question';
import type { QuestionItem, QuestionnaireType } from '@/models/Questionnaire';

export type QuestionDTO = {
  id: string;
  _id?: string;
  axis: QuestionType['axis'];
  facet: string;
  polarity: QuestionType['polarity'] | 'neutral';
  scale: QuestionType['scale'];
  map: number[];
  weight: number;
  text: Record<string, string>;
};

export type QuestionnaireDTO = {
  id: string;
  _id?: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  meta?: QuestionnaireType['meta'];
  target: QuestionnaireType['target'];
  axis: QuestionnaireType['axis'];
  difficulty: QuestionnaireType['difficulty'];
  tags: string[];
  version: number;
  randomize: boolean;
  questions: QuestionDTO[];
};

type QuestionSource = QuestionType | QuestionItem;

type ToQuestionDtoOptions = {
  includeLegacyId?: boolean;
};

type ToQuestionnaireDtoOptions = {
  includeLegacyId?: boolean;
  includeQuestions?: boolean;
};

const getQuestionId = (question: QuestionSource): string => {
  if ('id' in question && typeof question.id === 'string' && question.id.length > 0) {
    return question.id;
  }
  if ('_id' in question && typeof question._id === 'string' && question._id.length > 0) {
    return question._id;
  }
  return '';
};

export function toQuestionDTO(
  question: QuestionSource,
  opts: ToQuestionDtoOptions = {}
): QuestionDTO {
  const includeLegacyId = opts.includeLegacyId ?? true;
  const id = getQuestionId(question);

  const dto: QuestionDTO = {
    id,
    axis: question.axis,
    facet: question.facet,
    polarity: question.polarity,
    scale: question.scale,
    map: question.map,
    weight: question.weight,
    text: question.text,
  };

  if (includeLegacyId) dto._id = id;
  return dto;
}

export function toQuestionnaireDTO(
  questionnaire: QuestionnaireType,
  opts: ToQuestionnaireDtoOptions = {}
): QuestionnaireDTO {
  const includeLegacyId = opts.includeLegacyId ?? true;
  const includeQuestions = opts.includeQuestions ?? true;

  const dto: QuestionnaireDTO = {
    id: questionnaire._id,
    title: questionnaire.title,
    description: questionnaire.description,
    meta: questionnaire.meta,
    target: questionnaire.target,
    axis: questionnaire.axis,
    difficulty: questionnaire.difficulty,
    tags: questionnaire.tags ?? [],
    version: questionnaire.version,
    randomize: questionnaire.randomize,
    questions: includeQuestions
      ? questionnaire.questions.map((question) => toQuestionDTO(question, { includeLegacyId }))
      : [],
  };

  if (includeLegacyId) dto._id = questionnaire._id;
  return dto;
}

