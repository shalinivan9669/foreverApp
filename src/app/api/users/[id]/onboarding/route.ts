import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../../lib/mongodb';
import { User, UserType } from '../../../../../models/User';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const payload = (await req.json()) as NonNullable<UserType['profile']>['onboarding'];
  await connectToDatabase();
  const doc = await User.findOneAndUpdate(
    { id },
    { $set: { 'profile.onboarding': payload } },
    { new: true, runValidators: true }
  ).lean<UserType | null>();
  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}
