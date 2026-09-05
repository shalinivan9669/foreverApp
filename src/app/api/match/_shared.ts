import type { NextRequest } from "next/server";
import { asError, toDomainError } from "@/domain/errors";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/abuse/rateLimit";
import { jsonError, jsonOk, type JsonValue } from "@/lib/api/response";
import { auditContextFromRequest } from "@/lib/audit/emitEvent";
import type { AuditRequestContext } from "@/lib/audit/eventTypes";
import { requireSession } from "@/lib/auth/guards";
import { readIdempotencyKey } from "@/lib/idempotency/key";
import { withIdempotency } from "@/lib/idempotency/withIdempotency";

type MatchingRequestContext =
  | {
      ok: true;
      currentUserId: string;
      auditRequest: AuditRequestContext;
    }
  | { ok: false; response: Response };

export const prepareMatchingRequest = async (
  req: NextRequest,
  route: string,
): Promise<MatchingRequestContext> => {
  const auth = await requireSession(req);
  if (!auth.ok) return auth;

  const rate = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.matchMutations,
    userId: auth.data.userId,
    routeForAudit: route,
  });
  if (!rate.ok) return rate;

  return {
    ok: true,
    currentUserId: auth.data.userId,
    auditRequest: auditContextFromRequest(req, route),
  };
};

export const matchingReadResponse = async <T>(
  operation: () => Promise<T>,
): Promise<Response> => {
  try {
    return jsonOk(await operation());
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details,
    );
  }
};

export const matchingMutationResponse = async <T>(input: {
  req: NextRequest;
  route: string;
  currentUserId: string;
  requestBody: JsonValue;
  authorize?: () => Promise<void>;
  execute: (context: { idempotencyKey: string }) => Promise<T>;
}): Promise<Response> => {
  // Cached responses may contain participant-only text. Re-authorize before replay.
  try {
    await input.authorize?.();
  } catch (caughtError) {
    const domainError = toDomainError(asError(caughtError));
    return jsonError(domainError.status, domainError.code, domainError.message, domainError.details);
  }
  const key = readIdempotencyKey(input.req);
  if (!key.ok) {
    return Promise.resolve(jsonError(key.status, key.code, key.message));
  }

  return withIdempotency({
    req: input.req,
    route: input.route,
    userId: input.currentUserId,
    requestBody: input.requestBody,
    execute: () => input.execute({ idempotencyKey: key.key }),
  });
};
