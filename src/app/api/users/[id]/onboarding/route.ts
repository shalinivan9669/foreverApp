import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '../../../../../lib/mongodb';
import { User, UserType } from '../../../../../models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z.object({}).passthrough();

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  await connectToDatabase();

  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    set[`profile.onboarding.${k}`] = v;
  }

  const doc = await User.findOneAndUpdate(
    { id }, { $set: set }, { new: true, runValidators: true }
  ).lean<UserType | null>();

  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(doc);
}
