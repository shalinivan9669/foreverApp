import mongoose, { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import {
  ActivityTemplate,
  publishedActivityTemplateFilter,
  type ActivityTemplateType,
} from '@/models/ActivityTemplate';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import type { RecommendationSummaryContext } from '@/models/RecommendationProvenance';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  toActivityOfferDTO,
  toPairActivityDTO,
  type ActivityOfferDTO,
  type PairActivityDTO,
} from '@/lib/dto';
import {
  buildPairActivitySuggestionPlan,
  SYSTEM_ACTIVITY_TEMPLATES,
  type PairActivitySuggestionPlan,
} from '@/domain/services/pairActivityDecision.service';
import { effectiveActivityCheckIns } from '@/utils/activities';
import {
  isOwnerSafetyGateActive,
  isSafetyFallbackTemplateId,
} from '@/domain/services/safetyGate.service';
import {
  hasEligibleActivityFactorBinding,
  isActivityAccessibleToRole,
  isOfferedActivityEligibleForRole,
} from '@/domain/services/activityEligibility.service';
import {
  buildActivityContentHash,
  buildRecommendationProvenance,
  recommendationProvenanceMatchesContext,
} from '@/domain/services/recommendationProvenance.service';
import {
  readActivityRecommendationInputs,
  resolveActivityFactorBinding,
} from '@/domain/services/activityFactorRuntime.service';

type GuardErrorPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string };
};

type OfferSource =
  | 'pairs.suggest'
  | 'pairs.activities.suggest'
  | 'activities.next';
type StoredActivity = PairActivityType & { _id: Types.ObjectId };
type TemplateCandidate = ActivityTemplateType & {
  why?: { ru?: string; en?: string };
  mode?: PairActivityType['mode'];
  sync?: PairActivityType['sync'];
  visibility?: PairActivityType['visibility'];
};

type EffectiveSuggestionPlan = PairActivitySuggestionPlan & {
  recentActivitySignals: RecentActivitySignals;
};

export type ActivityOfferReliabilityTestHooks = {
  beforeTransactionalPairGuard?: () => Promise<void>;
};

export type PairActivitySuggestionPlanDTO = {
  status: PairActivitySuggestionPlan['status'];
  reasonCode: 'CURRENT_ACTIVITY' | 'PAIR_UNAVAILABLE' | 'FACTOR_SUPPORT';
  explanation: { ru: string; en: string };
  decisionVersion: 'activity-decision-v2';
};

export type PairActivitySuggestionResult = {
  plan: PairActivitySuggestionPlanDTO;
  currentActivity: PairActivityDTO | null;
  offers: PairActivityDTO[];
  createdCount: number;
  skippedReason?: string;
};

export type RecentActivitySignals = {
  lastCompletedStatus?: Extract<
    PairActivityType['status'],
    'completed_success' | 'completed_partial' | 'failed'
  >;
  lastActionKey?: string;
  lastArchetype?: PairActivityType['archetype'];
  lowComfortRecently: boolean;
  wantsSimilarRecently: boolean;
};

const ACTIVE_STATUSES: PairActivityType['status'][] = [
  'accepted',
  'in_progress',
  'awaiting_feedback',
  'awaiting_checkin',
];
const COOLDOWN_STATUSES: PairActivityType['status'][] = [
  'offered',
  ...ACTIVE_STATUSES,
  'completed_success',
  'completed_partial',
  'failed',
  'cancelled',
];
const DAY_MS = 24 * 60 * 60 * 1000;

const unavailable = (): never => {
  throw new DomainError({
    code: 'ACTIVITY_UNAVAILABLE',
    status: 409,
    message: 'Activity is unavailable',
  });
};

const requireAvailable = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new DomainError({
      code: 'ACTIVITY_UNAVAILABLE',
      status: 409,
      message: 'Activity is unavailable',
    });
  }
  return value;
};

const guardFailureToDomainError = async (
  response: Response
): Promise<DomainError> => {
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as GuardErrorPayload | null;
  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensurePairMember = async (pairId: string, currentUserId: string) => {
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) throw await guardFailureToDomainError(guard.response);
  return guard.data;
};

