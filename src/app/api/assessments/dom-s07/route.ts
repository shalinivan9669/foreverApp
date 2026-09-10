import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { AssessmentMutationSchema } from '@/lib/dto/assessment.dto';
import { assessmentRunsService } from '@/domain/services/assessmentRuns.service';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => req.nextUrl.searchParams.get('view') === 'controls'
    ? assessmentRunsService.getControls(auth.data.userId) : assessmentRunsService.get(auth.data.userId));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentRunsService.mutate(auth.data.userId, body.data));
}
