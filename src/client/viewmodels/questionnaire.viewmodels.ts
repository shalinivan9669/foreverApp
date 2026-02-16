import type { QuestionnaireCardDTO } from '@/client/api/types';

export type QuestionnaireAxisVM =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

export type QuestionnaireAudienceVM = 'pair' | 'solo' | 'universal';
export type QuestionnaireScopeVM = 'personal' | 'couple';
export type QuestionnaireStatusVM = 'new' | 'required' | 'in_progress' | 'completed' | 'locked';
export type QuestionnaireCtaVM = 'start' | 'continue' | 'result' | 'locked';

export type QuestionnaireCardVM = {
  id: string;
  vector: QuestionnaireAxisVM;
  scope: QuestionnaireScopeVM;
  audience: QuestionnaireAudienceVM;
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  rewardCoins?: number;
  insightsCount?: number;
  status: QuestionnaireStatusVM;
  progressPct?: number;
  lockReason?: string;
  cta: QuestionnaireCtaVM;
  isStarter: boolean;
  pairId: string | null;
};

const clampProgress = (value?: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const normalizeTags = (tags: string[]): string[] =>
  Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
    : [];

export const toQuestionnaireCardVM = (dto: QuestionnaireCardDTO): QuestionnaireCardVM => ({
  id: dto.id,
  vector: dto.vector,
  scope: dto.scope,
  audience: dto.audience,
  title: dto.title,
  subtitle: dto.subtitle,
  tagsPublic: normalizeTags(dto.tagsPublic),
  tagsHiddenCount: typeof dto.tagsHiddenCount === 'number' ? Math.max(0, dto.tagsHiddenCount) : 0,
  questionCount: dto.questionCount,
  estMinutesMin: dto.estMinutesMin,
  estMinutesMax: dto.estMinutesMax,
  level: dto.level,
  rewardCoins: dto.rewardCoins,
  insightsCount: dto.insightsCount,
  status: dto.status,
  progressPct: clampProgress(dto.progressPct),
  lockReason: dto.lockReason,
  cta: dto.cta,
  isStarter: dto.isStarter === true,
  pairId: typeof dto.pairId === 'string' ? dto.pairId : null,
});

export const toQuestionnaireCardVMList = (
  cards: QuestionnaireCardDTO[] | null | undefined
): QuestionnaireCardVM[] => {
  if (!Array.isArray(cards)) return [];
  return cards.map(toQuestionnaireCardVM);
};