const assertActivePairForOffer = async (input: {
  pairId: Types.ObjectId;
  currentUserId: string;
  session: ClientSession;
}): Promise<void> => {
  const activePair = await Pair.findOneAndUpdate(
    {
      _id: input.pairId,
      members: input.currentUserId,
      status: 'active',
    },
    { $inc: { lifecycleRevision: 1 } },
    { new: false, session: input.session }
  )
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();
  if (!activePair) unavailable();
};

type LeanUser = UserType & { _id: Types.ObjectId };

const resolveMembers = async (
  members: [string, string]
): Promise<[Types.ObjectId, Types.ObjectId]> => {
  const users = await User.find({ id: { $in: members } })
    .lean<LeanUser[]>()
    .exec();
  const first = users.find((user) => user.id === members[0]);
  const second = users.find((user) => user.id === members[1]);
  if (!first || !second) {
    throw new DomainError({
      code: 'PAIR_MEMBERS_MISSING',
      status: 400,
      message: 'Pair members are missing',
    });
  }
  return [first._id, second._id];
};

const buildStepsPreview = (
  template: ActivityTemplateType
): { ru: string[]; en: string[] } | undefined => {
  const ru = template.steps?.ru?.slice(0, 2) ?? [];
  const en = template.steps?.en?.slice(0, 2) ?? [];
  return ru.length || en.length ? { ru, en } : undefined;
};

const sourceRoute = (source: OfferSource): string => {
  if (source === 'pairs.suggest') return '/api/pairs/[id]/suggest';
  if (source === 'pairs.activities.suggest') {
    return '/api/pairs/[id]/activities/suggest';
  }
  return '/api/activities/next';
};

const emitSuggestionsGenerated = async (input: {
  pairId: string;
  currentUserId: string;
  count: number;
  source: OfferSource;
  auditRequest?: AuditRequestContext;
}): Promise<void> => {
  await emitEvent({
    event: 'SUGGESTIONS_GENERATED',
    actor: { userId: input.currentUserId },
    request: input.auditRequest ?? {
      route: sourceRoute(input.source),
      method: 'POST',
    },
    context: { pairId: input.pairId },
    target: { type: 'pair', id: input.pairId },
    metadata: {
      pairId: input.pairId,
      count: input.count,
      source: input.source,
    },
  });
};

const readTemplateId = (
  activity: Pick<PairActivityType, 'stateMeta'>
): string | null => {
  const value = activity.stateMeta?.templateId;
  return typeof value === 'string' && value.trim() ? value : null;
};

const recentActivitySignals = (
  recentActivities: readonly StoredActivity[]
): RecentActivitySignals => {
  const latest = recentActivities.find((activity) =>
    ['completed_success', 'completed_partial', 'failed'].includes(activity.status)
  );
  return {
    lastCompletedStatus:
      latest?.status as RecentActivitySignals['lastCompletedStatus'],
    lastActionKey: latest?.actionDefinition?.key,
    lastArchetype: latest?.archetype,
    lowComfortRecently:
      typeof latest?.resultSummary?.comfortAvg === 'number' &&
      latest.resultSummary.comfortAvg < 0.4,
    wantsSimilarRecently:
      typeof latest?.resultSummary?.wantsSimilarRatio === 'number' &&
      latest.resultSummary.wantsSimilarRatio >= 0.65,
  };
};

const applyRecentActivitySignals = (
  plan: PairActivitySuggestionPlan,
  signals: RecentActivitySignals
): EffectiveSuggestionPlan => {
  const preferredArchetypes = [...plan.preferredArchetypes];
  if (
    signals.wantsSimilarRecently &&
    signals.lastArchetype &&
    preferredArchetypes.includes(signals.lastArchetype)
  ) {
    preferredArchetypes.splice(
      preferredArchetypes.indexOf(signals.lastArchetype),
      1
    );
    preferredArchetypes.unshift(signals.lastArchetype);
  }
  if (
    signals.lastCompletedStatus === 'failed' &&
    signals.lastArchetype &&
    preferredArchetypes.length > 1
  ) {
    const index = preferredArchetypes.indexOf(signals.lastArchetype);
    if (index >= 0) {
      preferredArchetypes.splice(index, 1);
      preferredArchetypes.push(signals.lastArchetype);
    }
  }
  return {
    ...plan,
    preferredDifficulty: signals.lowComfortRecently
      ? (Math.min(plan.preferredDifficulty, 2) as 1 | 2 | 3 | 4 | 5)
      : plan.preferredDifficulty,
    maxIntensity: signals.lowComfortRecently ? 1 : plan.maxIntensity,
    preferredArchetypes,
    explanation: {
      ...plan.explanation,
      ru: `${plan.explanation.ru}${
        signals.lowComfortRecently
          ? ' Следующий формат выбран мягче после недавнего отзыва.'
          : ''
      }`,
    },
    recentActivitySignals: signals,
  };
};

