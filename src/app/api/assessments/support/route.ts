import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { AssessmentSupportInputSchema } from '@/domain/assessment/admission';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => assessmentAdmissionService.supportList(auth.data.userId));
}
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentSupportInputSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentAdmissionService.support(auth.data.userId, body.data));
}
