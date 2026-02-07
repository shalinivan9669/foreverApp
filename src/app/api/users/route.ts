// src/app/api/users/route.ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { User, UserType }    from '../../../models/User';
import { requireSession } from '@/lib/auth/guards';

export async function POST(request: Request) {
  const auth = requireSession(request);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = (await request.json()) as Partial<UserType>;
  await connectToDatabase();

  const updateFields: Record<string, unknown> = {
    username: body.username,
    avatar: body.avatar,
  };
  if (body.personal) updateFields.personal = body.personal;
  if (body.vectors) updateFields.vectors = body.vectors;
  if (body.preferences) updateFields.preferences = body.preferences;
  if (body.embeddings) updateFields.embeddings = body.embeddings;
  if (body.location) updateFields.location = body.location;

  const doc = await User.findOneAndUpdate(
    { id: currentUserId },
    {
      $set: updateFields,
      $setOnInsert: { id: currentUserId },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean<UserType>();

  return NextResponse.json(doc);
}
