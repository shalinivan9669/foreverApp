import { connectToDatabase } from '@/lib/mongodb';
import {
  Questionnaire,
  publishedQuestionnaireFilter,
  type QuestionnaireType,
} from '@/models/Questionnaire';
import {
  toQuestionnaireDTO,
  type QuestionnaireDTO,
} from '@/lib/dto/questionnaire.dto';

type QuestionnaireCatalogQuery = {
  target?: 'couple' | 'individual';
  audience?: 'personal' | 'couple';
};

const normalizedTarget = (
  input: QuestionnaireCatalogQuery
): 'couple' | 'individual' | undefined =>
  input.target ??
  (input.audience === 'personal'
    ? 'individual'
    : input.audience === 'couple'
      ? 'couple'
      : undefined);

export const questionnaireCatalogService = {
  async listPublished(
    input: QuestionnaireCatalogQuery
  ): Promise<QuestionnaireDTO[]> {
    await connectToDatabase();

    const filter = publishedQuestionnaireFilter();
    const target = normalizedTarget(input);
    if (target) filter['target.type'] = target;

    const questionnaires = await Questionnaire.find(filter).lean<
      QuestionnaireType[]
    >();
    return questionnaires.map((questionnaire) =>
      toQuestionnaireDTO(questionnaire)
    );
  },

  async getPublishedById(id: string): Promise<QuestionnaireDTO | null> {
    await connectToDatabase();

    const questionnaire = await Questionnaire.findOne({
      _id: id,
      ...publishedQuestionnaireFilter(),
    }).lean<QuestionnaireType | null>();
    return questionnaire ? toQuestionnaireDTO(questionnaire) : null;
  },
};
