// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Question, type QuestionType } from '@/models/Question';
import { User, type UserType } from '@/models/User';
import { buildVectorUpdate, type VectorQuestion } from '@/utils/vectorUpdates';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';

type Body = {
  userId?: string; // legacy client field, ignored
  answers: { qid: string; ui: number }[];
};

const bodySchema = z
  .object({
    userId: z.string().optional(),
    answers: z
      .array(
        z.object({
          qid: z.string().min(1),
          ui: z.number(),
        })
      )
      .min(1),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const { answers } = body.data as Body;

  await connectToDatabase();

  const qids = answers.map((answer) => answer.qid);
  const qs = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();

  const qMap: Record<string, QuestionType> = {};
  for (const q of qs) {
    qMap[String(q._id)] = q;
  }

  const doc = await User.findOne({ id: userId }).lean<UserType | null>();
  if (!doc) return jsonError(404, 'USER_NOT_FOUND', 'no user');

  const { setLevels, addToSet } = buildVectorUpdate(
    doc,
    answers,
    qMap as Record<string, VectorQuestion>
  );

  type Update = {
    $set: Record<string, number>;
    $addToSet?: Record<string, { $each: string[] }>;
  };

  const update: Update = { $set: setLevels };
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  await User.updateOne({ id: userId }, update);
  return jsonOk({});
}

