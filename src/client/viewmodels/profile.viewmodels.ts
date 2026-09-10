import type {
  FactorSemanticCardDTO,
  ProfileSummaryDTO,
} from '@/client/api/types';

const EMPTY_FACTOR_PROFILE: ProfileSummaryDTO['factorProfile'] = {
  scope: 'OWNER',
  source: 'INDIVIDUAL_FACTOR_SNAPSHOT',
  registryVersion: 1,
  latestCalculatedAt: null,
  cards: [],
};

export const createEmptyProfileSummary = (): ProfileSummaryDTO => ({
  user: {
    id: '',
    name: '',
    handle: '',
    avatarUrl: null,
    joinedAt: null,
    lastActiveAt: null,
  },
  factorProfile: {
    ...EMPTY_FACTOR_PROFILE,
    cards: [],
  },
});

const normalizeCard = (card: FactorSemanticCardDTO): FactorSemanticCardDTO => ({
  ...card,
  domain: { ...card.domain },
  dimension: { ...card.dimension },
  confidence: { ...card.confidence },
  freshness: { ...card.freshness },
});

export const normalizeProfileSummary = (
  summary: ProfileSummaryDTO
): ProfileSummaryDTO => ({
  user: { ...summary.user },
  ...(summary.assessments ? { assessments: summary.assessments } : {}),
  factorProfile: {
    ...summary.factorProfile,
    cards: summary.factorProfile.cards.map(normalizeCard),
  },
});
