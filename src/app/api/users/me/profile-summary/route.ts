// DTO rule: return only DTO/view model (never raw DB model shape).
// src/app/api/users/me/profile-summary/route.ts
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import { Like } from '@/models/Like';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { resolveEntitlements } from '@/lib/entitlements';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import {
  confidenceLabel,
  dataStatus,
  readAxisLayer,
  readDisplayedAxis,
} from '@/domain/services/vectorScoring.service';
import { listMyInsights } from '@/domain/services/insightRules.service';
import {
  buildProfileCompletion,
  buildProfileMode,
  buildProfileNextStep,
  buildRelationshipContext,
  toLegacyProfileStatus,
  type PassportCompletionAxisInput,
} from '@/domain/services/userProfileSummary.service';
import { buildPairWeeklyCheckInSummary } from '@/domain/services/weeklyCheckIn.service';
import {
  buildMyActivityState,
  buildPairedProfileNextStep,
  buildPairedProfileState,
} from '@/domain/services/pairedUserProfileState.service';

type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

const AXES: Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
];

// Local type extensions (to avoid changing models in this pass).
type PairLean = PairType & { _id: Types.ObjectId; createdAt: Date };
type UserExtra = Partial<{
  _id: Types.ObjectId;
  streak: { individual: number };
  completed: { individual: number };
  readiness: { score: number; updatedAt: Date };
  fatigue: { score: number; updatedAt: Date };
  passport: { values?: string[]; boundaries?: string[] };
}>;

type PassportAxisSummary = {
  level: number;
  rawLevel: number;
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  positives: string[];
  negatives: string[];
  dataStatus: 'enough' | 'low_confidence' | 'missing';
};

type PairActivityLean = PairActivityType & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

const currentActivityStatuses: PairActivityType['status'][] = [
  'offered',
  'accepted',
  'in_progress',
  'awaiting_checkin',
  'completed_partial',
];

const activityTitle = (activity: PairActivityLean | null): string | undefined => {
  const title = activity?.title?.ru?.trim() || activity?.title?.en?.trim();
  return title && title.length > 0 ? title : undefined;
};

const submittedByFromActivity = (activity: PairActivityLean | null): Array<'A' | 'B'> => {
  if (!activity) return [];
  if (activity.resultSummary?.submittedBy.length) {
    return [...activity.resultSummary.submittedBy];
  }
  return Array.from(new Set((activity.answers ?? []).map((answer) => answer.by)));
};

const roleForUser = (
  activity: PairActivityLean | null,
  userObjectId: Types.ObjectId | undefined
): 'A' | 'B' | undefined => {
  if (!activity || !userObjectId) return undefined;
  const currentId = String(userObjectId);
  if (String(activity.members[0]) === currentId) return 'A';
  if (String(activity.members[1]) === currentId) return 'B';
  return undefined;
};

