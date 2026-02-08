import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk, type JsonValue } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { toUserDTO } from '@/lib/dto';
import { usersService } from '@/domain/services/users.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { asError, toDomainError } from '@/domain/errors';

// DTO rule: return only DTO/view model (never raw DB model shape).

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
  const actorUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const patch = bodyResult.data as Record<string, JsonValue>;
  const auditRequest = auditContextFromRequest(req, `/api/users/${id}/onboarding`);

  try {
    const doc = await usersService.updateUserOnboardingById({
      targetUserId: id,
      actorUserId,
      patch,
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
