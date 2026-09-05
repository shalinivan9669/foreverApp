# Troubleshooting

## Local setup

- If `next` or `tsc` is not recognized, run `npm install`; `node_modules` is required for package scripts.
- In PowerShell, `npm` may resolve to `npm.ps1` and be blocked by execution policy. Use `npm.cmd run <script>` instead.
- Private API calls require the session cookie. Browser clients for private endpoints should send `credentials: include`.

## Build and lint

- `npm run lint` uses the ESLint CLI (`eslint .`) with `eslint.config.mjs`.
- `npm run check:agents` runs compact repository diagnostics for agent-boundary issues.
- For doc-only changes, do not run build unless the docs changed env contracts, scripts, or build configuration.

## Discord embedded context

- Embedded/proxied HTTPS contexts require session cookies compatible with Discord iframe behavior.
- Keep redirect URI and client ID in sync with Discord application settings and `.env.local`.
- The centralized unsafe-request boundary accepts only the exact configured `https://<clientId>.discordsays.com` Activity origin in addition to same-origin traffic. Do not broaden this to sibling, suffix, or wildcard origins.
- The Embedded SDK server exchange intentionally omits `redirect_uri`. Reintroducing it can make a valid Discord Activity authorization code fail exchange.
- A first-login Discord identity update must remain a partial upsert. Do not inject legacy onboarding defaults that cannot pass current `User` validation.
- Diagnose exchange failures with sanitized reason/status metadata only. Never log the authorization code, token response, cookie, authorization header, or raw request body.

## Weekly-cycle reconciliation and a missing hint index

- The declared named index is the normal reconciliation path and must be verified by the target release preflight.
- The runtime performs exactly one unhinted retry only for Mongo `code: 2`, `codeName: BadValue`, with the missing-hint condition. It records the sanitized reason `RECONCILIATION_INDEX_FALLBACK`.
- Different query failures and any failure from the unhinted retry are rethrown; they are not masked by the fallback.
- The retry keeps the original filter, sort, projection, and eight-row result bound. It can still scan or sort more documents than the indexed path, so restore the declared index instead of relying on this recovery behavior.

## Closed-beta data reset

- Never reset a Discord user by deleting only `users`; linked onboarding, Pair, invite, Matching, answer, session, idempotency, notification, and audit state can reattach or conflict.
- Do not use `dropDatabase()` for a clean slate. It removes collections/indexes and can also remove questionnaires, activity templates, and the Factor registry.
- Normal account deletion leaves a durable deleted session subject by design. A separately reviewed beta reset must clear `session_subjects` so the same Discord identities can register again.
- Require a verified backup/restore, stopped or fenced writes, an explicit collection allowlist, aggregate pre/post counts, preserved-content checks, and index comparison before calling the reset complete.
- The requested September beta reset was not executed; see `CURRENT_PILOT_HANDOFF.md` for the exact status and sequencing constraints.
