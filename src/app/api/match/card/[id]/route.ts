import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await connectToDatabase();
  const doc = await User.findOne(
    { id },
    { 'profile.matchCard': 1, _id: 0 }
  ).lean();

  const card = doc?.profile?.matchCard ?? null;
  if (!card || card.isActive === false)
    return NextResponse.json(null, { status: 404 });

  return NextResponse.json(card);
}
