import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
import type { QuestionnaireType } from '@/models/Questionnaire';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { toQuestionnaireDTO } from '@/lib/dto';

// DTO rule: return only DTO/view model (never raw DB model shape).

const querySchema = z
  .object({
    target: z.enum(['couple', 'individual']).optional(),
  })
  .passthrough();

// GET /api/questionnaires?target=couple|individual
export async function GET(req: NextRequest) {
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;

  await connectToDatabase();
  const { target } = query.data;

  const q: Record<string, unknown> = {};
  if (target) q['target.type'] = target;

  const list = await Questionnaire.find(q).lean<QuestionnaireType[]>();
  return jsonOk(list.map((item) => toQuestionnaireDTO(item)));
}
