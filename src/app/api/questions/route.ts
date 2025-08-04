import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase }         from '@/lib/mongodb';
import { Question }                  from '@/models/Question';
import type { QuestionType }         from '@/models/Question';
import type { PipelineStage }        from 'mongoose';   // ← правильный импорт

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const axis  = searchParams.get('axis');
  const limit = Number(searchParams.get('limit') ?? '10');

  await connectToDatabase();

  /* ────── строим пайплайн ────── */
  const pipeline: PipelineStage[] = [];

  if (axis) {
    pipeline.push({
      $match: { axis }
    } as PipelineStage);
  }

  pipeline.push({
    $sample: { size: limit }
  } as PipelineStage);

  /* ────── выполняем aggregate ─── */
  const docs = await Question.aggregate<QuestionType>(pipeline);
  return NextResponse.json(docs);
}