const toPlanDTO = (
  plan: EffectiveSuggestionPlan
): PairActivitySuggestionPlanDTO => {
  if (plan.status === 'blocked_by_current_activity') {
    return {
      status: plan.status,
      reasonCode: 'CURRENT_ACTIVITY',
      explanation: {
        ru: 'Сначала завершите текущую активность или оставьте по ней отзыв.',
        en: 'Finish the current activity or leave its feedback first.',
      },
      decisionVersion: 'activity-decision-v2',
    };
  }
  if (plan.status === 'blocked_by_pair_state') {
    return {
      status: plan.status,
      reasonCode: 'PAIR_UNAVAILABLE',
      explanation: {
        ru: 'Сейчас новая совместная активность недоступна.',
        en: 'A new shared activity is unavailable right now.',
      },
      decisionVersion: 'activity-decision-v2',
    };
  }
  return {
    status: plan.status,
    reasonCode: 'FACTOR_SUPPORT',
    explanation: {
      ru: plan.explanation.ru,
      en: plan.explanation.en ??
        'Selected from current factor signals, eligibility, and cooldown.',
    },
    decisionVersion: 'activity-decision-v2',
  };
};

const effectiveWhy = (
  candidate: TemplateCandidate,
  plan: PairActivitySuggestionPlan
): { ru: string; en: string } => ({
  ru: `${plan.explanation.ru} ${candidate.why?.ru ?? ''}`.trim(),
  en: candidate.why?.en ?? plan.explanation.en ?? plan.explanation.ru,
});

const templateAllowedForPlan = (
  candidate: TemplateCandidate,
  plan: PairActivitySuggestionPlan,
  safetyVeto: boolean
): boolean => {
  if (!hasEligibleActivityFactorBinding(candidate)) return false;
  if (
    safetyVeto &&
    !isSafetyFallbackTemplateId(String(candidate._id))
  ) {
    return false;
  }
  if (!plan.recommendedActionKeys.includes(candidate.actionDefinition.key)) {
    return false;
  }
  if (candidate.intensity > plan.maxIntensity) return false;
  if (candidate.difficulty > plan.preferredDifficulty) return false;
  if (!plan.preferredArchetypes.includes(candidate.archetype)) return false;
  if (plan.requiredMode && candidate.mode && candidate.mode !== plan.requiredMode) {
    return false;
  }
  if (plan.requiredSync && candidate.sync && candidate.sync !== plan.requiredSync) {
    return false;
  }
  return true;
};

const candidateScore = (
  candidate: TemplateCandidate,
  plan: PairActivitySuggestionPlan
): number => {
  const actionIndex = plan.recommendedActionKeys.indexOf(
    candidate.actionDefinition.key
  );
  const archetypeIndex = plan.preferredArchetypes.indexOf(candidate.archetype);
  return (
    (actionIndex >= 0 ? 100 - actionIndex * 20 : 0) +
    (archetypeIndex >= 0 ? 30 - archetypeIndex * 3 : 0) +
    (10 - Math.abs(plan.preferredDifficulty - candidate.difficulty))
  );
};

