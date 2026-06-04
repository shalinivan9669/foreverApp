# AGENTS

Cross-cutting infrastructure lives here: auth, API helpers, DTO, audit, idempotency, entitlements, abuse/rate limiting, and Discord helpers.

## Rules

- Changes here can affect many routes. Keep changes small and targeted.
- If changing auth, DTO, audit, idempotency, or entitlements, update relevant docs and mention security impact.
- Do not weaken sanitization or response contracts.
- DTO mappers must prevent raw DB leakage.
- Auth helpers must not trust client-provided subject IDs when session is available.
- Audit helpers must not persist secrets, tokens, cookies, raw bodies, or answer payloads.

