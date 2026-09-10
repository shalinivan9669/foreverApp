import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { parseJson } from '@/lib/api/validate';
import { AssessmentPairMutationSchema } from '@/lib/dto/assessmentPair.dto';
import { assessmentPairService } from '@/domain/services/assessmentPair.service';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => req.nextUrl.searchParams.get('view') === 'controls'
    ? assessmentPairService.getControls(auth.data.userId, req.nextUrl.searchParams.get('pairId') ?? undefined)
    : assessmentPairService.get(auth.data.userId));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentPairMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentPairService.mutate(auth.data.userId, body.data));
}
