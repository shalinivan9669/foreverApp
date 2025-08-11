import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';

type Body = {
  userId: string;
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

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Body;

  if (!b?.userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  const requirements = sanitize3(b.requirements, 80);
  const give         = sanitize3(b.give, 80);
  const questions    = sanitize2(b.questions, 120);

  if (requirements.length !== 3 || give.length !== 3 || questions.length !== 2 ||
      requirements.some((x) => x.length === 0) ||
      give.some((x) => x.length === 0) ||
      questions.some((x) => x.length === 0)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  await connectToDatabase();

  const set = {
    'profile.matchCard': {
      requirements, give, questions,
      isActive: b.isActive ?? true,
      updatedAt: new Date()
    }
  };

  const doc = await User.findOneAndUpdate(
    { id: b.userId },
    { $set: set },
    { new: true, runValidators: true }
  ).lean();

  if (!doc) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  return NextResponse.json(doc.profile?.matchCard ?? null);
}

export async function GET(req: NextRequest) {
  // получить свою карточку: /api/match/card?userId=...
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();
  const doc = await User.findOne({ id: userId }, { 'profile.matchCard': 1, _id: 0 }).lean();
  return NextResponse.json(doc?.profile?.matchCard ?? null);
}
