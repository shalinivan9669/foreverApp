import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import {
  Insight,
  type InsightEvidenceValue,
  type InsightRuleId,
  type InsightSeverity,
  type InsightType,
  type InsightOwnerType,
} from '@/models/Insight';
import type { Axis } from '@/domain/vectors';
import {
  DEFAULT_SCORING_CONFIG,
  readAxisLayer,
  type NormalizedVectorLayer,
} from '@/domain/services/vectorScoring.service';
import { DomainError } from '@/domain/errors';

export const INSIGHT_COOLDOWN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_FATIGUE = 0.7;
const DOMESTIC_RISK_FACETS = [
  'fairness',
  'load',
  'load_balance',
  'load_awareness',
  'domestic_fairness',
  'invisible_labor',
];

type InsightVisibility = InsightType['visibility'];

export type InsightCandidate = {
  ownerType: InsightOwnerType;
  userId?: string;
  pairId?: string;
  trigger: {
    ruleId: InsightRuleId;
    axis?: Axis;
    evidence?: InsightEvidenceValue;
  };
  severity: InsightSeverity;
  title: string;
  safeWording: string;
  recommendedAction: string;
  visibility: InsightVisibility;
  cooldownDays?: number;
};

type StoredInsight = InsightType & { _id: Types.ObjectId };

export type InsightDTO = {
  id: string;
  ownerType: InsightOwnerType;
  userId?: string;
  pairId?: string;
  ruleId: InsightRuleId;
  axis?: Axis;
  severity: InsightSeverity;
  title: string;
  safeWording: string;
  recommendedAction: string;
  pairShared: boolean;
  cooldownUntil: Date;
  createdAt: Date;
};

type ExistingInsightForDedupe = Pick<
  InsightType,
  'ownerType' | 'userId' | 'pairId' | 'trigger' | 'status' | 'cooldownUntil'
>;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY_MS);

const normalizeFacet = (facet: string): string => facet.trim().toLowerCase();

export const hasFacet = (values: string[] | undefined, axis: Axis, facet: string): boolean => {
  const normalized = new Set((values ?? []).map(normalizeFacet));
  const target = normalizeFacet(facet);
  return normalized.has(target) || normalized.has(normalizeFacet(`${axis}.${facet}`));
};

const hasAnyFacet = (
  values: string[] | undefined,
  axis: Axis,
  facets: string[]
): boolean => facets.some((facet) => hasFacet(values, axis, facet));

const pairVisibility = (members: [string, string]): InsightVisibility => ({
  showToUserIds: members,
  pairShared: true,
});

const userVisibility = (userId: string): InsightVisibility => ({
  showToUserIds: [userId],
  pairShared: false,
});

const pairCandidate = (input: {
  pairId: string;
  members: [string, string];
  ruleId: InsightRuleId;
  axis: Axis;
  severity: InsightSeverity;
  title: string;
  safeWording: string;
  recommendedAction: string;
  evidence: InsightEvidenceValue;
}): InsightCandidate => ({
  ownerType: 'pair',
  pairId: input.pairId,
  trigger: {
    ruleId: input.ruleId,
    axis: input.axis,
    evidence: input.evidence,
  },
  severity: input.severity,
  title: input.title,
  safeWording: input.safeWording,
  recommendedAction: input.recommendedAction,
  visibility: pairVisibility(input.members),
});

const userCandidate = (input: {
  userId: string;
  ruleId: InsightRuleId;
  axis: Axis;
  severity: InsightSeverity;
  title: string;
  safeWording: string;
  recommendedAction: string;
  evidence: InsightEvidenceValue;
}): InsightCandidate => ({
  ownerType: 'user',
  userId: input.userId,
  trigger: {
    ruleId: input.ruleId,
    axis: input.axis,
    evidence: input.evidence,
  },
  severity: input.severity,
  title: input.title,
  safeWording: input.safeWording,
  recommendedAction: input.recommendedAction,
  visibility: userVisibility(input.userId),
});

const effectivePsyche = (user: UserType): NormalizedVectorLayer => {
  const state = readAxisLayer(user, 'psyche', 'state');
  if (state.evidenceCount > 0 || state.confidence > 0) return state;
  return readAxisLayer(user, 'psyche', 'trait');
};

const ownerMatches = (
  candidate: InsightCandidate,
  existing: ExistingInsightForDedupe
): boolean => {
  if (candidate.ownerType !== existing.ownerType) return false;
  if (candidate.trigger.ruleId !== existing.trigger.ruleId) return false;
  if (candidate.ownerType === 'user') {
    return candidate.userId === existing.userId;
  }
  return String(candidate.pairId) === String(existing.pairId);
};

