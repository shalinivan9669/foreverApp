import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';

type Card = { requirements: [string, string, string]; questions: [string, string] };

const clamp = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  await connectToDatabase();

  const u = await User.findOne({ id }).lean();
  if (!u) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const card = u.profile?.matchCard;
  if (!card?.isActive) {
    return NextResponse.json({ error: 'no active match card' }, { status: 404 });
  }
  const reqs = card.requirements ?? [];
  const qs   = card.questions ?? [];

  if (reqs.length < 3 || qs.length < 2) {
    return NextResponse.json({ error: 'card incomplete' }, { status: 422 });
  }

  const payload: Card = {
    requirements: [
      clamp(reqs[0], 160),
      clamp(reqs[1], 160),
      clamp(reqs[2], 160),
    ] as [string, string, string],
    questions: [
      clamp(qs[0], 200),
      clamp(qs[1], 200),
    ] as [string, string],
  };

  return NextResponse.json(payload);
}
