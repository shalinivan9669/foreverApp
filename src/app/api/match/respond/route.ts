// src/app/api/match/respond/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType, type LikeStatus } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';

type Body = {
  userId?: string;            // legacy client field, ignored
  likeId?: string;            // ObjectId лайка
  agreements?: boolean[];     // [true,true,true]
  answers?: string[];         // [string,string]
};

/* utils */
const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
const isObjId = (s?: string) => !!s && mongoose.Types.ObjectId.isValid(s);
const clamp = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);

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

/* handler */
export async function POST(req: NextRequest) {
  try {
    const auth = requireSession(req);
    if (!auth.ok) return auth.response;
    const currentUserId = auth.data.userId;

    const body = (await req.json().catch(() => ({}))) as Body;
    const likeId = body.likeId ?? req.nextUrl.searchParams.get('id') ?? '';

    if (!likeId) return json({ error: 'missing id' }, 400);
    if (!isObjId(likeId)) return json({ error: 'invalid likeId' }, 400);
    if (!Array.isArray(body.agreements) || body.agreements.length !== 3 || body.agreements.some(v => v !== true)) {
      return json({ error: 'agreements must be [true,true,true]' }, 400);
    }
    if (!Array.isArray(body.answers) || body.answers.length !== 2) {
      return json({ error: 'answers must have length 2' }, 400);
    }

    await connectToDatabase();

    // читаем лайк для проверки и сборки снапшота
    const like = await Like.findById(likeId).lean<LikeType | null>();
    if (!like) return json({ error: 'like not found' }, 404);
    if (like.toId !== currentUserId) return json({ error: 'forbidden' }, 403);

    const allowed: LikeStatus[] = ['sent', 'viewed'];
    if (!allowed.includes(like.status)) return json({ error: 'invalid state' }, 409);

    const initiator = await User.findOne({ id: like.fromId }).lean<UserType | null>();
    const initiatorCardSnapshot =
      buildInitiatorSnapshot(initiator) ?? like.fromCardSnapshot;
    if (!initiatorCardSnapshot) return json({ error: 'initiator card snapshot missing' }, 400);

    // атомарное обновление
    const updated = await Like.findOneAndUpdate(
      { _id: likeId, toId: currentUserId, status: { $in: allowed } },
      {
        $set: {
          recipientResponse: {
            agreements: [true, true, true] as [boolean, boolean, boolean],
            answers: [
              clamp(body.answers[0]!, 280),
              clamp(body.answers[1]!, 280),
            ] as [string, string],
            initiatorCardSnapshot,
            at: new Date(),
          },
          status: 'awaiting_initiator' as LikeStatus,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) return json({ error: 'invalid state' }, 409);
    return json({ ok: true, status: updated.status });
  } catch {
    return json({ error: 'internal' }, 500);
  }
}
