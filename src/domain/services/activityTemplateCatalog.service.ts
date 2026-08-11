import { connectToDatabase } from '@/lib/mongodb';
import {
  ActivityTemplate,
  publishedActivityTemplateFilter,
  type ActivityTemplateType,
} from '@/models/ActivityTemplate';
import {
  toActivityTemplateDTO,
  type ActivityTemplateDTO,
} from '@/lib/dto/activity.dto';

export type ActivityTemplateCatalogQuery = {
  targetFactorKey?: string;
  actionKey?: string;
  intent?: string;
  difficulty?: number;
  limit?: number;
};

export const activityTemplateCatalogService = {
  async listPublished(
    input: ActivityTemplateCatalogQuery
  ): Promise<ActivityTemplateDTO[]> {
    await connectToDatabase();

    const filter = publishedActivityTemplateFilter();
    if (input.targetFactorKey) filter.targetFactorKeys = input.targetFactorKey;
    if (input.actionKey) filter['actionDefinition.key'] = input.actionKey;
    if (input.intent) filter.intent = input.intent;
    if (input.difficulty) filter.difficulty = input.difficulty;

    const templates = await ActivityTemplate.find(filter)
      .sort({ updatedAt: -1 })
      .limit(input.limit ?? 50)
      .lean<ActivityTemplateType[]>();

    return templates.map((template) => toActivityTemplateDTO(template));
  },
};
