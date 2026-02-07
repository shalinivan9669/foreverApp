// src/app/api/logs/route.ts
import { z } from 'zod';
import { connectToDatabase } from '../../../lib/mongodb';
import { Log } from '../../../models/Log';
import { requireSession } from '@/lib/auth/guards';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';

export async function POST(request: Request) {
  const query = parseQuery(request, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(request);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();

  const entry = await Log.create({ userId, at: new Date() });
  return jsonOk(entry);
}
