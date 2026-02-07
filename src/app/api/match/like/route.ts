// DTO rule: return only DTO/view model (never raw DB model shape).
// src/app/api/match/like/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

export const runtime = 'nodejs';

type Body = {
  userId?: string;              // legacy client field, ignored
  fromId?: string;              // legacy client field, ignored
  toId?: string;                // РїРѕР»СѓС‡Р°С‚РµР»СЊ
  agreements?: boolean[];       // [true,true,true]
  answers?: string[];           // [string,string]
};

const bodySchema = z
  .object({
    userId: z.string().optional(),
    fromId: z.string().optional(),
    toId: z.string().min(1),
    agreements: z.tuple([z.literal(true), z.literal(true), z.literal(true)]),
    answers: z.tuple([z.string(), z.string()]),
  })
  .strict();

const clamp = (s: string | null | undefined, max: number) =>
  String(s ?? '').trim().slice(0, max);

function buildInitiatorSnapshot(u: UserType | null): LikeType['fromCardSnapshot'] | undefined {
  const c = u?.profile?.matchCard;
  if (!c?.isActive) return undefined;
  if (!c.requirements?.length || !c.questions?.length) return undefined;
  return {
    requirements: [
      clamp(c.requirements[0], 80),
      clamp(c.requirements[1], 80),
      clamp(c.requirements[2], 80),
    ] as [string, string, string],
    questions: [
      clamp(c.questions[0], 120),
      clamp(c.questions[1], 120),
    ] as [string, string],
    updatedAt: c.updatedAt,
  };
}

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const fromId = auth.data.userId;

  const parsedBody = await parseJson(req, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  const body: Body = parsedBody.data;
  const toId = body.toId ?? '';

  await connectToDatabase();

  // СЃРЅРёРјРѕРє РєР°СЂС‚РѕС‡РєРё РёРЅРёС†РёР°С‚РѕСЂР°
  const initiator = await User.findOne({ id: fromId }).lean<UserType | null>();
  const fromCardSnapshot = buildInitiatorSnapshot(initiator);
  if (!fromCardSnapshot) {
    return jsonError(400, 'INITIATOR_CARD_SNAPSHOT_MISSING', 'initiator card snapshot missing');
  }

  // Р±Р°Р·РѕРІС‹Р№ СЃРєРѕСЂ, РїСЂРё Р¶РµР»Р°РЅРёРё РїРѕРґСЃС‚Р°РІРёС€СЊ СЃРІРѕСЋ С„РѕСЂРјСѓР»Сѓ
  const matchScore = Math.max(0, Math.min(100, 75));

  const like = await Like.create({
    fromId,
    toId,
    matchScore,
    fromCardSnapshot,
    status: 'sent',
  });

  return jsonOk({ id: String(like._id), matchScore });
}

