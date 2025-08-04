import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
 

export async function GET() {
  await connectToDatabase();

  // можно добавить auth и userId, здесь упрощённо
  const list = await Questionnaire.find().lean();

  return NextResponse.json(list);
}
