// src/app/api/match/feed/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { distance, score } from '@/utils/calcMatch';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { toMatchFeedCandidateDTO, toUserDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

const pickVec = (u: Pick<UserType, 'vectors'>): number[] => [
  u.vectors.communication.level,
  u.vectors.domestic.level,
  u.vectors.personalViews.level,
  u.vectors.finance.level,
  u.vectors.sexuality.level,
  u.vectors.psyche.level,
];

export async function GET(req: NextRequest) {
  const query = parseQuery(
    req,
    z
      .object({
        userId: z.string().optional(),
      })
      .passthrough()
  );
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const userId = auth.data.userId;

  await connectToDatabase();

  const me = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!me) return jsonError(404, 'USER_NOT_FOUND', 'user not found');

  const likedIds: string[] = await Like.find({ fromId: userId }).distinct('toId');

  const pairDocs = await Pair.find(
    { members: userId, status: { $in: ['active', 'paused'] } },
    { members: 1 }
  ).lean<{ members: string[] }[]>();

  const pairedIds = new Set<string>();
  for (const pair of pairDocs) {
    for (const member of pair.members) {
      if (member !== userId) pairedIds.add(member);
    }
  }

  const excluded = new Set<string>([userId, ...likedIds, ...pairedIds]);

  const candidates = await User.find(
    {
      id: { $nin: Array.from(excluded) },
      'profile.matchCard.isActive': true,
    },
    { id: 1, username: 1, avatar: 1, vectors: 1 }
  ).lean<UserType[]>();

  const myVec = pickVec(me);

  const list = candidates.map((candidate) => {
    const candidateScore = score(distance(myVec, pickVec(candidate)));
    const publicUser = toUserDTO(candidate, { scope: 'public' });
    return toMatchFeedCandidateDTO(publicUser, candidateScore);
  });

  list.sort((a, b) => b.score - a.score);

  return jsonOk(list.slice(0, 50));
}
