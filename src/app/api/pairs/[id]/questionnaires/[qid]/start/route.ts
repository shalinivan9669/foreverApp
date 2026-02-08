// DTO rule: return only DTO/view model (never raw DB model shape).
// POST /api/pairs/[id]/questionnaires/[qid]/start
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Ctx {
  params: Promise<{ id: string; qid: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
  qid: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  const { id, qid } = params.data;
  const auditRequest = auditContextFromRequest(
    req,
    `/api/pairs/${id}/questionnaires/${qid}/start`
  );

  return withIdempotency({
    req,
    route: `/api/pairs/${id}/questionnaires/${qid}/start`,
    userId: currentUserId,
    requestBody: {
      pairId: id,
      questionnaireId: qid,
    },
    execute: () =>
      questionnairesService.startPairQuestionnaire({
        pairId: id,
        questionnaireId: qid,
        currentUserId,
        auditRequest,
      }),
  });
}
