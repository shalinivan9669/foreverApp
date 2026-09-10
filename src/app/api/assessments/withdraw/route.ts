import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { assessmentResponse as domainResponse } from '@/lib/api/assessmentResponse';
import { AssessmentWithdrawSchema } from '@/domain/assessment/admission';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, AssessmentWithdrawSchema);
  if (!body.ok) return body.response;
  return domainResponse(() => assessmentAdmissionService.withdraw(auth.data.userId, body.data));
}
