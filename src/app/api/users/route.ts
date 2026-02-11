// src/app/api/users/route.ts
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { toUserDTO } from '@/lib/dto';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { usersService, type UserProfileUpsertPayload } from '@/domain/services/users.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { normalizeDiscordAvatar } from '@/lib/discord/avatar';

// DTO rule: return only DTO/view model (never raw DB model shape).

const personalSchema = z
  .object({
    gender: z.enum(['male', 'female']).optional(),
    age: z.number().optional(),
    city: z.string().optional(),
    relationshipStatus: z.enum(['seeking', 'in_relationship']).optional(),
  })
  .passthrough();

const userUpdateSchema = z
  .object({
    username: z.string().optional(),
    avatar: z.string().min(1).nullable().optional(),
    personal: personalSchema.optional(),
    vectors: z.object({}).passthrough().optional(),
    preferences: z.object({}).passthrough().optional(),
    embeddings: z.object({}).passthrough().optional(),
    location: z.object({}).passthrough().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const auth = requireSession(request);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const rate = await enforceRateLimit({
    req: request,
    policy: RATE_LIMIT_POLICIES.usersCreate,
    userId: currentUserId,
    routeForAudit: '/api/users',
  });
  if (!rate.ok) return rate.response;

  const bodyResult = await parseJson(request, userUpdateSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const rawBody = bodyResult.data as UserProfileUpsertPayload & { avatar?: string | null };
  const body: UserProfileUpsertPayload = {
    ...rawBody,
    ...(rawBody.avatar !== undefined
      ? { avatar: normalizeDiscordAvatar(rawBody.avatar) }
      : {}),
  };
  const auditRequest = auditContextFromRequest(request, '/api/users');

  return withIdempotency({
    req: request,
    route: '/api/users',
    userId: currentUserId,
    requestBody: body,
    execute: async () => {
      const doc = await usersService.upsertCurrentUserProfile({
        currentUserId,
        payload: body,
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
