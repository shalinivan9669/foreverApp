import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import type { JsonValue } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { toUserDTO } from '@/lib/dto';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { usersService } from '@/domain/services/users.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

// DTO rule: return only DTO/view model (never raw DB model shape).

const bodySchema = z.object({}).passthrough();

export async function PATCH(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const bodyResult = await parseJson(req, bodySchema);
  if (!bodyResult.ok) return bodyResult.response;
  const patch = bodyResult.data as Record<string, JsonValue>;
  const auditRequest = auditContextFromRequest(req, '/api/users/me/onboarding');

  return withIdempotency({
    req,
    route: '/api/users/me/onboarding',
    userId,
    requestBody: patch,
    execute: async () => {
      const doc = await usersService.updateCurrentUserOnboarding({
        currentUserId: userId,
        patch,
        auditRequest,
      });

      return toUserDTO(doc, {
        scope: 'private',
        includeOnboarding: true,
        includeMatchCard: true,
        includeLocation: true,
      });
    },
  });
}
