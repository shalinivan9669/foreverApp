// POST /api/pairs/[id]/questionnaires/[qid]/answer
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';

interface Ctx { params: Promise<{ id: string; qid: string }> }

type Body = {
  sessionId?: string;
  questionId: string;
  ui: number;
  by: 'A' | 'B';
};

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, qid } = await ctx.params;
  if (!id || !qid) return NextResponse.json({ error: 'missing id/qid' }, { status: 400 });

  const { sessionId, questionId, ui, by } = (await req.json()) as Body;
  if (!questionId || typeof ui !== 'number' || (by !== 'A' && by !== 'B')) {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }

  await connectToDatabase();

  const pair = await Pair.findById(id).lean();
  if (!pair) return NextResponse.json({ error: 'pair not found' }, { status: 404 });

  // Find or ensure session exists and in progress
  const sess = sessionId
    ? await PairQuestionnaireSession.findOne({ _id: new Types.ObjectId(sessionId), pairId: new Types.ObjectId(id), questionnaireId: qid }).lean()
    : await PairQuestionnaireSession.findOne({ pairId: new Types.ObjectId(id), questionnaireId: qid, status: 'in_progress' }).sort({ createdAt: -1 }).lean();

  if (!sess) return NextResponse.json({ error: 'no active session' }, { status: 404 });

  await PairQuestionnaireAnswer.create({
    sessionId: new Types.ObjectId(sess._id),
    pairId: new Types.ObjectId(id),
    questionnaireId: qid,
    questionId,
    by,
    ui,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}

