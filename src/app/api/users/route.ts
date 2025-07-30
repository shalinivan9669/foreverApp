// src/app/api/users/route.ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { User, UserType }    from '../../../models/User';

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<UserType>;
  await connectToDatabase();
  const update: Record<string, unknown> = {
    id: body.id,
    username: body.username,
    avatar: body.avatar,
  };
  if (body.personal) update.personal = body.personal;
  if (body.vectors) update.vectors = body.vectors;
  if (body.preferences) update.preferences = body.preferences;
  if (body.embeddings) update.embeddings = body.embeddings;
  if (body.location) update.location = body.location;

  const doc = await User.findOneAndUpdate(
    { id: body.id },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean<UserType>();
  return NextResponse.json(doc);
}
