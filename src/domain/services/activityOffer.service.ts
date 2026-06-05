import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import {
  ActivityTemplate,
  type ActivityTemplateType,
  type Axis,
} from '@/models/ActivityTemplate';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
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
import { buildPairWeeklyCheckInSummary } from '@/domain/services/weeklyCheckIn.service';
import {
  buildPairActivitySuggestionPlan,
  SYSTEM_ACTIVITY_TEMPLATES,
  type PairActivitySuggestionPlan,
  type SystemActivityTemplate,
} from '@/domain/services/pairActivityDecision.service';

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

type OfferSource = 'pairs.suggest' | 'pairs.activities.suggest' | 'activities.next';
type StoredActivity = PairActivityType & { _id: Types.ObjectId };
type TemplateCandidate = ActivityTemplateType & {
  why?: { ru?: string; en?: string };
  mode?: PairActivityType['mode'];
  sync?: PairActivityType['sync'];
  visibility?: PairActivityType['visibility'];
};

export type PairActivitySuggestionResult = {
  plan: PairActivitySuggestionPlan;
  currentActivity: PairActivityDTO | null;
  offers: PairActivityDTO[];
  createdCount: number;
  skippedReason?: string;
};

const ACTIVE_STATUSES: PairActivityType['status'][] = [
  'accepted',
  'in_progress',
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

const guardFailureToDomainError = async (response: Response): Promise<DomainError> => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null) as GuardErrorPayload | null;

  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensurePairMember = async (pairId: string, currentUserId: string) => {
  const pairGuard = await requirePairMember(pairId, currentUserId);
  if (!pairGuard.ok) {
    throw await guardFailureToDomainError(pairGuard.response);
  }
  return pairGuard.data;
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

const autoDeltas = (
  intent: 'improve' | 'celebrate',
  intensity: 1 | 2 | 3
): { fatigueDeltaOnComplete: number; readinessDeltaOnComplete: number } =>
  intent === 'celebrate'
    ? {
        fatigueDeltaOnComplete: -0.08 * intensity,
        readinessDeltaOnComplete: 0.1 * intensity,
      }
    : {
        fatigueDeltaOnComplete: 0.06 * intensity,
        readinessDeltaOnComplete: 0.04 * intensity,
      };

const buildStepsPreview = (
  activityTemplate: ActivityTemplateType
): { ru: string[]; en: string[] } | undefined => {
  const ru = activityTemplate.steps?.ru?.slice(0, 2) ?? [];
  const en = activityTemplate.steps?.en?.slice(0, 2) ?? [];
  return ru.length || en.length ? { ru, en } : undefined;
};

const sourceRoute = (source: OfferSource): string => {
  if (source === 'pairs.suggest') return '/api/pairs/[id]/suggest';
  if (source === 'pairs.activities.suggest') return '/api/pairs/[id]/activities/suggest';
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
    request: input.auditRequest ?? { route: sourceRoute(input.source), method: 'POST' },
    context: { pairId: input.pairId },
    target: { type: 'pair', id: input.pairId },
    metadata: {
      pairId: input.pairId,
      count: input.count,
      source: input.source,
    },
  });
};

const readTemplateId = (activity: Pick<PairActivityType, 'stateMeta'>): string | null => {
  const value = activity.stateMeta?.templateId;
  return typeof value === 'string' && value.trim() ? value : null;
};

const diagnosticsFromPair = (pair: {
  passport?: {
    riskZones?: { axis: string; severity: 1 | 2 | 3 }[];
    lastDiagnosticsAt?: Date;
    overall?: {
      confidence: number;
      status: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
    };
  };
}) => {
  const passport = pair.passport;
  if (!passport) return undefined;
  const riskZones = passport.riskZones ?? [];
  return {
    overall:
      passport.overall ??
      (passport.lastDiagnosticsAt
        ? {
            confidence: 0.55,
            status: riskZones.length ? ('risk' as const) : ('neutral' as const),
          }
        : undefined),
    riskZones,
    lastDiagnosticsAt: passport.lastDiagnosticsAt,
  };
};

const targetCountForPlan = (
  plan: PairActivitySuggestionPlan,
  offeredCount: number
): number => {
  const slots = Math.max(0, 3 - offeredCount);
  if (slots === 0) return 0;
  if (
    plan.status === 'blocked_by_current_activity' ||
    plan.status === 'blocked_by_pair_state'
  ) {
    return 0;
  }
  if (plan.status === 'needs_diagnostics' || plan.status === 'needs_weekly_checkin') {
    return Math.min(1, slots);
  }
  if (plan.primaryReason === 'maintenance') return Math.min(3, slots);
  return Math.min(2, slots);
};

const isSystemTemplate = (
  candidate: TemplateCandidate
): candidate is SystemActivityTemplate =>
  String(candidate._id).startsWith('system-');

