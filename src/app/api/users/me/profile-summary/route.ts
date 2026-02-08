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

// в”Ђв”Ђ Р›РѕРєР°Р»СЊРЅС‹Рµ СЂР°СЃС€РёСЂРµРЅРёСЏ С‚РёРїРѕРІ (С‡С‚РѕР±С‹ РЅРµ РїСЂР°РІРёС‚СЊ РјРѕРґРµР»Рё РїСЂСЏРјРѕ СЃРµР№С‡Р°СЃ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
type PairLean = PairType & { _id: Types.ObjectId; createdAt: Date };
type UserExtra = Partial<{
  streak: { individual: number };
  completed: { individual: number };
  readiness: { score: number; updatedAt: Date };
  fatigue: { score: number; updatedAt: Date };
  passport: { values?: string[]; boundaries?: string[] };
}>;

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

  // РџР°СЂР°: СЃРЅР°С‡Р°Р»Р° Р°РєС‚РёРІРЅР°СЏ/РїР°СѓР·Р°
  const activeOrPaused = await Pair.findOne({
    members: userId,
    status: { $in: ['active', 'paused'] },
  })
    .sort({ createdAt: -1 })
    .lean<PairLean | null>();

  // Р›СЋР±Р°СЏ РїРѕСЃР»РµРґРЅСЏСЏ вЂ” С‡С‚РѕР±С‹ СЂР°Р·Р»РёС‡РёС‚СЊ solo:new vs solo:history
  const lastAny =
    activeOrPaused ??
    (await Pair.findOne({ members: userId }).sort({ createdAt: -1 }).lean<PairLean | null>());

  const status: 'solo:new' | 'solo:history' | 'paired' =
    activeOrPaused?.status === 'active' ? 'paired' : lastAny ? 'solo:history' : 'solo:new';

  const currentPair =
    activeOrPaused && activeOrPaused.status === 'active'
      ? { _id: String(activeOrPaused._id), status: activeOrPaused.status, since: activeOrPaused.createdAt }
      : null;

  const entitlements = await resolveEntitlements({
    currentUserId: userId,
    pairId: currentPair?._id,
  });

  // РЈСЂРѕРІРЅРё РїРѕ 6 РѕСЃСЏРј РёР· user.vectors (0..100)
  const levelsByAxis: Record<Axis, number> = {
    communication: 0,
    domestic: 0,
    personalViews: 0,
    finance: 0,
    sexuality: 0,
    psyche: 0,
  };
  AXES.forEach((a) => {
    const lvl = Number(user.vectors?.[a]?.level ?? 0);
    const clamped = Math.max(0, Math.min(1, isFinite(lvl) ? lvl : 0));
    levelsByAxis[a] = Math.round(clamped * 100);
  });

  // РЎРёР»СЊРЅС‹Рµ/Р·РѕРЅС‹ СЂРѕСЃС‚Р° вЂ” РїСЂРѕСЃС‚Р°СЏ СЌРІСЂРёСЃС‚РёРєР° РїРѕ РєРѕР»РёС‡РµСЃС‚РІСѓ facets
  const strongSides: string[] = [];
  const growthAreas: string[] = [];
  AXES.forEach((a) => {
    const pos = user.vectors?.[a]?.positives?.length ?? 0;
    const neg = user.vectors?.[a]?.negatives?.length ?? 0;
    if (pos >= 2) strongSides.push(a);
    if (neg >= 2) growthAreas.push(a);
  });

  // РРЅР±РѕРєСЃ/Р°СѓС‚Р±РѕРєСЃ
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

  // Р¤РёР»СЊС‚СЂС‹/РїСЂРµРґРїРѕС‡С‚РµРЅРёСЏ
const prefs = (user.preferences ?? {}) as Partial<UserType['preferences']>;
  const filters = {
    age: [prefs?.desiredAgeRange?.min ?? 18, prefs?.desiredAgeRange?.max ?? 99],
    radiusKm: prefs?.maxDistanceKm ?? 50,
    valuedQualities: (user.profile?.onboarding?.seeking?.valuedQualities ?? []).slice(0, 3),
    excludeTags: [] as string[],
  };

  const payload = {
    user: {
      _id: user.id,
      handle: user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
      joinedAt: user.createdAt,
      status,
      lastActiveAt: user.updatedAt,
      featureFlags: {
        PERSONAL_ACTIVITIES: entitlements.features['activities.suggestions'],
        PREMIUM_QUESTIONNAIRES: entitlements.features['questionnaires.premium'],
        LOOTBOXES: entitlements.features['lootboxes.access'],
      },
    },
    currentPair,
    metrics: {
      streak: { individual: user.streak?.individual ?? 0 },
      completed: { individual: user.completed?.individual ?? 0 },
    },
    readiness: user.readiness ?? { score: 0, updatedAt: user.updatedAt },
    fatigue: user.fatigue ?? { score: 0, updatedAt: user.updatedAt },
    passport: {
      levelsByAxis,
      strongSides,
      growthAreas,
      values: user.passport?.values ?? [],
      boundaries: user.passport?.boundaries ?? [],
    },
    activity: {
      current: null as null, // РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ Р°РєС‚РёРІРЅРѕСЃС‚Рё РїРѕРєР° РЅРµ СЂРµР°Р»РёР·РѕРІР°РЅС‹
      suggested: [] as unknown[], // Р·Р°РіР»СѓС€РєР°
      historyCount: 0,
    },
    matching: {
      inboxCount,
      outboxCount,
      filters,
    },
    insights: [] as unknown[], // Р·Р°РіР»СѓС€РєР° (РґРѕР±Р°РІРёРј, РєРѕРіРґР° РїРѕСЏРІРёС‚СЃСЏ РјРѕРґРµР»СЊ Insight)
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

