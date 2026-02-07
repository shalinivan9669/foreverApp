import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '../../../../lib/mongodb';
import { User, UserType } from '../../../../models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams, parseQuery } from '@/lib/api/validate';
import { toUserDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

interface RouteContext {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const userUpdateSchema = z
  .object({
    personal: z.object({}).passthrough().optional(),
    vectors: z.object({}).passthrough().optional(),
    preferences: z.object({}).passthrough().optional(),
    embeddings: z.object({}).passthrough().optional(),
    location: z.object({}).passthrough().optional(),
  })
  .strict();

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const query = parseQuery(_req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(_req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  await connectToDatabase();
  const doc = await User.findOne({ id }).lean<UserType | null>();
  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(toUserDTO(doc, { scope: 'public' }));
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const bodyResult = await parseJson(req, userUpdateSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Partial<UserType>;

  await connectToDatabase();
  const update: Record<string, unknown> = {};
  if (body.personal) update.personal = body.personal;
  if (body.vectors) update.vectors = body.vectors;
  if (body.preferences) update.preferences = body.preferences;
  if (body.embeddings) update.embeddings = body.embeddings;
  if (body.location) update.location = body.location;
  const doc = await User.findOneAndUpdate(
    { id },
    update,
    { new: true, runValidators: true }
  ).lean<UserType | null>();
  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(toUserDTO(doc, { scope: 'public' }));
}