const effectiveWhy = (
  candidate: TemplateCandidate,
  plan: PairActivitySuggestionPlan
): { ru: string; en: string } => ({
  ru: `${plan.explanation.ru} ${candidate.why?.ru ?? ''}`.trim(),
  en: candidate.why?.en ?? plan.explanation.en ?? plan.explanation.ru,
});

const templateAllowedForPlan = (
  candidate: TemplateCandidate,
  plan: PairActivitySuggestionPlan
): boolean => {
  const fatigue = plan.fatigue ?? 0;
  const maxFatigue = candidate.preconditions?.maxFatigue;
  if (typeof maxFatigue === 'number' && fatigue > maxFatigue) return false;
  if (candidate.intensity > plan.maxIntensity) return false;
  if (candidate.difficulty > plan.preferredDifficulty) return false;
  if (!plan.preferredArchetypes.includes(candidate.archetype)) return false;
  if (plan.axis && !candidate.axis.includes(plan.axis)) return false;
  if (plan.requiredMode && candidate.mode && candidate.mode !== plan.requiredMode) return false;
  if (plan.requiredSync && candidate.sync && candidate.sync !== plan.requiredSync) return false;

  if (
    plan.status === 'needs_diagnostics' ||
    plan.status === 'needs_weekly_checkin'
  ) {
    if (candidate.axis.some((axis) => axis === 'finance' || axis === 'sexuality')) {
      return false;
    }
  }
  if (candidate.axis.includes('sexuality') && !candidate.requiresConsent) return false;
  return true;
};

const candidateScore = (
  candidate: TemplateCandidate,
  plan: PairActivitySuggestionPlan
): number => {
  const archetypeIndex = plan.preferredArchetypes.indexOf(candidate.archetype);
  const axisScore = plan.axis && candidate.axis.includes(plan.axis) ? 100 : 0;
  const archetypeScore = archetypeIndex >= 0 ? 40 - archetypeIndex * 4 : 0;
  const difficultyScore = 10 - Math.abs(plan.preferredDifficulty - candidate.difficulty);
  const sensitiveDialogueScore =
    plan.axis === 'sexuality' && candidate.archetype === 'dialogue' ? 15 : 0;
  return axisScore + archetypeScore + difficultyScore + sensitiveDialogueScore;
};

const loadCandidates = async (
  plan: PairActivitySuggestionPlan
): Promise<TemplateCandidate[]> => {
  const query: {
    difficulty: { $lte: number };
    intensity: { $lte: number };
    axis?: Axis;
  } = {
    difficulty: { $lte: plan.preferredDifficulty },
    intensity: { $lte: plan.maxIntensity },
  };
  if (plan.axis) query.axis = plan.axis;

  const stored = await ActivityTemplate.find(query)
    .sort({ updatedAt: -1, _id: 1 })
    .limit(50)
    .lean<ActivityTemplateType[]>();
  const combined: TemplateCandidate[] = [...stored, ...SYSTEM_ACTIVITY_TEMPLATES];
  const unique = new Map<string, TemplateCandidate>();
  for (const candidate of combined) {
    const id = String(candidate._id);
    if (!unique.has(id) && templateAllowedForPlan(candidate, plan)) {
      unique.set(id, candidate);
    }
  }
  return Array.from(unique.values()).sort((left, right) => {
    const scoreDiff = candidateScore(right, plan) - candidateScore(left, plan);
    return scoreDiff || String(left._id).localeCompare(String(right._id));
  });
};

const selectCandidatesOutsideCooldown = (
  candidates: TemplateCandidate[],
  recentActivities: StoredActivity[],
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
  now: Date;
}): Promise<StoredActivity> => {
  const { candidate, plan } = input;
  const fallback = autoDeltas(candidate.intent, candidate.intensity);
  const stepsPreview = buildStepsPreview(candidate);
  const mode = candidate.mode ?? 'together';
  const sync = candidate.sync ?? (candidate.archetype === 'micro_habit' ? 'async' : 'sync');
  const requiresConsent =
    candidate.requiresConsent === true || candidate.axis.includes('sexuality');

  const created = await PairActivity.create({
    pairId: input.pairId,
    members: input.members,
    intent: candidate.intent,
    archetype: candidate.archetype,
    axis: candidate.axis,
    facetsTarget: candidate.facetsTarget ?? [],
    title: {
      ru: candidate.title.ru ?? candidate.title.en ?? '',
      en: candidate.title.en ?? candidate.title.ru ?? '',
    },
    description: {
      ru: candidate.description.ru ?? candidate.description.en ?? '',
      en: candidate.description.en ?? candidate.description.ru ?? '',
    },
    why: effectiveWhy(candidate, plan),
    mode,
    sync,
    difficulty: candidate.difficulty,
    intensity: candidate.intensity,
    timeEstimateMin: candidate.timeEstimateMin,
    costEstimate: candidate.costEstimate,
    location: candidate.location ?? 'any',
    materials: candidate.materials ?? [],
    offeredAt: input.now,
    dueAt: new Date(input.now.getTime() + 3 * DAY_MS),
    cooldownDays: candidate.cooldownDays ?? 14,
    requiresConsent,
    visibility: candidate.visibility ?? 'both',
    status: 'offered',
    stateMeta: {
      templateId: String(candidate._id),
      source: plan.source,
      sourceMeta: plan.sourceMeta,
      primaryReason: plan.primaryReason,
      axis: plan.axis,
      severity: plan.severity,
      weekKey: plan.sourceMeta.weekKey,
      decisionVersion: 'activity-decision-v1',
      apiSource: input.source,
      ...(stepsPreview ? { stepsPreview } : {}),
    },
    checkIns: candidate.checkIns,
    effect: candidate.effect,
    fatigueDeltaOnComplete: fallback.fatigueDeltaOnComplete,
    readinessDeltaOnComplete: fallback.readinessDeltaOnComplete,
    createdBy: 'system',
  });

  return created.toObject() as StoredActivity;
};

type SuggestActivitiesInput = {
  pairId: string;
  currentUserId: string;
  dedupeAgainstLastOffered: boolean;
  count?: number;
  source: OfferSource;
  auditRequest?: AuditRequestContext;
};

const smartSuggest = async (
  input: SuggestActivitiesInput
): Promise<{
  result: PairActivitySuggestionResult;
  createdOffers: ActivityOfferDTO[];
}> => {
  await connectToDatabase();
  const pairData = await ensurePairMember(input.pairId, input.currentUserId);
  const pair = pairData.pair;
  const pairId = pair._id as Types.ObjectId;
  const [weekly, current, offered, recent] = await Promise.all([
    buildPairWeeklyCheckInSummary({
      pair,
      currentUserId: input.currentUserId,
    }),
    PairActivity.findOne({ pairId, status: { $in: ACTIVE_STATUSES } })
      .sort({ createdAt: -1 })
      .lean<StoredActivity | null>(),
    PairActivity.find({ pairId, status: 'offered' })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean<StoredActivity[]>(),
    PairActivity.find({ pairId, status: { $in: COOLDOWN_STATUSES } })
      .sort({ offeredAt: -1, createdAt: -1 })
      .limit(100)
      .lean<StoredActivity[]>(),
  ]);

  const plan = buildPairActivitySuggestionPlan({
    pairId: String(pairId),
    pairStatus: pair.status,
    fatigue: pair.fatigue?.score,
    readiness: pair.readiness?.score,
    diagnostics: diagnosticsFromPair(pair),
    weekly,
    hasCurrentActivity: Boolean(current),
  });
  const requestedCount = input.count
    ? Math.min(3, Math.max(0, input.count))
    : targetCountForPlan(plan, offered.length);
  const targetCount = Math.min(
    requestedCount,
    targetCountForPlan(plan, offered.length)
  );

  if (targetCount === 0) {
    const skippedReason = current
      ? 'current_activity'
      : pair.status !== 'active'
        ? `pair_${pair.status}`
        : offered.length >= 3
          ? 'offered_limit'
          : 'plan_blocked';
    await emitSuggestionsGenerated({
      pairId: String(pairId),
      currentUserId: input.currentUserId,
      count: 0,
      source: input.source,
      auditRequest: input.auditRequest,
    });
    return {
      result: {
        plan,
        currentActivity: current
          ? toPairActivityDTO(current, { includeAnswers: false })
          : null,
        offers: offered.map((activity) =>
          toPairActivityDTO(activity, { includeAnswers: false })
        ),
        createdCount: 0,
        skippedReason,
      },
      createdOffers: [],
    };
  }

  const candidates = await loadCandidates(plan);
  const selected = selectCandidatesOutsideCooldown(
    candidates,
    recent,
    targetCount,
    new Date()
  );
  if (!selected.length) {
    await emitSuggestionsGenerated({
      pairId: String(pairId),
      currentUserId: input.currentUserId,
      count: 0,
      source: input.source,
      auditRequest: input.auditRequest,
    });
    return {
      result: {
        plan,
        currentActivity: null,
        offers: offered.map((activity) =>
          toPairActivityDTO(activity, { includeAnswers: false })
        ),
        createdCount: 0,
        skippedReason: candidates.length ? 'all_templates_in_cooldown' : 'no_templates',
      },
      createdOffers: [],
    };
  }

  const members = await resolveMembers(pair.members as [string, string]);
  const now = new Date();
  const created: StoredActivity[] = [];
  for (const candidate of selected) {
    created.push(
      await createOffer({
        pairId,
        members,
        candidate,
        plan,
        source: input.source,
        now,
      })
    );
  }
  await emitSuggestionsGenerated({
    pairId: String(pairId),
    currentUserId: input.currentUserId,
    count: created.length,
    source: input.source,
    auditRequest: input.auditRequest,
  });

  const allOffers = [...created, ...offered].slice(0, 3);
  return {
    result: {
      plan,
      currentActivity: null,
      offers: allOffers.map((activity) =>
        toPairActivityDTO(activity, { includeAnswers: false })
      ),
      createdCount: created.length,
    },
    createdOffers: created.map((activity) => toActivityOfferDTO(activity)),
  };
};

