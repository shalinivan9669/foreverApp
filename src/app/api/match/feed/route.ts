import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Like } from '@/models/Like';
import { Pair } from '@/models/Pair';

type CandidateDTO = {
  id: string;
  username: string;
  avatar: string;
  // добавь сюда поля, которые уже отдаёшь во фиде (matchScore и т.п.), если нужно
};

const avatarUrl = (id: string, avatar?: string) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') || '';
  if (!userId) {
    return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  }

  await connectToDatabase();

  // все, кого уже лайкнул текущий пользователь и лайк ещё "активен"
  // (не rejected/expired). таких людей нужно исключить из поиска
  const likedTo = await Like.find({
    fromId: userId,
    status: { $nin: ['rejected', 'expired'] },
  })
    .distinct('toId')
    .exec();

  // всех активных/пауза-партнёров тоже исключаем
  const pairs = await Pair.find({
    members: userId,
    status: { $in: ['active', 'paused'] },
  })
    .select({ members: 1 })
    .lean();

  const pairedIds = new Set<string>();
  for (const p of pairs) {
    for (const m of p.members as string[]) {
      if (m !== userId) pairedIds.add(m);
    }
  }

  const exclude = new Set<string>([userId, ...likedTo, ...pairedIds]);

  // Базовый запрос к пользователям.
  // Если у тебя есть доп. фильтры (isSeeking, локаль и т.д.) — оставь их.
  const docs = await User.find({
    id: { $nin: Array.from(exclude) },
    // пример: 'profile.matchCard.isActive': true,
  })
    .select({ id: 1, username: 1, avatar: 1 })
    .limit(50) // выставь своё ограничение
    .lean<UserType[]>();

  const data: CandidateDTO[] = docs.map((u) => ({
    id: u.id,
    username: u.username ?? u.id,
    avatar: avatarUrl(u.id, u.avatar),
  }));

  return NextResponse.json(data);
}
