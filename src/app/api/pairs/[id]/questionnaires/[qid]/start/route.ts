// POST /api/pairs/[id]/questionnaires/[qid]/start
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User, type UserType } from '@/models/User';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string; qid: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
  qid: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id, qid } = params.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;
  const pair = pairGuard.data.pair;

  // Resolve user ObjectIds for members
  const users = await User.find({ id: { $in: pair.members } }).lean<(UserType & { _id: Types.ObjectId })[]>();
  if (users.length !== 2) return jsonError(404, 'PAIR_MEMBERS_MISSING', 'members missing');

  // Keep order consistent with pair.members
  const mA = users.find(u => u.id === pair.members[0])!._id;
  const mB = users.find(u => u.id === pair.members[1])!._id;
  const members: [Types.ObjectId, Types.ObjectId] = [mA, mB];

  // Reuse in-progress session if exists
  const existing = await PairQuestionnaireSession.findOne({
    pairId: new Types.ObjectId(id),
    questionnaireId: qid,
    status: 'in_progress',
  }).lean();
  if (existing) {
    return jsonOk({ sessionId: String(existing._id), status: existing.status, startedAt: existing.startedAt });
  }

  const sess = await PairQuestionnaireSession.create({
    pairId: new Types.ObjectId(id),
    questionnaireId: qid,
    members,
    startedAt: new Date(),
    status: 'in_progress',
  });

  return jsonOk({ sessionId: String(sess._id), status: 'in_progress', startedAt: sess.startedAt });
}

