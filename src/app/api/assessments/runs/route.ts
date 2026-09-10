import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson, parseQuery } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { AssessmentMutationSchema } from '@/lib/dto/assessment.dto';
import { assessmentRunsService } from '@/domain/services/assessmentRuns.service';

const querySchema = z.object({ publicationId: z.string().min(1).max(160), view: z.literal('controls').optional() }).strict();
export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  return domainResponse(() => query.data.view === 'controls'
    ? assessmentRunsService.getControls(auth.data.userId, query.data.publicationId)
    : assessmentRunsService.get(auth.data.userId, query.data.publicationId));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentRunsService.mutate(auth.data.userId, body.data));
}
