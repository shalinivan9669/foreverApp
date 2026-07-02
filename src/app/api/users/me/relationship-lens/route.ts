// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { updateRelationshipLens } from '@/domain/services/relationshipLens.service';

const bodySchema = z
  .object({
    defaultLens: z.enum(['feminine', 'masculine', 'balanced', 'custom']).optional(),
    preferredSupportStyle: z
      .enum(['listen', 'solve', 'hug', 'space', 'practical_help', 'soft_presence'])
      .optional(),
    conflictPattern: z
      .enum(['withdraw', 'argue', 'freeze', 'explain', 'please', 'avoid'])
      .optional(),
    privacyDefaults: z
      .object({
        dailyStatePrivate: z.boolean().optional(),
        journalPrivate: z.boolean().optional(),
        bodyContextPrivate: z.boolean().optional(),
        partnerSignalsEnabled: z.boolean().optional(),
        pairMapContributionEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function PATCH(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  return withIdempotency({
    req,
    route: '/api/users/me/relationship-lens',
    userId: currentUserId,
    requestBody: body.data,
    execute: async () => ({
      lens: await updateRelationshipLens({
        currentUserId,
        patch: body.data,
      }),
    }),
  });
}
