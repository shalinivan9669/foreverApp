import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';

// GET /api/questionnaires?target=couple|individual
export async function GET(req: NextRequest) {
  await connectToDatabase();
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target');

  const q: Record<string, unknown> = {};
  if (target === 'couple' || target === 'individual') q['target.type'] = target;

  const list = await Questionnaire.find(q).lean();
  return NextResponse.json(list);
}
