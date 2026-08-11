import type { NextRequest } from 'next/server';
import { verifyJwt } from '@/lib/jwt';

export type SessionUser = {
  userId: string;
  sessionVersion: string;
  issuedAt: number;
};

export type SessionReadResult =
  | { ok: true; session: SessionUser }
  | { ok: false; reason: 'missing_token' | 'missing_secret' | 'invalid_token' };

export type SessionCandidatesReadResult =
  | { ok: true; sessions: SessionUser[] }
  | { ok: false; reason: 'missing_token' | 'missing_secret' | 'invalid_token' };

type RequestCookiesShape = {
  get(name: string): { value: string } | undefined;
};

type RequestWithCookies = Request & {
  cookies?: RequestCookiesShape;
};

const parseCookieHeader = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) return {};

  const pairs = cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const parsed: Record<string, string> = {};
  for (const pair of pairs) {
    const sep = pair.indexOf('=');
    if (sep <= 0) continue;

    const key = pair.slice(0, sep).trim();
    const value = pair.slice(sep + 1).trim();
    if (!key) continue;

    try {
      parsed[key] = decodeURIComponent(value);
    } catch {
      parsed[key] = value;
    }
  }

  return parsed;
};

const getCookieToken = (req: Request | NextRequest, cookieName: string): string | null => {
  const requestWithCookies = req as RequestWithCookies;
  const cookieFromApi = requestWithCookies.cookies?.get(cookieName)?.value;
  if (cookieFromApi) return cookieFromApi;

  const cookieHeader = req.headers.get('cookie');
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[cookieName] ?? null;
};

export const hasSessionCookie = (
  req: Request | NextRequest,
  cookieName = 'session'
): boolean => Boolean(getCookieToken(req, cookieName));

const getBearerToken = (req: Request | NextRequest): string | null => {
  const authorization = req.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

export const readSessionUser = (
  req: Request | NextRequest,
  cookieName = 'session'
): SessionReadResult => {
  const cookieToken = getCookieToken(req, cookieName);
  const bearerToken = getBearerToken(req);
  if (!cookieToken && !bearerToken) return { ok: false, reason: 'missing_token' };

  const secret = process.env.JWT_SECRET;
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const payload =
    (cookieToken ? verifyJwt(cookieToken, secret) : null) ??
    (bearerToken ? verifyJwt(bearerToken, secret) : null);
  if (!payload?.sub) return { ok: false, reason: 'invalid_token' };

  return {
    ok: true,
    session: {
      userId: payload.sub,
      sessionVersion: payload.sv,
      issuedAt: payload.iat,
    },
  };
};

export const readSessionCandidates = (
  req: Request | NextRequest,
  cookieName = 'session'
): SessionCandidatesReadResult => {
  const cookieToken = getCookieToken(req, cookieName);
  const bearerToken = getBearerToken(req);
  if (!cookieToken && !bearerToken) return { ok: false, reason: 'missing_token' };

  const secret = process.env.JWT_SECRET;
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const payloads = [
    cookieToken ? verifyJwt(cookieToken, secret) : null,
    bearerToken ? verifyJwt(bearerToken, secret) : null,
  ].filter((payload): payload is NonNullable<typeof payload> => Boolean(payload));
  if (payloads.length === 0) return { ok: false, reason: 'invalid_token' };

  const sessions = payloads.map((payload) => ({
    userId: payload.sub,
    sessionVersion: payload.sv,
    issuedAt: payload.iat,
  }));
  return {
    ok: true,
    sessions: sessions.filter(
      (session, index) =>
        sessions.findIndex(
          (candidate) =>
            candidate.userId === session.userId &&
            candidate.sessionVersion === session.sessionVersion
        ) === index
    ),
  };
};

