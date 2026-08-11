// DTO rule: return only DTO/view model (never raw DB model shape).
import { z } from 'zod';
import { discordOAuthService } from '@/domain/services/discordOAuth.service';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { requireTrustedUnsafeRequest } from '@/lib/auth/requestSafety';
import { auditContextFromRequest } from '@/lib/audit/emitEvent';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';

const bodySchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().min(1),
});

const isSecureRequest = (req: Request): boolean => {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  let requestProtocol: string | null = null;
  try {
    requestProtocol = new URL(req.url).protocol;
  } catch {
    requestProtocol = null;
  }
  return (
    process.env.NODE_ENV === 'production' ||
    forwardedProto === 'https' ||
    requestProtocol === 'https:'
  );
};

export async function POST(req: Request) {
  const requestSafety = requireTrustedUnsafeRequest(req, {
    protectWithoutSessionCookie: true,
  });
  if (!requestSafety.ok) return requestSafety.response;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.exchangeCode,
    routeForAudit: '/api/exchange-code',
  });
  if (!rate.ok) return rate.response;

  const auditRequest = auditContextFromRequest(req, '/api/exchange-code');
  const body = await parseJson(req, bodySchema);
  if (!body.ok) {
    await discordOAuthService.recordFailure({
      reason: 'invalid_exchange_payload',
      status: 400,
      auditRequest,
    });
    return body.response;
  }

  const result = await discordOAuthService.exchangeCode({
    code: body.data.code,
    redirectUri: body.data.redirect_uri,
    auditRequest,
  });
  if (!result.ok) {
    return jsonError(
      result.status,
      result.code,
      result.message,
      result.details
    );
  }

  const response = jsonOk({
    access_token: result.data.accessToken,
    session_token: result.data.embeddedSessionToken,
    user: result.data.user,
  });
  const secure = isSecureRequest(req);
  response.cookies.set({
    name: 'session',
    value: result.data.cookieToken,
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  recordProductAnalyticsEvent({
    name: 'auth_completed',
    technicalScope: 'auth',
  });
  return response;
}
