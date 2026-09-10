import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { AssessmentPortfolioMutationSchema } from '@/domain/assessment/planner';
import { assessmentPortfolioService } from '@/domain/assessment/portfolio';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => assessmentPortfolioService.get(auth.data.userId));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentPortfolioMutationSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentPortfolioService.mutate(auth.data.userId, body.data));
}
