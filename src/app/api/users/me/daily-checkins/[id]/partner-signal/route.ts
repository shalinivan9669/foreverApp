// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { hashIdempotencySensitiveValue } from '@/lib/idempotency/key';
import { partnerSignalService } from '@/domain/services/partnerSignal.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

const bodySchema = z
  .object({
    text: z.string().trim().min(1).max(300),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  return withIdempotency({
    req,
    route: `/api/users/me/daily-checkins/${params.data.id}/partner-signal`,
    userId: currentUserId,
    requestBody: {
      checkInId: params.data.id,
      textDigest: hashIdempotencySensitiveValue([
        'partner-signal-text-v1',
        body.data.text,
      ]),
    },
    execute: () =>
      partnerSignalService.send({
        currentUserId,
        checkInId: params.data.id,
        text: body.data.text,
        auditRequest: auditContextFromRequest(
          req,
          '/api/users/me/daily-checkins/[id]/partner-signal'
        ),
      }),
  });
}
