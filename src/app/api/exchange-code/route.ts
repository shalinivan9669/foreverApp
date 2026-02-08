// DTO rule: return only DTO/view model (never raw DB model shape).
import { z } from 'zod';
import { signJwt } from '@/lib/jwt';
import { jsonError, jsonOk, type JsonValue } from '@/lib/api/response';
import { parseJson } from '@/lib/api/validate';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';
import { auditContextFromRequest, emitEvent } from '@/lib/audit/emitEvent';

const bodySchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().min(1),
});

const isJsonObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(req: Request) {
  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.exchangeCode,
    routeForAudit: '/api/exchange-code',
  });
  if (!rate.ok) return rate.response;

  const auditRequest = auditContextFromRequest(req, '/api/exchange-code');
  const recordAuthFailure = async (reason: string, status?: number): Promise<void> => {
    await emitEvent({
      event: 'SECURITY_AUTH_FAILED',
      actor: { userId: 'anonymous' },
      request: auditRequest,
      target: {
        type: 'system',
        id: 'discord-oauth',
      },
      metadata: {
        reason,
        status,
      },
    });
  };

  const body = await parseJson(req, bodySchema);
  if (!body.ok) {
    await recordAuthFailure('invalid_exchange_payload', 400);
    return body.response;
  }
  const { code, redirect_uri } = body.data;

  const params = new URLSearchParams({
    client_id:     process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
    client_secret: process.env.DISCORD_CLIENT_SECRET!,
    grant_type:    'authorization_code',
    code,
    redirect_uri
  });

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params
  });

  const data = (await tokenRes.json()) as JsonValue;
  if (!tokenRes.ok) {
    await recordAuthFailure('oauth_exchange_failed', tokenRes.status);
    return jsonError(
      tokenRes.status,
      'OAUTH_EXCHANGE_FAILED',
      'Discord OAuth token exchange failed',
      data
    );
  }

  const accessToken =
    isJsonObject(data) && typeof data.access_token === 'string'
      ? data.access_token
      : undefined;
  if (!accessToken) {
    await recordAuthFailure('access_token_missing', 500);
    return jsonError(500, 'ACCESS_TOKEN_MISSING', 'missing access_token');
  }

  // Fetch Discord user once, then issue our own session JWT
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = (await userRes.json()) as JsonValue;
  if (!userRes.ok) {
    await recordAuthFailure('discord_user_lookup_failed', userRes.status);
    return jsonError(
      502,
      'DISCORD_USER_LOOKUP_FAILED',
      'discord user lookup failed',
      userData
    );
  }

  const userId =
    isJsonObject(userData) && typeof userData.id === 'string'
      ? userData.id
      : undefined;
  if (!userId) {
    await recordAuthFailure('discord_user_id_missing', 502);
    return jsonError(502, 'DISCORD_USER_ID_MISSING', 'missing discord user id');
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    await recordAuthFailure('jwt_secret_missing', 500);
    return jsonError(500, 'JWT_SECRET_NOT_SET', 'JWT_SECRET not set');
  }

  const token = signJwt(userId, secret, 60 * 60 * 24 * 7); // 7 days
  const res = jsonOk({ access_token: accessToken });
  const isProd = process.env.NODE_ENV === 'production';
  res.cookies.set({
    name: 'session',
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

