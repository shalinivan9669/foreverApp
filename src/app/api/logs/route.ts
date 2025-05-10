// src/app/api/logs/route.ts
import { NextResponse }     from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { Log } from '../../../models/Log';

export async function POST(request: Request) {
  const { userId } = (await request.json()) as { userId: string };
  await connectToDatabase();

  const entry = await Log.create({ userId, at: new Date() });
  return NextResponse.json(entry);
}
