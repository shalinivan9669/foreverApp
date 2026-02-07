import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Question } from '@/models/Question';
import type { QuestionType } from '@/models/Question';
import type { PipelineStage } from 'mongoose';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';

const querySchema = z
  .object({
    axis: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  const axis = query.data.axis;
  const limit = query.data.limit ?? 10;

  await connectToDatabase();

  const pipeline: PipelineStage[] = [];
  if (axis) {
    pipeline.push({ $match: { axis } } as PipelineStage);
  }
  pipeline.push({ $sample: { size: limit } } as PipelineStage);

  const docs = await Question.aggregate<QuestionType>(pipeline);
  return jsonOk(docs);
}
