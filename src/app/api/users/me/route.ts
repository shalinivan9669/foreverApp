import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();
  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}

export async function PUT(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const body = (await req.json()) as Partial<UserType>;
  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (body.personal) update.personal = body.personal;
  if (body.vectors) update.vectors = body.vectors;
  if (body.preferences) update.preferences = body.preferences;
  if (body.embeddings) update.embeddings = body.embeddings;
  if (body.location) update.location = body.location;

  const doc = await User.findOneAndUpdate(
    { id: userId },
    update,
    { new: true, runValidators: true }
  ).lean<UserType | null>();

  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}
