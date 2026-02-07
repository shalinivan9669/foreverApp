// src/app/api/activity-templates/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { ActivityTemplate } from '@/models/ActivityTemplate';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';

const querySchema = z
  .object({
    axis: z.string().optional(),
    intent: z.string().optional(),
    difficulty: z.coerce.number().int().min(1).max(3).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  await connectToDatabase();

  const { axis, intent, difficulty, limit } = query.data;

  const q: Record<string, unknown> = {};
  if (axis) q.axis = axis;
  if (intent) q.intent = intent;
  if (difficulty) q.difficulty = difficulty;

  const list = await ActivityTemplate.find(q)
    .sort({ updatedAt: -1 })
    .limit(limit ?? 50)
    .lean();
  return jsonOk(list);
}
