// DTO rule: return only DTO/view model (never raw DB model shape).
// src/app/api/users/me/profile-summary/route.ts
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import { Like } from '@/models/Like';
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

  const status: 'solo:new' | 'solo:history' | 'paired' =
    activeOrPaused?.status === 'active' ? 'paired' : lastAny ? 'solo:history' : 'solo:new';

  const currentPair =
    activeOrPaused && activeOrPaused.status === 'active'
      ? { id: String(activeOrPaused._id), status: activeOrPaused.status, since: activeOrPaused.createdAt }
      : null;

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
  AXES.forEach((a) => {
    const trait = readAxisLayer(user, a, 'trait');
    const displayed = readDisplayedAxis(user, a);
    const rawLevel = displayed.level;
    const uiLevel = Math.round(rawLevel * 100);

    axes[a] = {
      level: uiLevel,
      rawLevel,
      confidence: displayed.confidence,
      confidenceLabel: confidenceLabel(displayed.confidence),
      positives: trait.positives,
      negatives: trait.negatives,
      dataStatus: dataStatus({
        confidence: trait.confidence,
        evidenceCount: trait.evidenceCount,
      }),
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

