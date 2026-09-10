import { domainResponse } from './domainResponse';
import { recordAssessmentOps } from '@/domain/services/assessmentJobs.service';
import { maintainRegisteredAssessments } from '@/domain/services/assessmentRuntime.service';

/** Request metrics contain status class + duration only; no request path, subject or response body. */
export async function assessmentResponse<T>(read: () => Promise<T>): Promise<Response> {
  const started = Date.now(); const response = await domainResponse(read);
  const code = response.ok ? 'HTTP_OK' : response.status === 409 ? 'HTTP_CONFLICT' : response.status === 429 ? 'HTTP_RATE_LIMIT'
    : response.status === 401 || response.status === 403 ? 'HTTP_ACCESS_DENIED' : response.status >= 500 ? 'HTTP_SERVER_ERROR' : 'HTTP_CLIENT_ERROR';
  // A metrics outage must never turn an acknowledged source commit into a failed response.
  await recordAssessmentOps(code, 'ADMISSION', Date.now() - started).catch(() => undefined);
  if (response.ok) await maintainRegisteredAssessments().catch(() => undefined);
  return response;
}
