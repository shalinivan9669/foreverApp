import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { BetaComparisonMutationSchema } from '@/lib/dto/assessmentBeta.dto';
import { betaComparisonService } from '@/domain/services/assessmentBetaComparison.service';

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, BetaComparisonMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => betaComparisonService.calculate(auth.data.userId, body.data));
}
