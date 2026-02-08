import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '../../../../lib/mongodb';
import { User, UserType } from '../../../../models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams, parseQuery } from '@/lib/api/validate';
import { toUserDTO } from '@/lib/dto';
import { usersService, type UserProfileUpsertPayload } from '@/domain/services/users.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { asError, toDomainError } from '@/domain/errors';

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
  const actorUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const bodyResult = await parseJson(req, userUpdateSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as UserProfileUpsertPayload;
  const auditRequest = auditContextFromRequest(req, `/api/users/${id}`);

  try {
    const doc = await usersService.updateUserProfileById({
      targetUserId: id,
      actorUserId,
      payload: body,
      auditRequest,
    });
    return jsonOk(toUserDTO(doc, { scope: 'public' }));
  } catch (error: unknown) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}
