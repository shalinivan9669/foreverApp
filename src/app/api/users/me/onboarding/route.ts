import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

const bodySchema = z.object({}).passthrough();

export async function PATCH(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  await connectToDatabase();

  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    set[`profile.onboarding.${k}`] = v;
  }

  const doc = await User.findOneAndUpdate(
    { id: userId },
    { $set: set },
    { new: true, runValidators: true }
  ).lean<UserType | null>();

  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(doc);
}