const loadCandidates = async (
  plan: PairActivitySuggestionPlan,
  safetyVeto: boolean
): Promise<TemplateCandidate[]> => {
  const stored = safetyVeto
    ? []
    : await ActivityTemplate.find({
        ...publishedActivityTemplateFilter(),
        'actionDefinition.registryVersion':
          SYSTEM_ACTIVITY_TEMPLATES[0]?.actionDefinition.registryVersion,
        'actionDefinition.key': { $in: plan.recommendedActionKeys },
        difficulty: { $lte: plan.preferredDifficulty },
        intensity: { $lte: plan.maxIntensity },
      })
        .sort({ updatedAt: -1, _id: 1 })
        .limit(50)
        .lean<ActivityTemplateType[]>();
  const unique = new Map<string, TemplateCandidate>();
  for (const candidate of [...stored, ...SYSTEM_ACTIVITY_TEMPLATES]) {
    const id = String(candidate._id);
    if (
      !unique.has(id) &&
      templateAllowedForPlan(candidate, plan, safetyVeto)
    ) {
      unique.set(id, candidate);
    }
  }
  return [...unique.values()].sort((left, right) => {
    const score = candidateScore(right, plan) - candidateScore(left, plan);
    return score || String(left._id).localeCompare(String(right._id));
  });
};

const actionBlockedByCooldown = (
  actionKey: string,
  recentActivities: readonly StoredActivity[],
  now: Date
): boolean =>
  recentActivities.some((activity) => {
    if (activity.actionDefinition?.key !== actionKey) return false;
    const lastAt = activity.offeredAt ?? activity.createdAt;
    if (!lastAt) return true;
    const cooldownDays = activity.cooldownDays ?? 14;
    return now.getTime() - new Date(lastAt).getTime() < cooldownDays * DAY_MS;
  });

const selectCandidatesOutsideCooldown = (
  candidates: readonly TemplateCandidate[],
  recentActivities: readonly StoredActivity[],
  count: number,
  now: Date
): TemplateCandidate[] => {
  const latestByTemplate = new Map<string, StoredActivity>();
  for (const activity of recentActivities) {
    const templateId = readTemplateId(activity);
    if (templateId && !latestByTemplate.has(templateId)) {
      latestByTemplate.set(templateId, activity);
    }
  }
  return candidates
    .filter((candidate) => {
      const latest = latestByTemplate.get(String(candidate._id));
      if (!latest) return true;
      if (latest.status === 'offered' || ACTIVE_STATUSES.includes(latest.status)) {
        return false;
      }
      const lastAt = latest.offeredAt ?? latest.createdAt;
      if (!lastAt) return false;
      const cooldownDays = candidate.cooldownDays ?? latest.cooldownDays ?? 14;
      return now.getTime() - new Date(lastAt).getTime() >= cooldownDays * DAY_MS;
    })
    .slice(0, count);
};

const createOffer = async (input: {
  pairId: Types.ObjectId;
  members: [Types.ObjectId, Types.ObjectId];
  candidate: TemplateCandidate;
  plan: PairActivitySuggestionPlan;
  source: OfferSource;
  recommendationContext: RecommendationSummaryContext;
  now: Date;
  createdBy?: PairActivityType['createdBy'];
  session: ClientSession;
}): Promise<StoredActivity> => {
  const binding = resolveActivityFactorBinding(input.candidate);
  const mode = input.candidate.mode ?? 'together';
  const sync = input.candidate.sync ?? 'sync';
  const assignedMemberIds =
    mode === 'together'
      ? input.members.map(String)
      : [String(input.members[mode === 'soloA' ? 0 : 1])];
  const templateId = String(input.candidate._id);
  const offerKey = [
    String(input.pairId),
    String(input.recommendationContext.snapshotId),
    templateId,
    input.candidate.actionDefinition.key,
  ].join(':');
  const document: PairActivityType = {
    pairId: input.pairId,
    members: input.members,
    intent: input.candidate.intent,
    archetype: input.candidate.archetype,
    actionDefinition: { ...input.candidate.actionDefinition },
    targetFactorKeys: [...input.candidate.targetFactorKeys],
    title: {
      ru: input.candidate.title.ru ?? input.candidate.title.en ?? '',
      en: input.candidate.title.en ?? input.candidate.title.ru ?? '',
    },
    description: {
      ru:
        input.candidate.description.ru ??
        input.candidate.description.en ??
        '',
      en:
        input.candidate.description.en ??
        input.candidate.description.ru ??
        '',
    },
    why: effectiveWhy(input.candidate, input.plan),
    mode,
    sync,
    difficulty: binding.action.difficulty,
    intensity: input.candidate.intensity,
    timeEstimateMin: binding.action.durationMinutes,
    costEstimate: input.candidate.costEstimate,
    location: input.candidate.location ?? 'any',
    materials: input.candidate.materials ?? [],
    offeredAt: input.now,
    dueAt: new Date(input.now.getTime() + 3 * DAY_MS),
    cooldownDays: binding.action.cooldownDays,
    requiresConsent: input.candidate.requiresConsent === true,
    visibility: input.candidate.visibility ?? 'both',
    status: 'offered',
    lifecycleVersion: 'activity-lifecycle-v3',
    feedbackSchemaVersion: binding.action.feedbackSchemaKey,
    stateMeta: {
      offerKey,
      templateId,
      source: input.plan.source,
      sourceMeta: input.plan.sourceMeta,
      primaryReason: input.plan.primaryReason,
      actionKey: binding.action.key,
      targetFactorKey: input.plan.targetFactorKey,
      registryVersion: input.candidate.actionDefinition.registryVersion,
      decisionVersion: 'activity-decision-v2',
      assignedMemberIds,
      apiSource: input.source,
      ...(buildStepsPreview(input.candidate)
        ? { stepsPreview: buildStepsPreview(input.candidate) }
        : {}),
    },
    checkIns: effectiveActivityCheckIns(
      input.candidate.checkIns,
      binding.action.feedbackSchemaKey
    ),
    createdBy: input.createdBy ?? 'system',
  };
  document.recommendationProvenance = buildRecommendationProvenance({
    context: input.recommendationContext,
    activity: document,
  });
  const activity = await PairActivity.findOneAndUpdate(
    { pairId: input.pairId, 'stateMeta.offerKey': offerKey },
    { $setOnInsert: document },
    { upsert: true, new: true, runValidators: true, session: input.session }
  );
  if (!activity) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Activity was not created',
    });
  }
  return activity.toObject() as StoredActivity;
};

