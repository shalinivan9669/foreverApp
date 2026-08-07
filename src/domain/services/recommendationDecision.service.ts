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

type StoredDecision = RecommendationDecisionType & { _id: Types.ObjectId };
type StoredActivity = PairActivityType & { _id: Types.ObjectId };

const ACTIVE_ACTIVITY_STATUSES: PairActivityType['status'][] = [
  'accepted',
  'in_progress',
  'awaiting_checkin',
];

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
  session?: ClientSession
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
  if (updated) return updated;

  const concurrent = await RecommendationDecision.findById(decision._id)
    .session(session ?? null)
    .lean<StoredDecision | null>();
  if (concurrent?.status === transition.next.status) return concurrent;
  return unavailable();
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
  now: Date
): Promise<void> => {
  const offered = await RecommendationDecision.find({ pairId, status: 'OFFERED' })
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
    const current = pair.status === 'active'
      ? await loadCurrent(pairId, new Date())
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
    const current = await loadCurrent(pair._id as Types.ObjectId, new Date());
    if (!current) return null;
    return hydrateDecisionIfVisible({
      decision: current,
      role: roleForPairMember(
        pair.members as [string, string],
        input.currentUserId
      ),
      safetyVeto: await isPairSafetyVetoActive(String(pair._id)),
    });
  },

  async findEligibleOfferedActivity(input: {
    pairId: string;
    currentUserId: string;
    excludeActivityId?: string;
    excludeTemplateId?: string;
  }): Promise<string | null> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') return null;
    const candidates = await PairActivity.find({
      pairId: pair._id,
      status: 'offered',
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
  }): Promise<RecommendationDecisionDTO> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') return unavailable();
    const pairId = pair._id as Types.ObjectId;
    const activity = await PairActivity.findOne({
      _id: input.activityId,
      pairId,
      status: 'offered',
    }).lean<StoredActivity | null>();
    if (!activity) return unavailable();

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
      }).lean<StoredDecision | null>();
      if (!previousDecision) return unavailable();
      replacementDepth = 1;
    }

    const now = new Date();
    const cycleKey = recommendationCycleKey(activity.stateMeta, now);
    const expiresAt = activity.dueAt ?? new Date(now.getTime() + 3 * DAY_MS);
    await expireAllOffered(pairId, now);

    let created: StoredDecision;
    try {
      const document = await RecommendationDecision.create({
        pairId,
        cycleKey,
        activityId: activity._id,
        templateId,
        status: 'OFFERED',
        reasonCode: previousDecision
          ? 'ALTERNATIVE_REQUESTED'
          : 'CURRENT_CYCLE_SUPPORT',
        decisionVersion: 'recommendation-decision-v1',
        replacementDepth,
        ...(previousDecision ? { previousDecisionId: previousDecision._id } : {}),
        expiresAt,
      });
      created = document.toObject() as StoredDecision;
    } catch (error) {
      if (!isRecord(error) || !isDuplicateKey(error)) throw error;
      const concurrent = await RecommendationDecision.findOne({
        $or: [
          { activityId: activity._id },
          { pairId, cycleKey, status: 'OFFERED' },
        ],
      }).lean<StoredDecision | null>();
      if (!concurrent) return unavailable();
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
        return { kind: 'existing', decision: await hydrateDecision(successor) };
      }
      throw new DomainError({
        code: 'RECOMMENDATION_IN_PROGRESS',
        status: 409,
        message: 'Recommendation change is in progress',
      });
    }

    decision = await transitionStored(decision, { type: 'REPLACE', at: new Date() });
    await PairActivity.updateOne(
      { _id: decision.activityId, pairId: decision.pairId, status: 'offered' },
      { $set: { status: 'cancelled' } }
    );
    return {
      kind: 'prepared',
      decisionId: String(decision._id),
      pairId: String(decision.pairId),
      activityId: String(decision.activityId),
      ...(decision.templateId ? { templateId: decision.templateId } : {}),
    };
  },

  async rollbackReplacement(input: {
    pairId: string;
    decisionId: string;
    currentUserId: string;
  }): Promise<void> {
    await connectToDatabase();
    const decision = await loadDecisionForMember(input);
    if (decision.status !== 'REPLACED') return;
    const successor = await RecommendationDecision.findOne({
      previousDecisionId: decision._id,
    }).lean<StoredDecision | null>();
    if (successor) return;

    const restored = await RecommendationDecision.findOneAndUpdate(
      {
        _id: decision._id,
        status: 'REPLACED',
        successorDecisionId: { $exists: false },
      },
      { $set: { status: 'OFFERED' }, $unset: { replacedAt: 1 } },
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
    const skipped = await transitionStored(decision, { type: 'SKIP', at: new Date() });
    await PairActivity.updateOne(
      { _id: skipped.activityId, pairId: skipped.pairId, status: 'offered' },
      { $set: { status: 'cancelled' } }
    );
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
