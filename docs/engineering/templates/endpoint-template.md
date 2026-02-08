# Endpoint Spec: `METHOD /api/<resource>`

## Ownership
- Domain owner:
- Route file:
- Service file:

## Access
- Scope: public | private
- Session required: yes/no
- Resource guard:
- Entitlement guard:
- Quota guard:

## Input contract
- Params schema:
- Query schema:
- JSON body schema:
- Validation helper: `parseParams` | `parseQuery` | `parseJson`

## Idempotency and rate limit
- Idempotency required: yes/no
- Idempotency key behavior:
- Rate-limit policy key:

## Controller flow (thin)
1. `requireSession` (if private).
2. Guard checks.
3. Parse/validate request.
4. Enforce rate limit.
5. Enforce entitlement/quota.
6. Wrap mutation with idempotency.
7. Call domain service.
8. Return `jsonOk(dto)` or `jsonError(...)`.

## Output contract
- Success status/code:
- Success DTO:
- Error codes:
  - `VALIDATION_ERROR` (400)
  - `AUTH_REQUIRED` (401)
  - `ACCESS_DENIED` (403)
  - `NOT_FOUND` (404)
  - `STATE_CONFLICT` (409)
  - `IDEMPOTENCY_*` (409/422)
  - `RATE_LIMITED` (429)
  - `ENTITLEMENT_REQUIRED` (402)
  - `QUOTA_EXCEEDED` (403)

## Audit/privacy
- Events emitted:
- PII fields excluded from logs:
- Retention tier:

## Docs updated
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`
- Related PROB/ADR:
