import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';

export async function PATCH(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const body = (await req.json()) as Record<string, unknown>;
  await connectToDatabase();

  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    set[`profile.onboarding.${k}`] = v;
  }

  const doc = await User.findOneAndUpdate(
    { id: userId },
    { $set: set },
    { new: true, runValidators: true }
  ).lean<UserType | null>();

  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}