// GET /api/users/me/profile-summary
export async function GET(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();

  const user = await User.findOne({ id: userId }).lean<UserType & UserExtra | null>();
  if (!user) return jsonError(404, 'USER_NOT_FOUND', 'no user');

  // Pair: prefer active/paused first.
  const activeOrPaused = await Pair.findOne({
    members: userId,
    status: { $in: ['active', 'paused'] },
  })
    .sort({ createdAt: -1 })
    .lean<PairLean | null>();

  // Latest pair to distinguish solo:new vs solo:history.
  const lastAny =
    activeOrPaused ??
    (await Pair.findOne({ members: userId }).sort({ createdAt: -1 }).lean<PairLean | null>());

  const relationshipContext = buildRelationshipContext({
    activeOrPausedPair: activeOrPaused
      ? {
          id: String(activeOrPaused._id),
          status: activeOrPaused.status,
          createdAt: activeOrPaused.createdAt,
        }
      : null,
    lastAnyPair: lastAny
      ? {
          id: String(lastAny._id),
          status: lastAny.status,
          createdAt: lastAny.createdAt,
        }
      : null,
  });
  const profileMode = buildProfileMode(relationshipContext);
  const status = toLegacyProfileStatus(profileMode);
  const currentPair = relationshipContext.currentPair;

  const entitlements = await resolveEntitlements({
    currentUserId: userId,
    pairId: currentPair?.id,
  });

  const avatarUrl = user.avatar ? toDiscordAvatarUrl(user.id, user.avatar) : null;

  // Levels on 6 axes from normalized user vectors. Legacy flat vectors are read as trait.
  const axes: Record<Axis, PassportAxisSummary> = {
    communication: {
      level: 0,
      rawLevel: 0,
      confidence: 0,
      confidenceLabel: 'low',
      positives: [],
      negatives: [],
      dataStatus: 'missing',
    },
    domestic: {
      level: 0,
      rawLevel: 0,
      confidence: 0,
      confidenceLabel: 'low',
      positives: [],
      negatives: [],
      dataStatus: 'missing',
    },
    personalViews: {
      level: 0,
      rawLevel: 0,
      confidence: 0,
      confidenceLabel: 'low',
      positives: [],
      negatives: [],
      dataStatus: 'missing',
    },
    finance: {
      level: 0,
      rawLevel: 0,
      confidence: 0,
      confidenceLabel: 'low',
      positives: [],
      negatives: [],
      dataStatus: 'missing',
    },
    sexuality: {
      level: 0,
      rawLevel: 0,
      confidence: 0,
      confidenceLabel: 'low',
      positives: [],
      negatives: [],
      dataStatus: 'missing',
    },
    psyche: {
      level: 0,
      rawLevel: 0,
      confidence: 0,
      confidenceLabel: 'low',
      positives: [],
      negatives: [],
      dataStatus: 'missing',
    },
  };
  const levelsByAxis: Record<Axis, number> = {
    communication: 0,
    domestic: 0,
    personalViews: 0,
    finance: 0,
    sexuality: 0,
    psyche: 0,
  };
  // Strong sides / growth areas via simple facets-count heuristic.
  const strongSides: string[] = [];
  const growthAreas: string[] = [];
  const positivesByAxis: Record<Axis, string[]> = {
    communication: [],
    domestic: [],
    personalViews: [],
    finance: [],
    sexuality: [],
    psyche: [],
  };
  const negativesByAxis: Record<Axis, string[]> = {
    communication: [],
    domestic: [],
    personalViews: [],
    finance: [],
    sexuality: [],
    psyche: [],
  };
  const passportCompletionAxes: Record<Axis, PassportCompletionAxisInput> = {
    communication: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
    domestic: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
    personalViews: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
    finance: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
    sexuality: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
    psyche: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
  };
  AXES.forEach((a) => {
    const trait = readAxisLayer(user, a, 'trait');
    const displayed = readDisplayedAxis(user, a);
    const rawLevel = displayed.level;
    const uiLevel = Math.round(rawLevel * 100);
    const axisDataStatus = dataStatus({
      confidence: trait.confidence,
      evidenceCount: trait.evidenceCount,
    });

    axes[a] = {
      level: uiLevel,
      rawLevel,
      confidence: displayed.confidence,
      confidenceLabel: confidenceLabel(displayed.confidence),
      positives: trait.positives,
      negatives: trait.negatives,
      dataStatus: axisDataStatus,
    };
    passportCompletionAxes[a] = {
      dataStatus: axisDataStatus,
      confidence: trait.confidence,
      evidenceCount: trait.evidenceCount,
    };

    levelsByAxis[a] = uiLevel;
    positivesByAxis[a] = trait.positives;
    negativesByAxis[a] = trait.negatives;

    const pos = trait.positives.length;
    const neg = trait.negatives.length;
    if (pos >= 2) strongSides.push(a);
    if (neg >= 2) growthAreas.push(a);
  });

  const psycheState = readAxisLayer(user, 'psyche', 'state');
  const stateUpdatedAt = psycheState.updatedAt ?? user.updatedAt;

  // Inbox / outbox.
  const [inboxCount, outboxCount] = await Promise.all([
    Like.countDocuments({
      toId: userId,
      status: { $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready'] },
    }),
    Like.countDocuments({
      fromId: userId,
      status: {
        $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready', 'paired', 'expired', 'rejected'],
      },
    }),
  ]);

  // Filters / preferences.
  const prefs = (user.preferences ?? {}) as Partial<UserType['preferences']>;
  const filters = {
    age: [prefs?.desiredAgeRange?.min ?? 18, prefs?.desiredAgeRange?.max ?? 99],
    radiusKm: prefs?.maxDistanceKm ?? 50,
    valuedQualities: (user.profile?.onboarding?.seeking?.valuedQualities ?? []).slice(0, 3),
    excludeTags: [] as string[],
  };
  const insights = await listMyInsights(userId);
  const profileCompletion = buildProfileCompletion({
    mode: profileMode,
    relationshipContext,
    personal: user.personal,
    preferences: user.preferences,
    matchCard: user.profile?.matchCard ?? null,
    passportAxes: passportCompletionAxes,
  });
  const pairObjectId = currentPair?.id && Types.ObjectId.isValid(currentPair.id)
    ? new Types.ObjectId(currentPair.id)
    : null;
  const [pairDocForWeekly, currentPairActivity] =
    profileMode.kind === 'paired' && currentPair
      ? await Promise.all([
          Pair.findById(currentPair.id),
          pairObjectId
            ? PairActivity.findOne({
                pairId: pairObjectId,
                status: { $in: currentActivityStatuses },
              })
                .sort({ updatedAt: -1 })
                .lean<PairActivityLean | null>()
            : Promise.resolve(null),
        ])
      : [null, null];
  const weeklySummary =
    pairDocForWeekly && currentPair
      ? await buildPairWeeklyCheckInSummary({
          pair: pairDocForWeekly,
          currentUserId: userId,
        })
      : null;
  const myActivityState = buildMyActivityState(
    currentPairActivity
      ? {
          hasCurrentActivity: true,
          currentActivityId: String(currentPairActivity._id),
          currentActivityTitle: activityTitle(currentPairActivity),
          status: currentPairActivity.status,
          currentUserRole: roleForUser(currentPairActivity, user._id),
          submittedBy: submittedByFromActivity(currentPairActivity),
        }
      : null
  );
  const pairedProfileState =
    profileMode.kind === 'paired' && currentPair
      ? buildPairedProfileState({
          pairId: currentPair.id,
          pairStatus: currentPair.status,
          weeklySummary,
          myActivityState,
        })
      : null;
  const baseNextStep = buildProfileNextStep({
    mode: profileMode,
    completion: profileCompletion,
    relationshipContext,
  });
  const nextStep =
    buildPairedProfileNextStep({
      mode: profileMode,
      completion: profileCompletion,
      pairedProfileState,
    }) ?? baseNextStep;

  const payload = {
    user: {
      id: user.id,
      name: user.username,
      handle: user.username,
      avatar: avatarUrl,
      avatarUrl,
      joinedAt: user.createdAt,
      status,
      lastActiveAt: user.updatedAt,
      personal: {
        gender: user.personal?.gender ?? null,
        age: user.personal?.age ?? null,
        city: user.personal?.city ?? '',
        relationshipStatus: user.personal?.relationshipStatus ?? null,
      },
      featureFlags: {
        PERSONAL_ACTIVITIES: entitlements.features['activities.suggestions'],
        PREMIUM_QUESTIONNAIRES: entitlements.features['questionnaires.premium'],
        LOOTBOXES: entitlements.features['lootboxes.access'],
      },
    },
    pair: currentPair
      ? {
          id: currentPair.id,
          status: currentPair.status,
        }
      : undefined,
    currentPair,
    relationshipContext,
    profileMode,
    profileCompletion,
    pairedProfileState,
    nextStep,
    metrics: {
      streak: { individual: user.streak?.individual ?? 0 },
      completed: { individual: user.completed?.individual ?? 0 },
    },
    readiness: user.readiness ?? { score: 0, updatedAt: user.updatedAt },
    fatigue: user.fatigue ?? { score: 0, updatedAt: user.updatedAt },
    passport: {
      axes,
      levelsByAxis,
      positivesByAxis,
      negativesByAxis,
      strongSides,
      growthAreas,
      values: user.passport?.values ?? [],
      boundaries: user.passport?.boundaries ?? [],
      updatedAt: user.updatedAt,
    },
    activity: {
      current: null as null, // Personal activities are not implemented yet.
      suggested: [] as Array<{ id: string; title?: string }>, // Placeholder.
      historyCount: 0,
    },
    matching: {
      inboxCount,
      outboxCount,
      filters,
    },
    insights,
    resource: {
      fatigue: user.fatigue ?? { score: 0, updatedAt: user.updatedAt },
      readiness: user.readiness ?? { score: 0, updatedAt: user.updatedAt },
      stateUpdatedAt,
      message:
        psycheState.confidence > 0
          ? 'Текущий ресурс показан как предварительное наблюдение по ответам.'
          : 'Данных о текущем ресурсе пока мало.',
    },
    strengths: strongSides,
    growthZones: growthAreas,
    recommendations: [] as string[],
    questionnaireProgress: {
      completedCount: user.completed?.individual ?? 0,
      recommendedNextQuestionnaireIds: [] as string[],
    },
    locked: {
      advancedInsights: !entitlements.features['questionnaires.premium'],
      pairDeepDiagnostics: !entitlements.features['activities.suggestions'],
    },
    featureFlags: {
      PERSONAL_ACTIVITIES: entitlements.features['activities.suggestions'],
      PREMIUM_QUESTIONNAIRES: entitlements.features['questionnaires.premium'],
      LOOTBOXES: entitlements.features['lootboxes.access'],
    },
    entitlements: {
      plan: entitlements.plan,
      status: entitlements.status,
      periodEnd: entitlements.periodEnd ?? null,
    },
  };

  return jsonOk(payload);
}

