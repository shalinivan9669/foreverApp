import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { User, UserType }            from '@/models/User';
import { distance, score }           from '@/utils/calcMatch';

interface CandidateDTO {
  id: string;
  username: string;
  avatar: string;
  score: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('userId');
  if (!id) return NextResponse.json({ error: 'missing' }, { status: 400 });

  await connectToDatabase();

  const me = await User.findOne({ id }).lean<UserType | null>();
  if (!me)
    return NextResponse.json({ error: 'me' }, { status: 404 });

  /* фильтр по демографии */
  const filter: Record<string, unknown> = {
    'personal.gender': { $ne: me.personal.gender },
    'personal.relationshipStatus': 'seeking',
    'personal.age': {
      $gte: me.preferences.desiredAgeRange.min,
      $lte: me.preferences.desiredAgeRange.max
    }
  };

  const candidates = await User.find(filter).limit(300).lean<UserType[]>();

  const vecMe = [
    me.vectors.communication.level,
    me.vectors.domestic.level,
    me.vectors.personalViews.level,
    me.vectors.finance.level,
    me.vectors.sexuality.level,
    me.vectors.psyche.level
  ];

  const scored: CandidateDTO[] = candidates
    .map((c) => {
      const vecC = [
        c.vectors.communication.level,
        c.vectors.domestic.level,
        c.vectors.personalViews.level,
        c.vectors.finance.level,
        c.vectors.sexuality.level,
        c.vectors.psyche.level
      ];
      const d = distance(vecMe, vecC);
      return {
        id: c.id,
        avatar: c.avatar,
        username: c.username,
        score: score(d)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return NextResponse.json(scored);
}