type SuggestActivitiesInput = {
  pairId: string;
  currentUserId: string;
  dedupeAgainstLastOffered: boolean;
  count?: number;
  source: OfferSource;
  recommendationContext: RecommendationSummaryContext;
  auditRequest?: AuditRequestContext;
};

const smartSuggest = async (
  input: SuggestActivitiesInput,
  hooks: ActivityOfferReliabilityTestHooks = {}
): Promise<{
  result: PairActivitySuggestionResult;
  createdOffers: ActivityOfferDTO[];
}> => {
  await connectToDatabase();
  const pairData = await ensurePairMember(input.pairId, input.currentUserId);
  const pair = pairData.pair;
  const pairId = pair._id as Types.ObjectId;
  const now = new Date();
  const [current, offered, recent, safetyVeto, factorInputs] = await Promise.all([
    PairActivity.findOne({ pairId, status: { $in: ACTIVE_STATUSES } })
      .sort({ createdAt: -1 })
      .lean<StoredActivity | null>(),
    PairActivity.find({ pairId, status: 'offered' })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean<StoredActivity[]>(),
    PairActivity.find({ pairId, status: { $in: COOLDOWN_STATUSES } })
      .sort({ offeredAt: -1, createdAt: -1 })
      .limit(100)
      .lean<StoredActivity[]>(),
    isOwnerSafetyGateActive({
      pairId: String(pairId),
      ownerUserId: input.currentUserId,
    }),
    readActivityRecommendationInputs({ pairId: String(pairId) }),
  ]);

  const globallyEligibleOffered = offered.filter(
    (activity) =>
      recommendationProvenanceMatchesContext(
        activity.recommendationProvenance,
        input.recommendationContext
      ) &&
      activity.recommendationProvenance?.activityContentHash ===
        buildActivityContentHash(activity) &&
      hasEligibleActivityFactorBinding(activity)
  );
  const eligibleIds = new Set(
    globallyEligibleOffered.map((activity) => String(activity._id))
  );
  const invalidOfferedIds = offered
    .filter((activity) => !eligibleIds.has(String(activity._id)))
    .map((activity) => activity._id);
  if (invalidOfferedIds.length > 0) {
    await PairActivity.updateMany(
      { _id: { $in: invalidOfferedIds }, pairId, status: 'offered' },
      { $set: { status: 'cancelled' } }
    );
  }

  const blockedActionKeys = SYSTEM_ACTIVITY_TEMPLATES.map(
    (template) => template.actionDefinition.key
  ).filter((actionKey, index, all) => all.indexOf(actionKey) === index)
    .filter((actionKey) => actionBlockedByCooldown(actionKey, recent, now));
  const plan = applyRecentActivitySignals(
    buildPairActivitySuggestionPlan({
      pairId: String(pairId),
      pairStatus: pair.status,
      hasCurrentActivity: Boolean(current),
      factorSnapshots: factorInputs.pairSnapshots,
      pairEvaluations: factorInputs.pairEvaluations,
      blockedActionKeys,
      safetyVeto,
    }),
    recentActivitySignals(recent)
  );
  const eligibleOffered = globallyEligibleOffered.filter((activity) =>
    isOfferedActivityEligibleForRole({
      activity,
      role: pairData.by,
      safetyVeto,
    })
  );
  const visibleCurrent =
    current && isActivityAccessibleToRole(current, pairData.by) ? current : null;
  const offeredCount = await PairActivity.countDocuments({
    pairId,
    status: 'offered',
  });
  const availableSlots = Math.max(0, 3 - offeredCount);
  const requestedCount = input.count
    ? Math.min(3, Math.max(0, input.count))
    : 2;
  const targetCount =
    plan.status === 'ready' && !current && !safetyVeto
      ? Math.min(requestedCount, availableSlots)
      : 0;

  if (targetCount === 0) {
    const skippedReason = current
      ? 'current_activity'
      : pair.status !== 'active'
        ? `pair_${pair.status}`
        : offeredCount >= 3
          ? 'offered_limit'
          : 'insufficient_factor_data';
    await emitSuggestionsGenerated({
      pairId: String(pairId),
      currentUserId: input.currentUserId,
      count: 0,
      source: input.source,
      auditRequest: input.auditRequest,
    });
    return {
      result: {
        plan: toPlanDTO(plan),
        currentActivity: visibleCurrent
          ? toPairActivityDTO(visibleCurrent, { includeAnswers: false })
          : null,
        offers: eligibleOffered.map((activity) =>
          toPairActivityDTO(activity, { includeAnswers: false })
        ),
        createdCount: 0,
        skippedReason,
      },
      createdOffers: [],
    };
  }

  const candidates = await loadCandidates(plan, safetyVeto);
  const selected = selectCandidatesOutsideCooldown(
    candidates,
    recent,
    targetCount,
    now
  );
  if (selected.length === 0) {
    await emitSuggestionsGenerated({
      pairId: String(pairId),
      currentUserId: input.currentUserId,
      count: 0,
      source: input.source,
      auditRequest: input.auditRequest,
    });
    return {
      result: {
        plan: toPlanDTO(plan),
        currentActivity: null,
        offers: eligibleOffered.map((activity) =>
          toPairActivityDTO(activity, { includeAnswers: false })
        ),
        createdCount: 0,
        skippedReason: candidates.length
          ? 'all_templates_in_cooldown'
          : 'no_templates',
      },
      createdOffers: [],
    };
  }

  const members = await resolveMembers(pair.members as [string, string]);
  const created: StoredActivity[] = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      created.length = 0;
      await hooks.beforeTransactionalPairGuard?.();
      await assertActivePairForOffer({
        pairId,
        currentUserId: input.currentUserId,
        session,
      });
      const active = await PairActivity.exists({
        pairId,
        status: { $in: ACTIVE_STATUSES },
      }).session(session);
      if (active) return;
      const offeredInTransaction = await PairActivity.countDocuments({
        pairId,
        status: 'offered',
      }).session(session);
      for (const candidate of selected.slice(
        0,
        Math.max(0, 3 - offeredInTransaction)
      )) {
        created.push(
          await createOffer({
            pairId,
            members,
            candidate,
            plan,
            source: input.source,
            recommendationContext: input.recommendationContext,
            now,
            session,
          })
        );
      }
    });
  } finally {
    await session.endSession();
  }
  await emitSuggestionsGenerated({
    pairId: String(pairId),
    currentUserId: input.currentUserId,
    count: created.length,
    source: input.source,
    auditRequest: input.auditRequest,
  });
  const allOffers = [...created, ...eligibleOffered]
    .filter(
      (activity, index, all) =>
        all.findIndex((item) => String(item._id) === String(activity._id)) ===
        index
    )
    .slice(0, 3);
  return {
    result: {
      plan: toPlanDTO(plan),
      currentActivity: null,
      offers: allOffers.map((activity) =>
        toPairActivityDTO(activity, { includeAnswers: false })
      ),
      createdCount: created.length,
    },
    createdOffers: created.map(toActivityOfferDTO),
  };
};

