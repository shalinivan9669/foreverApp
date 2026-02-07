import type { NextRequest } from 'next/server';
import { jsonUnauthorized } from '@/lib/auth/errors';
import { readSessionUser, type SessionUser } from '@/lib/auth/session';

export type GuardResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export const requireSession = (
  req: Request | NextRequest
): GuardResult<SessionUser> => {
  const session = readSessionUser(req);

  if (!session.ok) {
    if (session.reason === 'missing_token') {
      return { ok: false, response: jsonUnauthorized('AUTH_REQUIRED', 'unauthorized') };
    }
    return {
      ok: false,
      response: jsonUnauthorized('AUTH_INVALID_SESSION', 'unauthorized'),
    };
  }

  return { ok: true, data: session.session };
};

