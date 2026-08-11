import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseParams } from '@/lib/api/validate';
import { pairEventService } from '@/domain/services/pairEvent.service';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';

interface Ctx {
  params: Promise<{ id: string; eventId: string; action: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  action: z.enum(['accept', 'decline', 'snooze']),
});

const snoozeSchema = z.object({
  days: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;

  const body =
    params.data.action === 'snooze'
      ? await parseJson(req, snoozeSchema)
      : { ok: true as const, data: {} };
  if (!body.ok) return body.response;

  const route = `/api/pairs/${params.data.id}/events/${params.data.eventId}/${params.data.action}`;
  return withIdempotency({
    req,
    route,
    userId: auth.data.userId,
    requestBody: params.data.action === 'snooze' ? body.data : {},
    execute: async () => {
      if (params.data.action === 'accept') {
        return pairEventService.acceptEvent({
          pairId: params.data.id,
          eventId: params.data.eventId,
          currentUserId: auth.data.userId,
        });
      }
      if (params.data.action === 'decline') {
        return pairEventService.declineEvent({
          pairId: params.data.id,
          eventId: params.data.eventId,
          currentUserId: auth.data.userId,
        });
      }
      return pairEventService.snoozeEvent({
        pairId: params.data.id,
        eventId: params.data.eventId,
        currentUserId: auth.data.userId,
        days: body.data.days,
      });
    },
  });
}
