import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { User } from '@/models/User';
import { api } from '@/utils/api'; // не нужен тут, но пусть будет единообразие

type Body = {
  likeId: string;
  userId: string;          // получатель (toId)
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
};

const clamp = (s: string, max: number) => String(s ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  const { likeId, userId, agreements, answers } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });
  if (!Array.isArray(agreements) || agreements.length !== 3 || agreements.some(x => x !== true)) {
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  }
  if (!Array.isArray(answers) || answers.length !== 2) {
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });
  }

  await connectToDatabase();
  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (like.toId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!['sent', 'viewed'].includes(like.status)) {
    return NextResponse.json({ error: `invalid status ${like.status}` }, { status: 400 });
  }

  // тянем карточку инициатора (fromId)
  const initiator = await User.findOne({ id: like.fromId }).lean();
  const mc = initiator?.profile?.matchCard;
  if (!mc?.isActive || mc.requirements?.length !== 3 || mc.questions?.length !== 2) {
    return NextResponse.json({ error: 'initiator has no active match card' }, { status: 400 });
  }

  const payload = {
    agreements: [true, true, true] as [boolean, boolean, boolean],
    answers: [clamp(answers[0], 280), clamp(answers[1], 280)] as [string, string],
    initiatorCardSnapshot: {
      requirements: [
        clamp(mc.requirements[0], 80),
        clamp(mc.requirements[1], 80),
        clamp(mc.requirements[2], 80),
      ] as [string, string, string],
      questions: [
        clamp(mc.questions[0], 120),
        clamp(mc.questions[1], 120),
      ] as [string, string],
      updatedAt: mc.updatedAt,
    },
    at: new Date(),
  };

  await Like.updateOne(
    { _id: like._id, toId: userId },
    { $set: { recipientResponse: payload, status: 'awaiting_initiator', updatedAt: new Date() } }
  );

  return NextResponse.json({ ok: true });
}