export const activityOfferService = {
  async suggestPairActivities(
    input: Omit<SuggestActivitiesInput, 'dedupeAgainstLastOffered' | 'source'> & {
      source?: 'pairs.suggest';
    }
  ): Promise<PairActivitySuggestionResult> {
    const { result } = await smartSuggest({
      ...input,
      source: 'pairs.suggest',
      dedupeAgainstLastOffered: true,
    });
    return result;
  },

  async suggestActivities(input: SuggestActivitiesInput): Promise<ActivityOfferDTO[]> {
    const { createdOffers } = await smartSuggest(input);
    return createdOffers;
  },

  async createNextActivity(input: {
    currentUserId: string;
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
      auditRequest: input.auditRequest,
    });
    const first = createdOffers[0];
    if (!first) {
      throw new DomainError({
        code: 'ACTIVITY_SUGGESTION_UNAVAILABLE',
        status: 409,
        message: 'No new activity can be suggested right now',
      });
    }
    return { activityId: first.id, offer: first };
  },

  async createFromTemplate(input: {
    pairId: string;
    templateId: string;
    currentUserId: string;
  }): Promise<{ id: string; offer?: ActivityOfferDTO }> {
    await connectToDatabase();
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pair = pairData.pair;
    if (pair.status !== 'active') {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Activities are unavailable while the pair is not active',
      });
    }

    const stored = await ActivityTemplate.findById(input.templateId)
      .lean<ActivityTemplateType | null>();
    const candidate =
      stored ??
      SYSTEM_ACTIVITY_TEMPLATES.find((item) => item._id === input.templateId);
    if (!candidate) {
      throw new DomainError({
        code: 'ACTIVITY_TEMPLATE_NOT_FOUND',
        status: 404,
        message: 'Template not found',
      });
    }

    const activeCount = await PairActivity.countDocuments({
      pairId: pair._id,
      status: { $in: [...ACTIVE_STATUSES, 'offered'] },
    });
    if (activeCount >= 3) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Too many active or offered activities',
      });
    }

    const members = await resolveMembers(pair.members as [string, string]);
    const now = new Date();
    const fallback = autoDeltas(candidate.intent, candidate.intensity);
    const activity = await PairActivity.create({
      pairId: pair._id,
      members,
      intent: candidate.intent,
      archetype: candidate.archetype,
      axis: candidate.axis,
      facetsTarget: candidate.facetsTarget ?? [],
      title: candidate.title,
      description: candidate.description,
      why: isSystemTemplate(candidate)
        ? candidate.why
        : { ru: 'Выбрано вручную из каталога активностей.', en: 'Selected manually.' },
      mode: isSystemTemplate(candidate) ? candidate.mode : 'together',
      sync: isSystemTemplate(candidate) ? candidate.sync : 'sync',
      difficulty: candidate.difficulty,
      intensity: candidate.intensity,
      timeEstimateMin: candidate.timeEstimateMin,
      costEstimate: candidate.costEstimate,
      location: candidate.location ?? 'any',
      materials: candidate.materials ?? [],
      offeredAt: now,
      dueAt: new Date(now.getTime() + 3 * DAY_MS),
      cooldownDays: candidate.cooldownDays ?? 14,
      requiresConsent:
        candidate.requiresConsent === true || candidate.axis.includes('sexuality'),
      status: 'offered',
      stateMeta: {
        templateId: String(candidate._id),
        source: 'manual',
        sourceMeta: {
          trigger: 'manual_template',
          decisionVersion: 'activity-decision-v1',
        },
        decisionVersion: 'activity-decision-v1',
        ...(buildStepsPreview(candidate)
          ? { stepsPreview: buildStepsPreview(candidate) }
          : {}),
      },
      checkIns: candidate.checkIns,
      effect: candidate.effect,
      fatigueDeltaOnComplete: fallback.fatigueDeltaOnComplete,
      readinessDeltaOnComplete: fallback.readinessDeltaOnComplete,
      createdBy: 'user',
    });
    return { id: String(activity._id), offer: toActivityOfferDTO(activity.toObject()) };
  },
};
