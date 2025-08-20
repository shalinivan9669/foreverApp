// src/app/api/activity-templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ActivityTemplate } from '@/models/ActivityTemplate';

export async function GET(req: NextRequest) {
  await connectToDatabase();

  const { searchParams } = new URL(req.url);
  const axis = searchParams.get('axis') || undefined;
  const intent = searchParams.get('intent') || undefined;
  const difficulty = searchParams.get('difficulty') || undefined;
  const limit = Number(searchParams.get('limit') ?? 50);

  const q: Record<string, unknown> = {};
  if (axis) q.axis = axis;
  if (intent) q.intent = intent;
  if (difficulty) q.difficulty = Number(difficulty);

  const list = await ActivityTemplate.find(q).sort({ updatedAt: -1 }).limit(limit).lean();
  return NextResponse.json(list);
}
