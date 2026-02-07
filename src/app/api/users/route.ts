// src/app/api/users/route.ts
import { z } from 'zod';
import { connectToDatabase } from '../../../lib/mongodb';
import { User, UserType }    from '../../../models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { toUserDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

const userUpdateSchema = z
  .object({
    username: z.string().optional(),
    avatar: z.string().optional(),
    personal: z.object({}).passthrough().optional(),
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

  const bodyResult = await parseJson(request, userUpdateSchema);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Partial<UserType>;
  await connectToDatabase();

  const updateFields: Record<string, unknown> = {
    username: body.username,
    avatar: body.avatar,
  };
  if (body.personal) updateFields.personal = body.personal;
  if (body.vectors) updateFields.vectors = body.vectors;
  if (body.preferences) updateFields.preferences = body.preferences;
  if (body.embeddings) updateFields.embeddings = body.embeddings;
  if (body.location) updateFields.location = body.location;

  const doc = await User.findOneAndUpdate(
    { id: currentUserId },
    {
      $set: updateFields,
      $setOnInsert: { id: currentUserId },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean<UserType>();

  return jsonOk(
    toUserDTO(doc, {
      scope: 'private',
      includeOnboarding: true,
      includeMatchCard: true,
      includeLocation: true,
    })
  );
}
