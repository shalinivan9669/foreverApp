// src/app/api/users/route.ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { User, UserType }    from '../../../models/User';

export async function POST(request: Request) {
  const body = (await request.json()) as UserType;
  await connectToDatabase();
  const doc = await User.findOneAndUpdate(
    { id: body.id },
    { username: body.username, avatar: body.avatar },
    { upsert: true, new: true }
  ).lean<UserType>();
  return NextResponse.json(doc);
}
