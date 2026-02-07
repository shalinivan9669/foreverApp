// src/app/api/logs/route.ts
import { NextResponse }     from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { Log } from '../../../models/Log';
import { requireSession } from '@/lib/auth/guards';

export async function POST(request: Request) {
  const auth = requireSession(request);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();

  const entry = await Log.create({ userId, at: new Date() });
  return NextResponse.json(entry);
}
