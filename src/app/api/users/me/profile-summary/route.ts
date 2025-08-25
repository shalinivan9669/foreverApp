// src/app/api/users/me/profile-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import { Like } from '@/models/Like';

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

// ── Локальные расширения типов (чтобы не править модели прямо сейчас) ─────────
type PairLean = PairType & { _id: Types.ObjectId; createdAt: Date };
type UserExtra = Partial<{
  featureFlags: { PERSONAL_ACTIVITIES?: boolean };
  streak: { individual: number };
  completed: { individual: number };
  readiness: { score: number; updatedAt: Date };
  fatigue: { score: number; updatedAt: Date };
  passport: { values?: string[]; boundaries?: string[] };
}>;

// GET /api/users/me/profile-summary?userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  const user = await User.findOne({ id: userId }).lean<UserType & UserExtra | null>();
  if (!user) return NextResponse.json({ error: 'no user' }, { status: 404 });

  // Пара: сначала активная/пауза
  const activeOrPaused = await Pair.findOne({
    members: userId,
    status: { $in: ['active', 'paused'] },
  })
    .sort({ createdAt: -1 })
    .lean<PairLean | null>();

  // Любая последняя — чтобы различить solo:new vs solo:history
  const lastAny =
    activeOrPaused ??
    (await Pair.findOne({ members: userId }).sort({ createdAt: -1 }).lean<PairLean | null>());

  const status: 'solo:new' | 'solo:history' | 'paired' =
    activeOrPaused?.status === 'active' ? 'paired' : lastAny ? 'solo:history' : 'solo:new';

  const currentPair =
    activeOrPaused && activeOrPaused.status === 'active'
      ? { _id: String(activeOrPaused._id), status: activeOrPaused.status, since: activeOrPaused.createdAt }
      : null;

  // Уровни по 6 осям из user.vectors (0..100)
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

  // Сильные/зоны роста — простая эвристика по количеству facets
  const strongSides: string[] = [];
  const growthAreas: string[] = [];
  AXES.forEach((a) => {
    const pos = user.vectors?.[a]?.positives?.length ?? 0;
    const neg = user.vectors?.[a]?.negatives?.length ?? 0;
    if (pos >= 2) strongSides.push(a);
    if (neg >= 2) growthAreas.push(a);
  });

  // Инбокс/аутбокс
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

  // Фильтры/предпочтения
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
      featureFlags: user.featureFlags ?? {},
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
      current: null as null, // персональные активности пока не реализованы
      suggested: [] as unknown[], // заглушка
      historyCount: 0,
    },
    matching: {
      inboxCount,
      outboxCount,
      filters,
    },
    insights: [] as unknown[], // заглушка (добавим, когда появится модель Insight)
    featureFlags: {
      PERSONAL_ACTIVITIES: Boolean(user.featureFlags?.PERSONAL_ACTIVITIES),
    },
  };

  return NextResponse.json(payload);
}
