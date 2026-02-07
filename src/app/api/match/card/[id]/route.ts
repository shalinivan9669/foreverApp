// src/app/api/match/card/[id]/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';
import { toMatchCardDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

type CardDTO =
  | { requirements: [string, string, string]; questions: [string, string] }
  | null;

interface Ctx {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  await connectToDatabase();

  const u = await User.findOne({ id })
    .select({
      'profile.matchCard.isActive': 1,
      'profile.matchCard.requirements': 1,
      'profile.matchCard.questions': 1,
      _id: 0,
    })
    .lean();

  if (!u || !u.profile?.matchCard?.isActive) {
    return jsonError(404, 'MATCH_CARD_NOT_FOUND', 'no active match card');
  }

  const card = toMatchCardDTO(u.profile.matchCard);
  const dto: CardDTO = card ? { requirements: card.requirements, questions: card.questions } : null;

  if (!dto) return jsonError(500, 'MATCH_CARD_INVALID', 'bad card');

  return jsonOk(dto);
}
