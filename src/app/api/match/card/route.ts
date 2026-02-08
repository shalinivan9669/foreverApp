import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { toMatchCardDTO } from '@/lib/dto';
import { usersService } from '@/domain/services/users.service';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';

// DTO rule: return only DTO/view model (never raw DB model shape).

type Body = {
  userId?: string; // legacy client field, ignored
  requirements: string[]; // 3
  give: string[];         // 3
  questions: string[];    // 2
  isActive?: boolean;
};

const clamp = (s: string, max: number) => s.trim().slice(0, max);
const sanitize3 = (arr: string[], max: number) =>
  (arr ?? []).slice(0, 3).map((s) => clamp(String(s || ''), max));
const sanitize2 = (arr: string[], max: number) =>
  (arr ?? []).slice(0, 2).map((s) => clamp(String(s || ''), max));

const bodySchema = z
  .object({
    userId: z.string().optional(),
    requirements: z.array(z.string()).length(3),
    give: z.array(z.string()).length(3),
    questions: z.array(z.string()).length(2),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const b = body.data as Body;

  const requirements = sanitize3(b.requirements, 80);
  const give         = sanitize3(b.give, 80);
  const questions    = sanitize2(b.questions, 120);

  if (requirements.length !== 3 || give.length !== 3 || questions.length !== 2 ||
      requirements.some((x) => x.length === 0) ||
      give.some((x) => x.length === 0) ||
      questions.some((x) => x.length === 0)) {
    return jsonError(400, 'MATCH_CARD_INVALID_PAYLOAD', 'invalid payload');
  }

  const auditRequest = auditContextFromRequest(req, '/api/match/card');
  const doc = await usersService.upsertCurrentUserMatchCard({
    currentUserId,
    payload: {
      requirements: [requirements[0], requirements[1], requirements[2]],
      give: [give[0], give[1], give[2]],
      questions: [questions[0], questions[1]],
      isActive: b.isActive ?? true,
    },
    auditRequest,
  });

  return jsonOk(toMatchCardDTO(doc.profile?.matchCard ?? null));
}

export async function GET(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  await connectToDatabase();
  const doc = await User.findOne({ id: currentUserId }, { 'profile.matchCard': 1, _id: 0 }).lean();
  return jsonOk(toMatchCardDTO(doc?.profile?.matchCard ?? null));
}
