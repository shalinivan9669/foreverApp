import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { AssessmentComparisonMutationSchema } from '@/lib/dto/assessmentComparison.dto';
import { assessmentComparisonService } from '@/domain/services/assessmentComparison.service';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => req.nextUrl.searchParams.get('view') === 'controls'
    ? assessmentComparisonService.controls(auth.data.userId)
    : assessmentComparisonService.get(auth.data.userId));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentComparisonMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentComparisonService.mutate(auth.data.userId, body.data));
}
