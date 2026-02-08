# Backend Playbook

## Golden path for a new `/api` endpoint
1. `route.ts` is a thin controller only:
   - `requireSession(...)` and resource guard for private resources.
   - Validate request with `parseJson(...)`, `parseQuery(...)`, `parseParams(...)`.
   - Apply `enforceRateLimit(...)` for abuse-prone endpoints.
   - Apply `assertEntitlement(...)` and `assertQuota(...)` for paid features or usage caps.
   - Wrap risky mutations with `withIdempotency(...)`.
   - Call one domain service method.
   - Return `jsonOk(dto)` or `jsonError(...)`.
2. Domain service responsibilities:
   - Execute DB reads/writes.
   - Execute state-machine transition checks and changes.
   - Emit audit events via `emitEvent(...)`.
   - Return mapped DTOs only, never raw DB documents.
3. Error policy:
   - `VALIDATION_ERROR` -> `400`
   - `AUTH_REQUIRED` -> `401`
   - `ACCESS_DENIED` -> `403`
   - `NOT_FOUND` -> `404`
   - `STATE_CONFLICT` -> `409`
   - `IDEMPOTENCY_*` -> `409` or `422`
   - `RATE_LIMITED` -> `429`
   - `ENTITLEMENT_REQUIRED` -> `402`
   - `QUOTA_EXCEEDED` -> `403`
   - `INTERNAL` -> `500`
   - Never throw bare `Error` without mapping. Use `DomainError` or `ApiClientError`.
4. DTO contract rule:
   - API never returns DB model shape.
   - PII fields can be exposed only in explicit private scope DTOs.
5. Audit/privacy rules:
   - Never log `access_token`, `code`, `redirect_uri`, raw request body, or secret-like keys.
   - Every persisted event must have a retention tier and derived `expiresAt`.
   - Use retention tiers consistently (for example: short, abuse, long) with explicit TTL.
6. Entitlements usage:
   - Gate paywalled actions with `assertEntitlement(...)`.
   - Gate consumption limits with `assertQuota(...)`.
   - Apply checks in route/controller layer before domain mutation starts.
7. Anti-patterns (forbidden):
   - Business logic in `route.ts`.
   - Top-level `process.env` reads plus DB connect side effects in module scope for request handlers.
   - Returning `mongoose` docs directly from API.
   - Local ad-hoc status checks instead of centralized state-machine guards.
