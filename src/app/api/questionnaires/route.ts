import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';

/** GET /api/questionnaires – список всех анкет */
export async function GET() {
  await connectToDatabase();

  const list = await Questionnaire.find().lean();
  return NextResponse.json(list);
}

/* 👇 делает файл явным ES-модулем; TypeScript перестаёт жаловаться */
export {};
