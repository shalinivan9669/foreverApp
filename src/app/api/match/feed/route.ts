// src/app/api/match/feed/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { distance, score } from '@/utils/calcMatch';
import { requireSession } from '@/lib/auth/guards';

type CandidateDTO = {
  id: string;
  username: string;
  /** Discord avatar hash; фронт сам соберёт URL */
  avatar: string;
  /** 0..100 */
  score: number;
};

// извлекаем уровни векторов в фиксированном порядке
const pickVec = (u: Pick<UserType, 'vectors'>): number[] => [
  u.vectors.communication.level,
  u.vectors.domestic.level,
  u.vectors.personalViews.level,
  u.vectors.finance.level,
  u.vectors.sexuality.level,
  u.vectors.psyche.level,
];

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const userId = auth.data.userId;

  await connectToDatabase();

  // Текущий пользователь
  const me = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!me) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // Кого уже лайкнул текущий пользователь
  const likedIds: string[] = await Like.find({ fromId: userId }).distinct('toId');

  // С кем уже есть активная/приостановленная пара — тоже исключаем
  const pairDocs = await Pair.find(
    { members: userId, status: { $in: ['active', 'paused'] } },
    { members: 1 }
  ).lean<{ members: string[] }[]>();

  const pairedIds = new Set<string>();
  for (const p of pairDocs) {
    for (const m of p.members) if (m !== userId) pairedIds.add(m);
  }

  const excluded = new Set<string>([userId, ...likedIds, ...pairedIds]);

  // Кандидаты: только с активной карточкой
  const candidates = await User.find(
    {
      id: { $nin: Array.from(excluded) },
      'profile.matchCard.isActive': true,
    },
    // берём только нужные поля
    { id: 1, username: 1, avatar: 1, vectors: 1 }
  ).lean<UserType[]>();

  const myVec = pickVec(me);

  const list: CandidateDTO[] = candidates.map((u) => {
    const s = score(distance(myVec, pickVec(u)));
    return {
      id: u.id,
      username: u.username ?? u.id,
      // ВАЖНО: возвращаем именно hash, без полного URL — фронт сам склеит
      avatar: u.avatar ?? '',
      score: s,
    };
  });

  // сортируем по убыванию и ограничиваем размер
  list.sort((a, b) => b.score - a.score);

  return NextResponse.json(list.slice(0, 50));
}
