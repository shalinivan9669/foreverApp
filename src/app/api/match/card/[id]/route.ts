// src/app/api/match/card/[id]/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';

type CardDTO =
  | { requirements: [string, string, string]; questions: [string, string] }
  | null;

export async function GET(_req: Request, ctx: any) {
  // Next 15 валидатор принимает any для context; достаём params вручную
  const id: string | undefined = ctx?.params?.id;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  await connectToDatabase();

  const u = await User.findOne({ id })
    .select({
      'profile.matchCard.isActive': 1,
      'profile.matchCard.requirements': 1,
      'profile.matchCard.questions': 1,
      _id: 0,
    })
    .lean();

  if (!u || !u.profile?.matchCard?.isActive) {
    return NextResponse.json({ error: 'no active match card' }, { status: 404 });
  }

  const reqs = u.profile.matchCard.requirements ?? [];
  const qs = u.profile.matchCard.questions ?? [];

  const dto: CardDTO =
    reqs.length === 3 && qs.length === 2
      ? {
          requirements: [reqs[0], reqs[1], reqs[2]],
          questions: [qs[0], qs[1]],
        }
      : null;

  if (!dto) return NextResponse.json({ error: 'bad card' }, { status: 500 });

  return NextResponse.json(dto);
}
