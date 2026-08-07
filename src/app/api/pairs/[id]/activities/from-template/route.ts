// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { asError, toDomainError } from '@/domain/errors';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z
  .object({
    templateId: z.string().min(1),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const data = await recommendationWorkflowService.fromTemplateCompatibility({
      pairId: params.data.id,
      templateId: body.data.templateId,
      currentUserId: auth.data.userId,
      auditRequest: auditContextFromRequest(
        req,
        `/api/pairs/${params.data.id}/activities/from-template`
      ),
    });
    return jsonOk(data);
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
