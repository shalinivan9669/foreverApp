import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';

export async function GET(_req: Request) {
  await connectToDatabase();
  const list = await Questionnaire.find().lean();
  return NextResponse.json(list);
}