export const activityOfferService = {
  async suggestPairActivities(
    input: Omit<
      SuggestActivitiesInput,
      'dedupeAgainstLastOffered' | 'source'
    > & { source?: 'pairs.suggest' }
  ): Promise<PairActivitySuggestionResult> {
    const { result } = await smartSuggest({
      ...input,
      source: 'pairs.suggest',
      dedupeAgainstLastOffered: true,
    });
    return result;
  },

  async suggestActivities(
    input: SuggestActivitiesInput,
    hooks: ActivityOfferReliabilityTestHooks = {}
  ): Promise<ActivityOfferDTO[]> {
    const { createdOffers } = await smartSuggest(input, hooks);
    return createdOffers;
  },

  async createNextActivity(input: {
    currentUserId: string;
    recommendationContext: RecommendationSummaryContext;
    auditRequest?: AuditRequestContext;
  }): Promise<{ activityId: string; offer?: ActivityOfferDTO }> {
    await connectToDatabase();
    const pair = await Pair.findOne({
      members: input.currentUserId,
      status: 'active',
    }).lean<{ _id: Types.ObjectId } | null>();
    if (!pair) {
      throw new DomainError({
        code: 'PAIR_NOT_FOUND',
        status: 404,
        message: 'No active pair',
      });
    }
    const { createdOffers } = await smartSuggest({
      pairId: String(pair._id),
      currentUserId: input.currentUserId,
      dedupeAgainstLastOffered: true,
      count: 1,
      source: 'activities.next',
      recommendationContext: input.recommendationContext,
      auditRequest: input.auditRequest,
    });
    const first = createdOffers[0];
    if (!first) unavailable();
    return { activityId: first.id, offer: first };
  },

  async createFromTemplate(input: {
    pairId: string;
    templateId: string;
    currentUserId: string;
    recommendationContext: RecommendationSummaryContext;
  }, hooks: ActivityOfferReliabilityTestHooks = {}): Promise<{
    id: string;
    offer?: ActivityOfferDTO;
  }> {
    await connectToDatabase();
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pair = pairData.pair;
    if (pair.status !== 'active') unavailable();
    if (!isSafetyFallbackTemplateId(input.templateId)) unavailable();
    const selectedCandidate = requireAvailable(
      SYSTEM_ACTIVITY_TEMPLATES.find(
        (item) => String(item._id) === input.templateId
      )
    );
    if (!hasEligibleActivityFactorBinding(selectedCandidate)) unavailable();
    const members = await resolveMembers(pair.members as [string, string]);
    const plan = applyRecentActivitySignals(
      buildPairActivitySuggestionPlan({
        pairId: String(pair._id),
        pairStatus: pair.status,
        hasCurrentActivity: false,
        factorSnapshots: [],
        pairEvaluations: [],
        blockedActionKeys: [],
        safetyVeto: false,
      }),
      {
        lowComfortRecently: false,
        wantsSimilarRecently: false,
      }
    );
    const outcome: { activity?: StoredActivity } = {};
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await hooks.beforeTransactionalPairGuard?.();
        await assertActivePairForOffer({
          pairId: pair._id as Types.ObjectId,
          currentUserId: input.currentUserId,
          session,
        });
        const active = await PairActivity.exists({
          pairId: pair._id,
          status: { $in: ACTIVE_STATUSES },
        }).session(session);
        const offeredCount = await PairActivity.countDocuments({
          pairId: pair._id,
          status: 'offered',
        }).session(session);
        if (active || offeredCount >= 3) unavailable();
        outcome.activity = await createOffer({
          pairId: pair._id as Types.ObjectId,
          members,
          candidate: selectedCandidate,
          plan,
          source: 'pairs.activities.suggest',
          recommendationContext: input.recommendationContext,
          now: new Date(),
          createdBy: 'user',
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    const createdActivity = requireAvailable(outcome.activity);
    return {
      id: String(createdActivity._id),
      offer: toActivityOfferDTO(createdActivity),
    };
  },
};