export const dedupeInsightCandidates = (
  candidates: InsightCandidate[],
  existing: ExistingInsightForDedupe[],
  now = new Date()
): InsightCandidate[] =>
  candidates.filter((candidate) => {
    const duplicateInCooldown = existing.some((item) => {
      if (item.status !== 'active') return false;
      if (item.cooldownUntil.getTime() <= now.getTime()) return false;
      return ownerMatches(candidate, item);
    });
    return !duplicateInCooldown;
  });

export const buildPairInsightCandidates = (input: {
  pairId: string;
  members: [string, string];
  left: UserType;
  right: UserType;
  fatigue?: PairType['fatigue'];
}): InsightCandidate[] => {
  const candidates: InsightCandidate[] = [];
  const communicationLeft = readAxisLayer(input.left, 'communication', 'trait');
  const communicationRight = readAxisLayer(input.right, 'communication', 'trait');
  const financeLeft = readAxisLayer(input.left, 'finance', 'trait');
  const financeRight = readAxisLayer(input.right, 'finance', 'trait');
  const domesticLeft = readAxisLayer(input.left, 'domestic', 'trait');
  const domesticRight = readAxisLayer(input.right, 'domestic', 'trait');
  const psycheLeft = effectivePsyche(input.left);
  const psycheRight = effectivePsyche(input.right);
  const fatigueScore = clamp01(input.fatigue?.score ?? 0);
  const financeDelta = Math.abs(financeLeft.level - financeRight.level);
  const directnessAsymmetry =
    (hasFacet(communicationLeft.positives, 'communication', 'directness') &&
      (hasFacet(communicationRight.negatives, 'communication', 'directness') ||
        hasFacet(communicationRight.negatives, 'communication', 'avoidance'))) ||
    (hasFacet(communicationRight.positives, 'communication', 'directness') &&
      (hasFacet(communicationLeft.negatives, 'communication', 'directness') ||
        hasFacet(communicationLeft.negatives, 'communication', 'avoidance')));

  if (
    hasFacet(communicationLeft.negatives, 'communication', 'avoidance') &&
    hasFacet(communicationRight.negatives, 'communication', 'avoidance')
  ) {
    candidates.push(
      pairCandidate({
        pairId: input.pairId,
        members: input.members,
        ruleId: 'both_conflict_avoidance',
        axis: 'communication',
        severity: 2,
        title: 'Сложные темы могут откладываться',
        safeWording:
          'По ответам видно, что вы оба можете откладывать напряжённые разговоры. Нерешённые темы могут копиться.',
        recommendedAction: 'Короткий структурированный разговор на 10 минут.',
        evidence: {
          leftAvoidance: true,
          rightAvoidance: true,
          leftConfidence: communicationLeft.confidence,
          rightConfidence: communicationRight.confidence,
        },
      })
    );
  }

  if (
    financeDelta >= DEFAULT_SCORING_CONFIG.axisThresholds.deltaHigh &&
    Math.min(financeLeft.confidence, financeRight.confidence) >=
      DEFAULT_SCORING_CONFIG.lowConfidenceThreshold
  ) {
    candidates.push(
      pairCandidate({
        pairId: input.pairId,
        members: input.members,
        ruleId: 'finance_delta_high',
        axis: 'finance',
        severity: 2,
        title: 'Разный стиль финансовых решений',
        safeWording:
          'По ответам видно различие в подходе к деньгам. Лучше обсуждать правила заранее.',
        recommendedAction: 'Разговор о правилах бюджета и крупных трат.',
        evidence: {
          leftLevel: financeLeft.level,
          rightLevel: financeRight.level,
          delta: financeDelta,
        },
      })
    );
  }

  if (directnessAsymmetry) {
    candidates.push(
      pairCandidate({
        pairId: input.pairId,
        members: input.members,
        ruleId: 'directness_asymmetry',
        axis: 'communication',
        severity: 1,
        title: 'Один говорит прямее другого',
        safeWording:
          'Один из вас быстрее проговаривает проблему, другой может закрываться или ждать.',
        recommendedAction: 'Разговор через короткие просьбы и уточнения без давления.',
        evidence: {
          leftPositiveDirectness: hasFacet(
            communicationLeft.positives,
            'communication',
            'directness'
          ),
          rightPositiveDirectness: hasFacet(
            communicationRight.positives,
            'communication',
            'directness'
          ),
        },
      })
    );
  }

  if (
    fatigueScore >= HIGH_FATIGUE &&
    (psycheLeft.level <= DEFAULT_SCORING_CONFIG.axisThresholds.low ||
      psycheRight.level <= DEFAULT_SCORING_CONFIG.axisThresholds.low)
  ) {
    candidates.push(
      pairCandidate({
        pairId: input.pairId,
        members: input.members,
        ruleId: 'psyche_low_fatigue_high',
        axis: 'psyche',
        severity: 2,
        title: 'Сейчас ресурс низкий',
        safeWording:
          'По ответам виден низкий текущий ресурс на фоне высокой усталости пары. Лучше снизить нагрузку.',
        recommendedAction: 'Лёгкий check-in вместо тяжёлого разговора.',
        evidence: {
          fatigueScore,
          leftLevel: psycheLeft.level,
          rightLevel: psycheRight.level,
        },
      })
    );
  }

  if (
    hasAnyFacet(domesticLeft.negatives, 'domestic', DOMESTIC_RISK_FACETS) ||
    hasAnyFacet(domesticRight.negatives, 'domestic', DOMESTIC_RISK_FACETS)
  ) {
    candidates.push(
      pairCandidate({
        pairId: input.pairId,
        members: input.members,
        ruleId: 'domestic_fairness_risk',
        axis: 'domestic',
        severity: 2,
        title: 'Быт может ощущаться несправедливым',
        safeWording:
          'Один может чувствовать перекос нагрузки, другой может не видеть часть задач.',
        recommendedAction: 'Разбор бытовых задач и явное закрепление зон ответственности.',
        evidence: {
          leftNegatives: domesticLeft.negatives,
          rightNegatives: domesticRight.negatives,
        },
      })
    );
  }

  return candidates;
};

