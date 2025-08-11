import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../../lib/mongodb';
import { User, UserType } from '../../../../../models/User';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await req.json(); // { seeking? , inRelationship? }
  await connectToDatabase();

  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    set[`profile.onboarding.${k}`] = v;
  }

  const doc = await User.findOneAndUpdate(
    { id }, { $set: set }, { new: true, runValidators: true }
  ).lean<UserType | null>();

  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}