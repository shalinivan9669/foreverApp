import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { BetaDirectMutationSchema } from '@/lib/dto/assessmentBeta.dto';
import { betaDirectService } from '@/domain/services/assessmentDirect.service';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => betaDirectService.get(auth.data.userId, req.nextUrl.searchParams.get('view') === 'controls'));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, BetaDirectMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => betaDirectService.mutate(auth.data.userId, body.data));
}