export const buildUserInsightCandidates = (input: {
  user: UserType;
  activePair?: Pick<PairType, 'fatigue'>;
}): InsightCandidate[] => {
  const psyche = effectivePsyche(input.user);
  const fatigueScore = clamp01(input.activePair?.fatigue?.score ?? 0);

  if (
    fatigueScore < HIGH_FATIGUE ||
    psyche.level > DEFAULT_SCORING_CONFIG.axisThresholds.low
  ) {
    return [];
  }

  return [
    userCandidate({
      userId: input.user.id,
      ruleId: 'psyche_low_fatigue_high',
      axis: 'psyche',
      severity: 2,
      title: 'Сейчас ресурс низкий',
      safeWording:
        'По ответам виден низкий текущий ресурс на фоне высокой усталости. Лучше снизить нагрузку.',
      recommendedAction: 'Пауза или лёгкий check-in вместо тяжёлого разговора.',
      evidence: {
        fatigueScore,
        psycheLevel: psyche.level,
        confidence: psyche.confidence,
      },
    }),
  ];
};

const findExistingForCandidates = async (
  candidates: InsightCandidate[]
): Promise<StoredInsight[]> => {
  if (candidates.length === 0) return [];

  const userRules = candidates
    .filter((candidate) => candidate.ownerType === 'user' && candidate.userId)
    .map((candidate) => ({
      ownerType: candidate.ownerType,
      userId: candidate.userId,
      'trigger.ruleId': candidate.trigger.ruleId,
    }));
  const pairRules = candidates
    .filter((candidate) => candidate.ownerType === 'pair' && candidate.pairId)
    .map((candidate) => ({
      ownerType: candidate.ownerType,
      pairId: candidate.pairId,
      'trigger.ruleId': candidate.trigger.ruleId,
    }));
  const clauses = [...userRules, ...pairRules];
  if (clauses.length === 0) return [];

  return Insight.find({ $or: clauses }).lean<StoredInsight[]>();
};

export const persistInsightCandidates = async (
  candidates: InsightCandidate[],
  now = new Date()
): Promise<StoredInsight[]> => {
  const existing = await findExistingForCandidates(candidates);
  const fresh = dedupeInsightCandidates(candidates, existing, now);
  if (fresh.length === 0) return [];

  const docs = fresh.map((candidate) => ({
    ownerType: candidate.ownerType,
    userId: candidate.userId,
    pairId: candidate.pairId,
    trigger: candidate.trigger,
    severity: candidate.severity,
    title: candidate.title,
    safeWording: candidate.safeWording,
    recommendedAction: candidate.recommendedAction,
    visibility: candidate.visibility,
    status: 'active' as const,
    cooldownUntil: addDays(now, candidate.cooldownDays ?? INSIGHT_COOLDOWN_DAYS),
  }));

  const created = await Insight.create(docs);
  return created.map((doc) => doc.toObject() as StoredInsight);
};

