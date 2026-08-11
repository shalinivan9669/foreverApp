import type { NextRequest } from 'next/server';
import { jsonUnauthorized } from '@/lib/auth/errors';
import { readSessionCandidates, type SessionUser } from '@/lib/auth/session';
import { requireTrustedUnsafeRequest } from '@/lib/auth/requestSafety';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import {
  AccountWriteBarrierError,
  accountWriteBarrierService,
} from '@/domain/services/accountWriteBarrier.service';
import { holdAccountWriteLeaseForRequest } from '@/lib/auth/accountWriteLeaseRuntime';

export type GuardResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export const requireSession = async (
  req: Request | NextRequest,
  options: { accountLease?: 'required' | 'deletion-control' } = {}
): Promise<GuardResult<SessionUser>> => {
  const candidates = readSessionCandidates(req);

  if (!candidates.ok) {
    if (candidates.reason === 'missing_token') {
      return { ok: false, response: jsonUnauthorized('AUTH_REQUIRED', 'unauthorized') };
    }
    return {
      ok: false,
      response: jsonUnauthorized('AUTH_INVALID_SESSION', 'unauthorized'),
    };
  }

  const requestSafety = requireTrustedUnsafeRequest(req);
  if (!requestSafety.ok) return requestSafety;

  for (const session of candidates.sessions) {
    if (options.accountLease === 'deletion-control') {
      const active = await sessionRevocationService.isDeletionControlSession(
        session.userId,
        session.sessionVersion
      );
      if (active) return { ok: true, data: session };
      continue;
    }

    try {
      const lease = await accountWriteBarrierService.acquireAuthenticated({
        userId: session.userId,
        sessionVersion: session.sessionVersion,
      });
      if (!holdAccountWriteLeaseForRequest(lease)) {
        // Direct route-handler tests run outside Next's request work store. They
        // cannot extend work with `after()`, so do not leave a synthetic lease.
        await accountWriteBarrierService.release(lease);
      }
      return { ok: true, data: session };
    } catch (error) {
      if (error instanceof AccountWriteBarrierError) continue;
      throw error;
    }
  }

  return {
    ok: false,
    response: jsonUnauthorized('AUTH_INVALID_SESSION', 'unauthorized'),
  };
};

