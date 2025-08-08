import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';

export async function GET() {
  await connectToDatabase();
  const list = await Questionnaire
      .find({}, { questions: 0 })   // без тяжёлого массива
      .lean();
  return NextResponse.json(list);
}
