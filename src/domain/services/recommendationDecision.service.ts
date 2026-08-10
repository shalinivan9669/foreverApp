import { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import {
  RecommendationDecision,
  type RecommendationDecisionStatus,
  type RecommendationDecisionType,
  type RecommendationReasonCode,
} from '@/models/RecommendationDecision';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import {
  PairStateSnapshot,
  type PairStateSnapshotType,
} from '@/models/PairStateSnapshot';
import { WeeklyCycle, type WeeklyCycleType } from '@/models/WeeklyCycle';
import type { RecommendationSummaryContext } from '@/models/RecommendationProvenance';
import {
  recommendationDecisionTransition,
  type RecommendationDecisionAction,
} from '@/domain/state/recommendationDecisionMachine';
import {
  isPairSafetyVetoActive,
} from '@/domain/services/safetyGate.service';
import {
  hasP0SensitiveActivityAxis,
  isActivityAccessibleToRole,
  isActivityEligibleForSafetyState,
  isOfferedActivityEligibleForRole,
} from '@/domain/services/activityEligibility.service';
import {
  weeklyCycleKeyForDate,
  weeklyCycleService,
} from '@/domain/services/weeklyCycle.service';
import {
  buildActivityContentHash,
  recommendationProvenanceMatchesContext,
} from '@/domain/services/recommendationProvenance.service';
import { notificationService } from '@/domain/services/notification.service';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';

type StoredDecision = RecommendationDecisionType & { _id: Types.ObjectId };
type StoredActivity = PairActivityType & { _id: Types.ObjectId };
type StoredWeeklyCycle = WeeklyCycleType & { _id: Types.ObjectId };
type StoredPairStateSnapshot = PairStateSnapshotType & { _id: Types.ObjectId };

const ACTIVE_ACTIVITY_STATUSES: PairActivityType['status'][] = [
  'accepted',
  'in_progress',
  'awaiting_feedback',
  'awaiting_checkin',
];

export type RecommendationSummaryReadiness = Pick<
  StoredPairStateSnapshot,
  'dataStatus' | 'memberCompletion'
>;

export const isRecommendationSummaryPublishable = (
  summary: RecommendationSummaryReadiness
): boolean => {
  if (summary.dataStatus === 'ENOUGH') {
    return summary.memberCompletion.every(
      (member) => member.status === 'SUBMITTED'
    );
  }
  if (summary.dataStatus !== 'INSUFFICIENT') return false;
  return summary.memberCompletion.every((member) => member.status !== 'PENDING');
};

export type RecommendationDecisionDTO = {
  id: string;
  cycleKey: string;
  activity: {
    id: string;
    title: { ru: string; en: string };
    axis: PairActivityType['axis'];
    difficulty: PairActivityType['difficulty'];
    expiresAt?: string;
  };
  status: RecommendationDecisionStatus;
  reasonCode: RecommendationReasonCode;
  explanation: { ru: string; en: string };
  decisionVersion: 'recommendation-decision-v1';
  previousDecisionId?: string;
  canAccept: boolean;
  canSkip: boolean;
  canReplace: boolean;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RecommendationOverviewDTO = {
  current: RecommendationDecisionDTO | null;
  history: RecommendationDecisionDTO[];
};

type PreparedReplacement = {
  kind: 'prepared';
  decisionId: string;
  successorDecisionId: string;
  pairId: string;
  activityId: string;
  templateId?: string;
};

type ExistingReplacement = {
  kind: 'existing';
  decision: RecommendationDecisionDTO;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_KEY_PATTERN = /^\d{4}-(?:W\d{2}|\d{2}-\d{2})$/;

const REASON_EXPLANATIONS: Record<
  RecommendationReasonCode,
  { ru: string; en: string }
> = {
  CURRENT_CYCLE_SUPPORT: {
    ru: 'Формат выбран из доступных вариантов с учётом текущего цикла, истории и паузы между повторами.',
    en: 'Selected from eligible options using the current cycle, recent history, and repetition cooldown.',
  },
  ALTERNATIVE_REQUESTED: {
    ru: 'Это нейтральная альтернатива; предыдущий формат не повторяется сразу.',
    en: 'This is a neutral alternative; the previous format is not repeated immediately.',
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toIso = (value?: Date): string | undefined => value?.toISOString();

const utcWeekKey = (now: Date): string => {
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const weekYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
};

export const recommendationCycleKey = (
  stateMeta: PairActivityType['stateMeta'],
  now: Date
): string => {
  if (isRecord(stateMeta)) {
    const direct = stateMeta.weekKey;
    if (typeof direct === 'string' && CYCLE_KEY_PATTERN.test(direct)) return direct;
    const sourceMeta = stateMeta.sourceMeta;
    if (isRecord(sourceMeta)) {
      const nested = sourceMeta.weekKey;
      if (typeof nested === 'string' && CYCLE_KEY_PATTERN.test(nested)) return nested;
    }
  }
  return utcWeekKey(now);
};

const templateIdFromActivity = (activity: Pick<PairActivityType, 'stateMeta'>) => {
  const value = activity.stateMeta?.templateId;
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const unavailable = (): never => {
  throw new DomainError({
    code: 'RECOMMENDATION_UNAVAILABLE',
    status: 409,
    message: 'Recommendation is unavailable',
  });
};

const summaryNotReady = (): never => {
  throw new DomainError({
    code: 'RECOMMENDATION_SUMMARY_NOT_READY',
    status: 409,
    message: 'A publishable Pair Summary is required before recommendation',
  });
};

const ensurePairMember = async (pairId: string, currentUserId: string) => {
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) {
    throw new DomainError({
      code: 'RECOMMENDATION_UNAVAILABLE',
      status: guard.response.status === 401 ? 401 : 404,
      message: 'Recommendation is unavailable',
    });
  }
  return guard.data.pair;
};

type GuardedPair = Awaited<ReturnType<typeof ensurePairMember>>;

const ensureActionNotification = async (
  pair: GuardedPair,
  decision: StoredDecision
): Promise<void> => {
  try {
    await notificationService.create({
      userIds: [...pair.members],
      pairId: String(pair._id),
      type: 'ACTION_AVAILABLE',
      sourceKey: `decision:${String(decision._id)}`,
    });
  } catch {
    recordOperationalEvent({
      name: 'request_completed',
      routeGroup: 'notification',
      outcome: 'error',
      code: 'WRITE_FAILED',
    });
  }
};

const loadCurrentRecommendationContext = async (input: {
  pair: GuardedPair;
  currentUserId: string;
  now?: Date;
}): Promise<RecommendationSummaryContext> => {
  const now = input.now ?? new Date();
  const current = await weeklyCycleService.current({
    pair: input.pair,
    currentUserId: input.currentUserId,
    now,
  });
  const cycle = await WeeklyCycle.findOne({
    _id: current.cycleId,
    pairId: input.pair._id,
    cycleKey: weeklyCycleKeyForDate(now),
    latestSnapshotId: { $exists: true },
  }).lean<StoredWeeklyCycle | null>();
  if (!cycle?.latestSnapshotId) return summaryNotReady();

  const snapshot = await PairStateSnapshot.findOne({
    _id: cycle.latestSnapshotId,
    cycleId: cycle._id,
    pairId: input.pair._id,
    cycleKey: cycle.cycleKey,
  }).lean<StoredPairStateSnapshot | null>();
  if (
    !snapshot ||
    cycle.latestSnapshotRevision !== snapshot.revision ||
    !isRecommendationSummaryPublishable(snapshot)
  ) {
    return summaryNotReady();
  }

  return {
    cycleId: cycle._id,
    cycleKey: cycle.cycleKey,
    snapshotId: snapshot._id,
    snapshotRevision: snapshot.revision,
    inputHash: snapshot.input.hash,
    inputDefinitionVersion: snapshot.input.definitionVersion,
    pairStateAlgorithmVersion: snapshot.algorithm.version,
  };
};

const isDuplicateKey = (error: object): boolean =>
  'code' in error && error.code === 11000;

const transitionSet = (
  action: RecommendationDecisionAction,
  status: RecommendationDecisionStatus
): Record<string, Date | RecommendationDecisionStatus> => {
  if (action.type === 'ACCEPT') return { status, acceptedAt: action.at };
  if (action.type === 'SKIP') return { status, skippedAt: action.at };
  if (action.type === 'REPLACE') return { status, replacedAt: action.at };
  return { status, expiredAt: action.at };
};

const transitionStored = async (
  decision: StoredDecision,
  action: RecommendationDecisionAction,
  session?: ClientSession,
  onCommittedTransition?: () => void
): Promise<StoredDecision> => {
  const transition = recommendationDecisionTransition(
    {
      status: decision.status,
      replacementDepth: decision.replacementDepth,
    },
    action
  );
  if (!transition.changed) return decision;

  const updated = await RecommendationDecision.findOneAndUpdate(
    { _id: decision._id, status: decision.status },
    { $set: transitionSet(action, transition.next.status) },
    { new: true, ...(session ? { session } : {}) }
  ).lean<StoredDecision | null>();
  if (updated) {
    onCommittedTransition?.();
    return updated;
  }

  const concurrent = await RecommendationDecision.findById(decision._id)
    .session(session ?? null)
    .lean<StoredDecision | null>();
  if (concurrent?.status === transition.next.status) return concurrent;
  return unavailable();
};

const reserveReplacementSuccessor = async (
  decision: StoredDecision
): Promise<StoredDecision> => {
  if (decision.successorDecisionId) return decision;

  const successorDecisionId = new Types.ObjectId();
  const reserved = await RecommendationDecision.findOneAndUpdate(
    {
      _id: decision._id,
      status: 'REPLACED',
      replacementDepth: 0,
      successorDecisionId: { $exists: false },
    },
    { $set: { successorDecisionId } },
    { new: true }
  ).lean<StoredDecision | null>();
  if (reserved) return reserved;

  const concurrent = await RecommendationDecision.findById(decision._id)
    .lean<StoredDecision | null>();
  if (
    concurrent?.status === 'REPLACED' &&
    concurrent.replacementDepth === 0 &&
    concurrent.successorDecisionId
  ) {
    return concurrent;
  }
  return unavailable();
};

const toPreparedReplacement = (decision: StoredDecision): PreparedReplacement => {
  if (!decision.successorDecisionId) return unavailable();
  return {
    kind: 'prepared',
    decisionId: String(decision._id),
    successorDecisionId: String(decision.successorDecisionId),
    pairId: String(decision.pairId),
    activityId: String(decision.activityId),
    ...(decision.templateId ? { templateId: decision.templateId } : {}),
  };
};

const recommendationDocumentsMatchContext = (input: {
  decision: StoredDecision;
  activity: StoredActivity;
  context: RecommendationSummaryContext;
}): boolean => {
  const decisionProvenance = input.decision.provenance;
  const activityProvenance = input.activity.recommendationProvenance;
  if (
    !recommendationProvenanceMatchesContext(
      decisionProvenance,
      input.context
    ) ||
    !recommendationProvenanceMatchesContext(
      activityProvenance,
      input.context
    )
  ) {
    return false;
  }
  const currentContentHash = buildActivityContentHash(input.activity);
  return (
    decisionProvenance?.activityContentHash === currentContentHash &&
    activityProvenance?.activityContentHash === currentContentHash
  );
};

const recommendationContextIsStillCanonical = async (input: {
  pairId: Types.ObjectId;
  context: RecommendationSummaryContext;
  now: Date;
  session?: ClientSession;
}): Promise<boolean> => {
  if (input.context.cycleKey !== weeklyCycleKeyForDate(input.now)) return false;
  const cycle = await WeeklyCycle.findOne({
    _id: input.context.cycleId,
    pairId: input.pairId,
    cycleKey: input.context.cycleKey,
    latestSnapshotId: input.context.snapshotId,
    latestSnapshotRevision: input.context.snapshotRevision,
  })
    .session(input.session ?? null)
    .lean<StoredWeeklyCycle | null>();
  if (!cycle) return false;
  const snapshot = await PairStateSnapshot.findOne({
    _id: input.context.snapshotId,
    pairId: input.pairId,
    cycleId: input.context.cycleId,
    cycleKey: input.context.cycleKey,
    revision: input.context.snapshotRevision,
    'input.hash': input.context.inputHash,
    'input.definitionVersion': input.context.inputDefinitionVersion,
    'algorithm.version': input.context.pairStateAlgorithmVersion,
  })
    .session(input.session ?? null)
    .lean<StoredPairStateSnapshot | null>();
  return Boolean(snapshot && isRecommendationSummaryPublishable(snapshot));
};

const expireInvalidOfferedDecision = async (
  decision: StoredDecision,
  now: Date,
  session?: ClientSession
): Promise<void> => {
  await transitionStored(decision, { type: 'EXPIRE', at: now }, session);
  await PairActivity.updateOne(
    { _id: decision.activityId, pairId: decision.pairId, status: 'offered' },
    { $set: { status: 'expired' } }
  ).session(session ?? null);
};

const activityPreview = (activity: StoredActivity) => ({
  id: String(activity._id),
  title: activity.title,
  axis: activity.axis,
  difficulty: activity.difficulty,
  ...(activity.dueAt ? { expiresAt: activity.dueAt.toISOString() } : {}),
});

const toDTO = (
  decision: StoredDecision,
  activity: StoredActivity
): RecommendationDecisionDTO => ({
  id: String(decision._id),
  cycleKey: decision.cycleKey,
  activity: activityPreview(activity),
  status: decision.status,
  reasonCode: decision.reasonCode,
  explanation: REASON_EXPLANATIONS[decision.reasonCode],
  decisionVersion: decision.decisionVersion,
  ...(decision.previousDecisionId
    ? { previousDecisionId: String(decision.previousDecisionId) }
    : {}),
  canAccept: decision.status === 'OFFERED',
  canSkip: decision.status === 'OFFERED',
  canReplace: decision.status === 'OFFERED' && decision.replacementDepth === 0,
  ...(decision.expiresAt ? { expiresAt: toIso(decision.expiresAt) } : {}),
  ...(decision.createdAt ? { createdAt: toIso(decision.createdAt) } : {}),
  ...(decision.updatedAt ? { updatedAt: toIso(decision.updatedAt) } : {}),
});

const hydrateDecision = async (
  decision: StoredDecision
): Promise<RecommendationDecisionDTO> => {
  let activity = await PairActivity.findById(decision.activityId)
    .lean<StoredActivity | null>();
  if (!activity) return unavailable();
  if (activity.status === 'offered' && decision.status !== 'OFFERED') {
    const activityStatus =
      decision.status === 'ACCEPTED'
        ? 'accepted'
        : decision.status === 'EXPIRED'
          ? 'expired'
          : 'cancelled';
    const reconciled = await PairActivity.findOneAndUpdate(
      { _id: activity._id, status: 'offered' },
      {
        $set: {
          status: activityStatus,
          ...(decision.status === 'ACCEPTED'
            ? { acceptedAt: decision.acceptedAt ?? new Date() }
            : {}),
        },
      },
      { new: true }
    ).lean<StoredActivity | null>();
    if (reconciled) activity = reconciled;
  }
  return toDTO(decision, activity);
};

const roleForPairMember = (
  members: [string, string],
  currentUserId: string
): 'A' | 'B' => (members[0] === currentUserId ? 'A' : 'B');

const decisionCanBeProjected = (input: {
  decision: StoredDecision;
  activity: StoredActivity;
  role: 'A' | 'B';
  safetyVeto: boolean;
}): boolean =>
  isActivityAccessibleToRole(input.activity, input.role) &&
  (input.decision.status === 'ACCEPTED' ||
    (!hasP0SensitiveActivityAxis(input.activity.axis) &&
      isActivityEligibleForSafetyState(input.activity, input.safetyVeto)));

const hydrateDecisionIfVisible = async (input: {
  decision: StoredDecision;
  role: 'A' | 'B';
  safetyVeto: boolean;
}): Promise<RecommendationDecisionDTO | null> => {
  const activity = await PairActivity.findById(input.decision.activityId)
    .lean<StoredActivity | null>();
  if (
    !activity ||
    !decisionCanBeProjected({ ...input, activity })
  ) {
    return null;
  }
  return hydrateDecision(input.decision);
};

const expireDue = async (pairId: Types.ObjectId, now: Date): Promise<void> => {
  const due = await RecommendationDecision.find(
    { pairId, status: 'OFFERED', expiresAt: { $lte: now } },
  ).lean<StoredDecision[]>();
  for (const decision of due) {
    await transitionStored(decision, { type: 'EXPIRE', at: now });
    await PairActivity.updateOne(
      { _id: decision.activityId, status: 'offered' },
      { $set: { status: 'expired' } }
    );
  }
};

const expireAllOffered = async (
  pairId: Types.ObjectId,
  now: Date,
  preservedDecisionId?: Types.ObjectId,
  preservedCycleKey?: string
): Promise<void> => {
  const offered = await RecommendationDecision.find({
    pairId,
    status: 'OFFERED',
    ...(preservedDecisionId ? { _id: { $ne: preservedDecisionId } } : {}),
    ...(preservedCycleKey ? { cycleKey: { $ne: preservedCycleKey } } : {}),
  })
    .lean<StoredDecision[]>();
  for (const decision of offered) {
    await transitionStored(decision, { type: 'EXPIRE', at: now });
    await PairActivity.updateOne(
      { _id: decision.activityId, status: 'offered' },
      { $set: { status: 'expired' } }
    );
  }
};

const reconcileOffered = async (
  pairId: Types.ObjectId,
  now: Date
): Promise<void> => {
  await expireDue(pairId, now);
  const offered = await RecommendationDecision.find({ pairId, status: 'OFFERED' })
    .sort({ createdAt: -1, _id: 1 })
    .lean<StoredDecision[]>();
  if (!offered.length) return;

  const activities = await PairActivity.find({
    _id: { $in: offered.map((decision) => decision.activityId) },
  }).lean<StoredActivity[]>();
  const byId = new Map(activities.map((activity) => [String(activity._id), activity]));
  const safetyVeto = await isPairSafetyVetoActive(String(pairId));
  const stillOffered: StoredDecision[] = [];

  for (const decision of offered) {
    const activity = byId.get(String(decision.activityId));
    if (!activity) {
      await transitionStored(decision, { type: 'EXPIRE', at: now });
      continue;
    }
    if (
      hasP0SensitiveActivityAxis(activity.axis) ||
      !isActivityEligibleForSafetyState(activity, safetyVeto)
    ) {
      await transitionStored(decision, { type: 'EXPIRE', at: now });
      await PairActivity.updateOne(
        { _id: activity._id, status: 'offered' },
        { $set: { status: 'cancelled' } }
      );
      continue;
    }
    if (
      activity.status === 'accepted' ||
      activity.status === 'in_progress' ||
      activity.status === 'awaiting_feedback' ||
      activity.status === 'awaiting_checkin' ||
      activity.status === 'completed_partial' ||
      activity.status === 'completed_success' ||
      activity.status === 'failed'
    ) {
      await transitionStored(decision, {
        type: 'ACCEPT',
        at: activity.acceptedAt ?? now,
      });
      continue;
    }
    if (activity.status === 'cancelled' || activity.status === 'expired') {
      await transitionStored(decision, { type: 'EXPIRE', at: now });
      continue;
    }
    stillOffered.push(decision);
  }

  for (const stale of stillOffered.slice(1)) {
    await transitionStored(stale, { type: 'EXPIRE', at: now });
    await PairActivity.updateOne(
      { _id: stale.activityId, status: 'offered' },
      { $set: { status: 'expired' } }
    );
  }
};

const loadCurrent = async (
  pairId: Types.ObjectId,
  now: Date
): Promise<StoredDecision | null> => {
  await reconcileOffered(pairId, now);
  return RecommendationDecision.findOne({ pairId, status: 'OFFERED' })
    .sort({ createdAt: -1, _id: 1 })
    .lean<StoredDecision | null>();
};

const loadValidatedCurrentDecision = async (input: {
  pair: GuardedPair;
  currentUserId: string;
  now: Date;
}): Promise<StoredDecision | null> => {
  const decision = await loadCurrent(
    input.pair._id as Types.ObjectId,
    input.now
  );
  if (!decision) return null;

  let context: RecommendationSummaryContext;
  try {
    context = await loadCurrentRecommendationContext(input);
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === 'RECOMMENDATION_SUMMARY_NOT_READY'
    ) {
      await expireInvalidOfferedDecision(decision, input.now);
      return null;
    }
    throw error;
  }

  const activity = await PairActivity.findById(decision.activityId)
    .lean<StoredActivity | null>();
  if (
    !activity ||
    !recommendationDocumentsMatchContext({ decision, activity, context }) ||
    !(await recommendationContextIsStillCanonical({
      pairId: input.pair._id as Types.ObjectId,
      context,
      now: input.now,
    }))
  ) {
    await expireInvalidOfferedDecision(decision, input.now);
    return null;
  }
  return decision;
};

const loadDecisionForMember = async (input: {
  pairId: string;
  decisionId: string;
  currentUserId: string;
  requireActive?: boolean;
}): Promise<StoredDecision> => {
  const pair = await ensurePairMember(input.pairId, input.currentUserId);
  if (input.requireActive && pair.status !== 'active') return unavailable();
  if (!Types.ObjectId.isValid(input.decisionId)) return unavailable();
  const decision = await RecommendationDecision.findOne({
    _id: input.decisionId,
    pairId: input.pairId,
  }).lean<StoredDecision | null>();
  if (!decision) return unavailable();
  const activity = await PairActivity.findById(decision.activityId)
    .lean<StoredActivity | null>();
  const safetyVeto = await isPairSafetyVetoActive(String(pair._id));
  if (
    !activity ||
    !decisionCanBeProjected({
      decision,
      activity,
      role: roleForPairMember(pair.members as [string, string], input.currentUserId),
      safetyVeto,
    })
  ) {
    return unavailable();
  }
  if (
    decision.status === 'OFFERED' &&
    decision.expiresAt &&
    decision.expiresAt.getTime() <= Date.now()
  ) {
    const expired = await transitionStored(decision, {
      type: 'EXPIRE',
      at: new Date(),
    });
    await PairActivity.updateOne(
      { _id: expired.activityId, status: 'offered' },
      { $set: { status: 'expired' } }
    );
    return expired;
  }
  if (decision.status === 'OFFERED') {
    let context: RecommendationSummaryContext;
    try {
      context = await loadCurrentRecommendationContext({
        pair,
        currentUserId: input.currentUserId,
      });
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === 'RECOMMENDATION_SUMMARY_NOT_READY'
      ) {
        await expireInvalidOfferedDecision(decision, new Date());
        return unavailable();
      }
      throw error;
    }
    if (
      !recommendationDocumentsMatchContext({ decision, activity, context }) ||
      !(await recommendationContextIsStillCanonical({
        pairId: pair._id as Types.ObjectId,
        context,
        now: new Date(),
      }))
    ) {
      await expireInvalidOfferedDecision(decision, new Date());
      return unavailable();
    }
  }
  return decision;
};

export const recommendationDecisionService = {
  async getOverview(input: {
    pairId: string;
    currentUserId: string;
  }): Promise<RecommendationOverviewDTO> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const role = roleForPairMember(
      pair.members as [string, string],
      input.currentUserId
    );
    const safetyVeto = await isPairSafetyVetoActive(String(pairId));
    if (pair.status !== 'active') await expireAllOffered(pairId, new Date());
    const now = new Date();
    const current = pair.status === 'active'
      ? await loadValidatedCurrentDecision({
          pair,
          currentUserId: input.currentUserId,
          now,
        })
      : null;
    const history = await RecommendationDecision.find({
      pairId,
      status: { $ne: 'OFFERED' },
    })
      .sort({ updatedAt: -1, _id: 1 })
      .limit(20)
      .lean<StoredDecision[]>();

    const currentDto = current
      ? await hydrateDecisionIfVisible({ decision: current, role, safetyVeto })
      : null;
    if (current && currentDto) {
      await ensureActionNotification(pair, current);
    }
    const historyDtos = await Promise.all(
      history.map((decision) =>
        hydrateDecisionIfVisible({ decision, role, safetyVeto })
      )
    );
    return {
      current: currentDto,
      history: historyDtos.filter(
        (decision): decision is RecommendationDecisionDTO => Boolean(decision)
      ),
    };
  },

  async getCurrent(input: {
    pairId: string;
    currentUserId: string;
  }): Promise<RecommendationDecisionDTO | null> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') {
      await expireAllOffered(pair._id as Types.ObjectId, new Date());
      return null;
    }
    const current = await loadValidatedCurrentDecision({
      pair,
      currentUserId: input.currentUserId,
      now: new Date(),
    });
    if (!current) return null;
    const visible = await hydrateDecisionIfVisible({
      decision: current,
      role: roleForPairMember(
        pair.members as [string, string],
        input.currentUserId
      ),
      safetyVeto: await isPairSafetyVetoActive(String(pair._id)),
    });
    if (visible) {
      await ensureActionNotification(pair, current);
    }
    return visible;
  },

  async requireCurrentPublishableSummary(input: {
    pairId: string;
    currentUserId: string;
  }): Promise<RecommendationSummaryContext> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') return summaryNotReady();
    return loadCurrentRecommendationContext({
      pair,
      currentUserId: input.currentUserId,
    });
  },

  async findEligibleOfferedActivity(input: {
    pairId: string;
    currentUserId: string;
    snapshotId: string;
    excludeActivityId?: string;
    excludeTemplateId?: string;
    includeTemplateId?: string;
  }): Promise<string | null> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') return null;
    const candidates = await PairActivity.find({
      pairId: pair._id,
      status: 'offered',
      'recommendationProvenance.snapshotId': input.snapshotId,
      ...(input.excludeActivityId ? { _id: { $ne: input.excludeActivityId } } : {}),
    })
      .sort({ offeredAt: -1, _id: 1 })
      .limit(20)
      .lean<StoredActivity[]>();
    const safetyVeto = await isPairSafetyVetoActive(String(pair._id));
    const unsafeIds: Types.ObjectId[] = [];
    const role: 'A' | 'B' =
      pair.members[0] === input.currentUserId ? 'A' : 'B';

    const selected = candidates.find((candidate) => {
      const templateId = templateIdFromActivity(candidate);
      if (input.excludeTemplateId && templateId === input.excludeTemplateId) return false;
      if (input.includeTemplateId && templateId !== input.includeTemplateId) return false;
      if (
        hasP0SensitiveActivityAxis(candidate.axis) ||
        !isActivityEligibleForSafetyState(candidate, safetyVeto)
      ) {
        unsafeIds.push(candidate._id);
        return false;
      }
      return isOfferedActivityEligibleForRole({
        activity: candidate,
        role,
        safetyVeto,
      });
    });

    if (safetyVeto || unsafeIds.length > 0) {
      const unsafeIdSet = new Set(unsafeIds.map(String));
      for (const candidate of candidates) {
        if (
          (hasP0SensitiveActivityAxis(candidate.axis) ||
            !isActivityEligibleForSafetyState(candidate, safetyVeto)) &&
          !unsafeIdSet.has(String(candidate._id))
        ) {
          unsafeIds.push(candidate._id);
          unsafeIdSet.add(String(candidate._id));
        }
      }
      if (unsafeIds.length) {
        await PairActivity.updateMany(
          { _id: { $in: unsafeIds }, status: 'offered' },
          { $set: { status: 'cancelled' } }
        );
      }
    }
    return selected ? String(selected._id) : null;
  },

  async openForActivity(input: {
    pairId: string;
    activityId: string;
    currentUserId: string;
    previousDecisionId?: string;
    successorDecisionId?: string;
    recommendationContext?: RecommendationSummaryContext;
  }): Promise<RecommendationDecisionDTO> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') return unavailable();
    const pairId = pair._id as Types.ObjectId;
    const recommendationContext =
      input.recommendationContext ??
      (await loadCurrentRecommendationContext({
        pair,
        currentUserId: input.currentUserId,
      }));
    if (
      !(await recommendationContextIsStillCanonical({
        pairId,
        context: recommendationContext,
        now: new Date(),
      }))
    ) {
      return summaryNotReady();
    }

    const reservedSuccessorId = input.successorDecisionId
      ? Types.ObjectId.isValid(input.successorDecisionId)
        ? new Types.ObjectId(input.successorDecisionId)
        : unavailable()
      : undefined;
    if (reservedSuccessorId && !input.previousDecisionId) return unavailable();
    if (reservedSuccessorId && input.previousDecisionId) {
      const existingSuccessor = await RecommendationDecision.findOne({
        _id: reservedSuccessorId,
        pairId,
        previousDecisionId: input.previousDecisionId,
      }).lean<StoredDecision | null>();
      if (existingSuccessor) {
        await ensureActionNotification(pair, existingSuccessor);
        return hydrateDecision(existingSuccessor);
      }
    }
    const activity = await PairActivity.findOne({
      _id: input.activityId,
      pairId,
      status: 'offered',
    }).lean<StoredActivity | null>();
    if (!activity) return unavailable();

    const activityProvenance = activity.recommendationProvenance;
    if (
      !recommendationProvenanceMatchesContext(
        activityProvenance,
        recommendationContext
      ) ||
      activityProvenance?.activityContentHash !==
        buildActivityContentHash(activity)
    ) {
      await PairActivity.updateOne(
        { _id: activity._id, pairId, status: 'offered' },
        { $set: { status: 'cancelled' } }
      );
      return unavailable();
    }

    const templateId = templateIdFromActivity(activity);
    const safetyVeto = await isPairSafetyVetoActive(String(pairId));
    const role: 'A' | 'B' =
      pair.members[0] === input.currentUserId ? 'A' : 'B';
    if (!isOfferedActivityEligibleForRole({ activity, role, safetyVeto })) {
      if (
        hasP0SensitiveActivityAxis(activity.axis) ||
        !isActivityEligibleForSafetyState(activity, safetyVeto)
      ) {
        await PairActivity.updateOne(
          { _id: activity._id, status: 'offered' },
          { $set: { status: 'cancelled' } }
        );
      }
      return unavailable();
    }

    const active = await PairActivity.exists({
      pairId,
      status: { $in: ACTIVE_ACTIVITY_STATUSES },
    });
    if (active) return unavailable();

    const existing = await RecommendationDecision.findOne({ activityId: activity._id })
      .lean<StoredDecision | null>();
    if (existing) {
      if (existing.status !== 'OFFERED') return unavailable();
      if (
        input.previousDecisionId &&
        (String(existing.previousDecisionId ?? '') !== input.previousDecisionId ||
          (reservedSuccessorId &&
            String(existing._id) !== String(reservedSuccessorId)))
      ) {
        return unavailable();
      }
      if (
        !recommendationDocumentsMatchContext({
          decision: existing,
          activity,
          context: recommendationContext,
        })
      ) {
        await expireInvalidOfferedDecision(existing, new Date());
        return unavailable();
      }
      await ensureActionNotification(pair, existing);
      return hydrateDecision(existing);
    }

    let replacementDepth: 0 | 1 = 0;
    let previousDecision: StoredDecision | null = null;
    if (input.previousDecisionId) {
      previousDecision = await RecommendationDecision.findOne({
        _id: input.previousDecisionId,
        pairId,
        status: 'REPLACED',
        replacementDepth: 0,
        ...(reservedSuccessorId
          ? { successorDecisionId: reservedSuccessorId }
          : {}),
      }).lean<StoredDecision | null>();
      if (!previousDecision) return unavailable();
      replacementDepth = 1;
    }

    const now = new Date();
    const cycleKey = recommendationContext.cycleKey;
    const expiresAt = activity.dueAt ?? new Date(now.getTime() + 3 * DAY_MS);
    await expireAllOffered(pairId, now, reservedSuccessorId, cycleKey);

    let created: StoredDecision;
    let newlyCreated = false;
    try {
      const document = await RecommendationDecision.create({
        ...(reservedSuccessorId ? { _id: reservedSuccessorId } : {}),
        pairId,
        cycleKey,
        activityId: activity._id,
        templateId,
        status: 'OFFERED',
        reasonCode: previousDecision
          ? 'ALTERNATIVE_REQUESTED'
          : 'CURRENT_CYCLE_SUPPORT',
        decisionVersion: 'recommendation-decision-v1',
        provenance: activityProvenance,
        replacementDepth,
        ...(previousDecision ? { previousDecisionId: previousDecision._id } : {}),
        expiresAt,
      });
      created = document.toObject() as StoredDecision;
      newlyCreated = true;
    } catch (error) {
      if (!isRecord(error) || !isDuplicateKey(error)) throw error;
      const concurrent = reservedSuccessorId
        ? await RecommendationDecision.findById(reservedSuccessorId)
            .lean<StoredDecision | null>()
        : await RecommendationDecision.findOne({
            $or: [
              { activityId: activity._id },
              { pairId, cycleKey, status: 'OFFERED' },
            ],
          }).lean<StoredDecision | null>();
      if (!concurrent) return unavailable();
      const concurrentActivity = await PairActivity.findById(
        concurrent.activityId
      ).lean<StoredActivity | null>();
      if (
        !concurrentActivity ||
        !recommendationDocumentsMatchContext({
          decision: concurrent,
          activity: concurrentActivity,
          context: recommendationContext,
        }) ||
        (previousDecision &&
          String(concurrent.previousDecisionId ?? '') !==
            String(previousDecision._id))
      ) {
        if (concurrent.status === 'OFFERED') {
          await expireInvalidOfferedDecision(concurrent, new Date());
        }
        return unavailable();
      }
      created = concurrent;
    }

    if (previousDecision) {
      await RecommendationDecision.updateOne(
        {
          _id: previousDecision._id,
          status: 'REPLACED',
          successorDecisionId: { $exists: false },
        },
        { $set: { successorDecisionId: created._id } }
      );
    }
    if (
      !(await recommendationContextIsStillCanonical({
        pairId,
        context: recommendationContext,
        now: new Date(),
      }))
    ) {
      await expireInvalidOfferedDecision(created, new Date());
      return summaryNotReady();
    }
    await ensureActionNotification(pair, created);
    if (newlyCreated) {
      recordProductAnalyticsEvent({
        name: 'activity_offered',
        technicalScope: 'recommendation',
      });
      if (previousDecision) {
        recordProductAnalyticsEvent({
          name: 'activity_replaced',
          technicalScope: 'recommendation',
        });
      }
    }
    return hydrateDecision(created);
  },

  async prepareReplacement(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<PreparedReplacement | ExistingReplacement> {
    await connectToDatabase();
    let decision = await loadDecisionForMember({
      ...input,
      requireActive: true,
    });
    if (decision.status === 'REPLACED') {
      const successor = decision.successorDecisionId
        ? await RecommendationDecision.findById(decision.successorDecisionId)
            .lean<StoredDecision | null>()
        : await RecommendationDecision.findOne({ previousDecisionId: decision._id })
            .lean<StoredDecision | null>();
      if (successor) {
        if (!decision.successorDecisionId) {
          await RecommendationDecision.updateOne(
            { _id: decision._id, successorDecisionId: { $exists: false } },
            { $set: { successorDecisionId: successor._id } }
          );
        }
        const validatedSuccessor = await loadDecisionForMember({
          pairId: input.pairId,
          decisionId: String(successor._id),
          currentUserId: input.currentUserId,
          requireActive: true,
        });
        if (validatedSuccessor.status === 'OFFERED') {
          const pair = await ensurePairMember(input.pairId, input.currentUserId);
          await ensureActionNotification(pair, validatedSuccessor);
        }
        return {
          kind: 'existing',
          decision: await hydrateDecision(validatedSuccessor),
        };
      }
      decision = await reserveReplacementSuccessor(decision);
      await PairActivity.updateOne(
        { _id: decision.activityId, pairId: decision.pairId, status: 'offered' },
        { $set: { status: 'cancelled' } }
      );
      return toPreparedReplacement(decision);
    }

    decision = await transitionStored(decision, { type: 'REPLACE', at: new Date() });
    decision = await reserveReplacementSuccessor(decision);
    await PairActivity.updateOne(
      { _id: decision.activityId, pairId: decision.pairId, status: 'offered' },
      { $set: { status: 'cancelled' } }
    );
    return toPreparedReplacement(decision);
  },

  async rollbackReplacement(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<void> {
    await connectToDatabase();
    const decision = await loadDecisionForMember(input);
    if (decision.status !== 'REPLACED') return;
    const successor = decision.successorDecisionId
      ? await RecommendationDecision.findOne({
          _id: decision.successorDecisionId,
          previousDecisionId: decision._id,
        }).lean<StoredDecision | null>()
      : await RecommendationDecision.findOne({
          previousDecisionId: decision._id,
        }).lean<StoredDecision | null>();
    if (successor) return;

    const restored = await RecommendationDecision.findOneAndUpdate(
      {
        _id: decision._id,
        status: 'REPLACED',
        ...(decision.successorDecisionId
          ? { successorDecisionId: decision.successorDecisionId }
          : { successorDecisionId: { $exists: false } }),
      },
      {
        $set: { status: 'OFFERED' },
        $unset: { replacedAt: 1, successorDecisionId: 1 },
      },
      { new: true }
    ).lean<StoredDecision | null>();
    if (restored) {
      await PairActivity.updateOne(
        { _id: restored.activityId, pairId: restored.pairId, status: 'cancelled' },
        { $set: { status: 'offered' } }
      );
    }
  },

  async skip(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<RecommendationDecisionDTO> {
    await connectToDatabase();
    const decision = await loadDecisionForMember(input);
    let newlySkipped = false;
    const skipped = await transitionStored(
      decision,
      { type: 'SKIP', at: new Date() },
      undefined,
      () => {
        newlySkipped = true;
      }
    );
    await PairActivity.updateOne(
      { _id: skipped.activityId, pairId: skipped.pairId, status: 'offered' },
      { $set: { status: 'cancelled' } }
    );
    if (newlySkipped) {
      recordProductAnalyticsEvent({
        name: 'activity_skipped',
        technicalScope: 'recommendation',
      });
    }
    return hydrateDecision(skipped);
  },

  async claimAcceptedForActivity(
    activityId: string,
    now: Date,
    session?: ClientSession
  ): Promise<void> {
    await connectToDatabase();
    let decision = await RecommendationDecision.findOne({ activityId })
      .session(session ?? null)
      .lean<StoredDecision | null>();
    if (!decision) return unavailable();
    if (decision.status === 'ACCEPTED') return;
    if (!session) await reconcileOffered(decision.pairId, now);
    decision = await RecommendationDecision.findById(decision._id)
      .session(session ?? null)
      .lean<StoredDecision | null>();
    if (!decision) return unavailable();
    if (decision.status !== 'OFFERED') {
      return unavailable();
    }
    if (decision.expiresAt && decision.expiresAt.getTime() <= now.getTime()) {
      await transitionStored(decision, { type: 'EXPIRE', at: now }, session);
      await PairActivity.updateOne(
        { _id: decision.activityId, status: 'offered' },
        { $set: { status: 'expired' } }
      ).session(session ?? null);
      return unavailable();
    }

    const current = await RecommendationDecision.findOne({
      pairId: decision.pairId,
      status: 'OFFERED',
    })
      .sort({ createdAt: -1, _id: 1 })
      .session(session ?? null)
      .lean<StoredDecision | null>();
    if (!current || String(current._id) !== String(decision._id)) {
      return unavailable();
    }

    const activity = await PairActivity.findOne({
      _id: decision.activityId,
      pairId: decision.pairId,
      status: 'offered',
    })
      .session(session ?? null)
      .lean<StoredActivity | null>();
    if (!activity) return unavailable();
    if (
      !decision.provenance ||
      !recommendationDocumentsMatchContext({
        decision,
        activity,
        context: decision.provenance,
      }) ||
      !(await recommendationContextIsStillCanonical({
        pairId: decision.pairId,
        context: decision.provenance,
        now,
        session,
      }))
    ) {
      await expireInvalidOfferedDecision(decision, now, session);
      return summaryNotReady();
    }
    const safetyVeto = await isPairSafetyVetoActive(String(decision.pairId));
    if (
      hasP0SensitiveActivityAxis(activity.axis) ||
      !isActivityEligibleForSafetyState(activity, safetyVeto)
    ) {
      await transitionStored(decision, { type: 'EXPIRE', at: now }, session);
      await PairActivity.updateOne(
        { _id: activity._id, status: 'offered' },
        { $set: { status: 'cancelled' } }
      ).session(session ?? null);
      return unavailable();
    }
    const active = await PairActivity.exists({
      pairId: decision.pairId,
      _id: { $ne: decision.activityId },
      status: { $in: ACTIVE_ACTIVITY_STATUSES },
    }).session(session ?? null);
    if (active) return unavailable();
    await transitionStored(decision, { type: 'ACCEPT', at: now }, session);
  },

  async claimSkippedForActivity(input: {
    activityId: string;
    activityStatus: PairActivityType['status'];
    skippedAt: Date;
    session?: ClientSession;
  }): Promise<void> {
    await connectToDatabase();
    const decision = await RecommendationDecision.findOne({
      activityId: input.activityId,
    })
      .session(input.session ?? null)
      .lean<StoredDecision | null>();
    if (!decision) {
      if (input.activityStatus === 'offered') return unavailable();
      return;
    }
    if (decision.status === 'OFFERED') {
      await transitionStored(
        decision,
        { type: 'SKIP', at: input.skippedAt },
        input.session
      );
      return;
    }
    if (decision.status === 'SKIPPED') return;
    if (input.activityStatus === 'offered') {
      throw new DomainError({
        code: 'ACTIVITY_UNAVAILABLE',
        status: 409,
        message: 'Activity is unavailable',
      });
    }
  },

  async getById(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<RecommendationDecisionDTO> {
    await connectToDatabase();
    return hydrateDecision(await loadDecisionForMember(input));
  },
};
