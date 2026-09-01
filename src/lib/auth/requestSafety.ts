import type { NextRequest } from 'next/server';
import { jsonForbidden } from '@/lib/auth/errors';
import { hasSessionCookie } from '@/lib/auth/session';

type RequestSafetyResult =
  | { ok: true }
  | { ok: false; response: Response };

type RequestSafetyOptions = {
  protectWithoutSessionCookie?: boolean;
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const denied = (): RequestSafetyResult => ({
  ok: false,
  response: jsonForbidden('REQUEST_ORIGIN_DENIED', 'Request origin not allowed'),
});

const requestOrigin = (req: Request | NextRequest): string | null => {
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
};

const headerOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const configuredDiscordActivityOrigin = (): string | null => {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID?.trim();
  if (!clientId || !/^\d+$/.test(clientId)) return null;
  return `https://${clientId}.discordsays.com`;
};

const isTrustedOrigin = (
  suppliedOrigin: string,
  expectedOrigin: string,
): boolean => {
  const normalizedOrigin = headerOrigin(suppliedOrigin);
  if (!normalizedOrigin) return false;

  const activityOrigin = configuredDiscordActivityOrigin();
  return (
    normalizedOrigin === expectedOrigin ||
    (activityOrigin !== null && normalizedOrigin === activityOrigin)
  );
};

export const requireTrustedUnsafeRequest = (
  req: Request | NextRequest,
  options: RequestSafetyOptions = {}
): RequestSafetyResult => {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return { ok: true };

  const shouldProtect =
    options.protectWithoutSessionCookie === true || hasSessionCookie(req);
  if (!shouldProtect) return { ok: true };

  const fetchSite = req.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite === 'cross-site') return denied();

  const expectedOrigin = requestOrigin(req);
  if (!expectedOrigin) return denied();

  const suppliedOrigin = req.headers.get('origin')?.trim();
  if (suppliedOrigin) {
    return isTrustedOrigin(suppliedOrigin, expectedOrigin)
      ? { ok: true }
      : denied();
  }

  return fetchSite === 'same-origin' ? { ok: true } : denied();
};