export const toInsightDTO = (insight: StoredInsight): InsightDTO => ({
  id: String(insight._id),
  ownerType: insight.ownerType,
  userId: insight.userId,
  pairId: insight.pairId ? String(insight.pairId) : undefined,
  ruleId: insight.trigger.ruleId,
  axis: insight.trigger.axis,
  severity: insight.severity,
  title: insight.title,
  safeWording: insight.safeWording,
  recommendedAction: insight.recommendedAction,
  pairShared: insight.visibility.pairShared,
  cooldownUntil: insight.cooldownUntil,
  createdAt: insight.createdAt,
});

export const toCandidatePreviewDTO = (
  candidate: InsightCandidate,
  now = new Date()
): Omit<InsightDTO, 'id'> => ({
  ownerType: candidate.ownerType,
  userId: candidate.userId,
  pairId: candidate.pairId,
  ruleId: candidate.trigger.ruleId,
  axis: candidate.trigger.axis,
  severity: candidate.severity,
  title: candidate.title,
  safeWording: candidate.safeWording,
  recommendedAction: candidate.recommendedAction,
  pairShared: candidate.visibility.pairShared,
  cooldownUntil: addDays(now, candidate.cooldownDays ?? INSIGHT_COOLDOWN_DAYS),
  createdAt: now,
});

const uniqueLatestByRule = (insights: StoredInsight[]): StoredInsight[] => {
  const byRule = new Map<string, StoredInsight>();
  for (const insight of insights) {
    const key = `${insight.ownerType}:${String(insight.userId ?? insight.pairId)}:${insight.trigger.ruleId}`;
    const previous = byRule.get(key);
    if (!previous || previous.createdAt.getTime() < insight.createdAt.getTime()) {
      byRule.set(key, insight);
    }
  }
  return Array.from(byRule.values()).sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
};

const listVisibleInsights = async (filter: {
  currentUserId: string;
  ownerType: InsightOwnerType;
  userId?: string;
  pairId?: string;
}): Promise<InsightDTO[]> => {
  const ownerFilter =
    filter.ownerType === 'user'
      ? { ownerType: 'user' as const, userId: filter.userId }
      : { ownerType: 'pair' as const, pairId: filter.pairId };

  const rows = await Insight.find({
    ...ownerFilter,
    status: 'active',
    'visibility.showToUserIds': filter.currentUserId,
  })
    .sort({ createdAt: -1 })
    .lean<StoredInsight[]>();

  return uniqueLatestByRule(rows).map(toInsightDTO);
};

export const listMyInsights = async (currentUserId: string): Promise<InsightDTO[]> => {
  await connectToDatabase();

  const user = await User.findOne({ id: currentUserId }).lean<UserType | null>();
  if (!user) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'User not found',
    });
  }

  const activePair = await Pair.findOne({
    members: currentUserId,
    status: { $in: ['active', 'paused'] },
  })
    .sort({ createdAt: -1 })
    .lean<Pick<PairType, 'fatigue'> | null>();

  await persistInsightCandidates(
    buildUserInsightCandidates({
      user,
      activePair: activePair ?? undefined,
    })
  );

  return listVisibleInsights({
    currentUserId,
    ownerType: 'user',
    userId: currentUserId,
  });
};

export const listPairInsights = async (
  pairId: string,
  currentUserId: string
): Promise<InsightDTO[]> => {
  const pairGuard = await requirePairMember(pairId, currentUserId);
  if (!pairGuard.ok) {
    const response = pairGuard.response;
    throw new DomainError({
      code: response.status === 403 ? 'ACCESS_DENIED' : 'NOT_FOUND',
      status: response.status,
      message: response.status === 403 ? 'forbidden' : 'pair not found',
    });
  }

  const pair = pairGuard.data.pair;
  const members: [string, string] = [pair.members[0], pair.members[1]];
  const [left, right] = await Promise.all([
    User.findOne({ id: members[0] }).lean<UserType | null>(),
    User.findOne({ id: members[1] }).lean<UserType | null>(),
  ]);

  if (!left || !right) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Pair members are missing',
    });
  }

  await persistInsightCandidates(
    buildPairInsightCandidates({
      pairId,
      members,
      left,
      right,
      fatigue: pair.fatigue,
    })
  );

  return listVisibleInsights({
    currentUserId,
    ownerType: 'pair',
    pairId,
  });
};
