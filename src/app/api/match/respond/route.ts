import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { User } from '@/models/User';

type Body = {
  likeId: string;
  userId: string; // toId
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
};

const clamp = (s: string, max: number) => String(s ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  const { likeId, userId, agreements, answers } = (await req.json()) as Body;
  if (!likeId || !userId) return NextResponse.json({ error: 'bad body' }, { status: 400 });
  if (agreements?.length !== 3 || agreements.some(x => x !== true))
    return NextResponse.json({ error: 'agreements must be [true,true,true]' }, { status: 400 });
  if (answers?.length !== 2)
    return NextResponse.json({ error: 'answers must have length 2' }, { status: 400 });

  await connectToDatabase();
  const like = await Like.findById(likeId);
  if (!like) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (like.toId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!['sent', 'viewed'].includes(like.status))
    return NextResponse.json({ error: `invalid status ${like.status}` }, { status: 400 });

  const initiator = await User.findOne({ id: like.fromId }).lean();
  const mc = initiator?.profile?.matchCard;
  if (!mc?.isActive || mc.requirements?.length !== 3 || mc.questions?.length !== 2)
    return NextResponse.json({ error: 'initiator has no active match card' }, { status: 400 });

  const now = new Date();

  await Like.updateOne(
    { _id: like._id, toId: userId },
    {
      $set: {
        recipientResponse: {
          agreements: [true, true, true],
          answers: [clamp(answers[0], 280), clamp(answers[1], 280)],
          initiatorCardSnapshot: {
            requirements: [
              clamp(mc.requirements[0], 80),
              clamp(mc.requirements[1], 80),
              clamp(mc.requirements[2], 80),
            ],
            questions: [clamp(mc.questions[0], 120), clamp(mc.questions[1], 120)],
            updatedAt: mc.updatedAt,
          },
          at: now,
        },
        recipientDecision: { accepted: true, at: now },
        status: 'awaiting_initiator',
        updatedAt: now,
      },
    }
  );

  return NextResponse.json({ ok: true });
}
