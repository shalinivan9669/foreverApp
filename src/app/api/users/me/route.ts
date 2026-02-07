import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

const userUpdateSchema = z
  .object({
    personal: z.object({}).passthrough().optional(),
    vectors: z.object({}).passthrough().optional(),
    preferences: z.object({}).passthrough().optional(),
    embeddings: z.object({}).passthrough().optional(),
    location: z.object({}).passthrough().optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();
  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(doc);
}

export async function PUT(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const bodyResult = await parseJson(req, userUpdateSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (body.personal) update.personal = body.personal;
  if (body.vectors) update.vectors = body.vectors;
  if (body.preferences) update.preferences = body.preferences;
  if (body.embeddings) update.embeddings = body.embeddings;
  if (body.location) update.location = body.location;

  const doc = await User.findOneAndUpdate(
    { id: userId },
    update,
    { new: true, runValidators: true }
  ).lean<UserType | null>();

  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(doc);
}
