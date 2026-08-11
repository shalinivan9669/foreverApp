import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { usersService, type UserProfileUpsertPayload } from '@/domain/services/users.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

// DTO rule: return only DTO/view model (never raw DB model shape).

const userUpdateSchema = z
  .object({
    personal: z.object({}).passthrough().optional(),
    preferences: z.object({}).passthrough().optional(),
    location: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([
          z.number().min(-180).max(180),
          z.number().min(-90).max(90),
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const userDto = await usersService.getCurrentUserProfile(userId);
  if (!userDto) return jsonError(404, 'USER_NOT_FOUND', 'user not found');
  return jsonOk(userDto);
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const bodyResult = await parseJson(req, userUpdateSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as UserProfileUpsertPayload;
  const auditRequest = auditContextFromRequest(req, '/api/users/me');
  const userDto = await usersService.updateCurrentUserProfile({
    currentUserId: userId,
    payload: body,
    auditRequest,
  });

  return jsonOk(userDto);
}
