# Security

## Auth subject

- The authenticated subject comes from session cookie / `requireSession`.
- Client-provided `userId`, `fromId`, and `actorId` are not authoritative.
- By-id write endpoints must be self-only or admin-only.
- Public endpoints must make their public scope explicit.
- `GET /api/users/[id]` requires session auth and returns public DTO fields only; by-id `PUT` and onboarding `PATCH` must reject actor/target mismatches with `ACCESS_DENIED`.
- `/api/exchange-code` must not trust client `redirect_uri`. It is accepted only when it exactly matches `DISCORD_REDIRECT_URI` or the existing `NEXT_PUBLIC_DISCORD_REDIRECT_URI` fallback.
- `/api/exchange-code` may return the Discord `access_token` only for Discord SDK authentication. Browser code should use the backend-provided minimal Discord profile instead of making extra direct Discord API calls with that token. Token responses must be `no-store`.
- `/api/exchange-code` must issue the session cookie as `Secure`/`SameSite=None` in production, even when a mobile/embedded proxy omits `x-forwarded-proto`.
- `/api/exchange-code` may upsert only the basic profile fields from the verified Discord user (`username`, `avatar`) before issuing the session cookie; it must not trust client-provided user ids.
- Embedded mobile clients may use the signed `/api/exchange-code` `session_token` as an `Authorization: Bearer` fallback when iframe cookies are unavailable. The browser client must keep this token in memory only, send it only to internal `/api` paths, and never persist or log it.
- User profile write endpoints must not accept `vectors` or `embeddings`; vector writes must go through scoring code and snapshot persistence.
- `/api/entitlements/grant` must require `ENTITLEMENTS_ADMIN_KEY` when configured. Unkeyed access is local-development only.
- Closed-beta content endpoints that expose questionnaires, questions, or activity templates should require session auth; questionnaire/question DTOs contain product scoring metadata.
- Security headers should preserve Discord iframe embedding. Do not add `X-Frame-Options`; use CSP `frame-ancestors` instead.

## Resource authorization

- Pair resources require pair membership.
- Activity resources require activity/pair membership.
- Like resources require like participant role.
- Public user DTO must never expose private profile fields.
- Use centralized guards in `src/lib/auth/resourceGuards.ts`.
- P0 pair linking accepts no client actor/member id. The invite creator comes from session, and the accepter is the authenticated session subject.
- A user cannot obtain a second active pair through the P0 invite flow: acceptance uses a MongoDB transaction plus a unique `PairMembershipClaim.userId` index. Legacy direct pair activation is disabled at both `/api/pairs/create` and `/api/match/confirm`.

## P0 invite and recovery secrets

- Invite tokens use 32 random bytes encoded as base64url. Only SHA-256 hashes are stored.
- Raw tokens are returned only on create/reissue in `no-store` responses and are carried by the browser URL fragment, never a query string.
- Resolve/accept take the token in a JSON body, are rate-limited, and return generic unavailable states for expired, cancelled, used-by-another, self-pair, or conflicting-membership cases.
- Idempotency storage may keep only a derived request hash for accept. Create/reissue do not store a replay envelope because it would duplicate the one-time token.

## PII boundaries

Sensitive:

- personal profile;
- onboarding;
- relationship answers;
- questionnaire answers;
- location;
- tokens/cookies/secrets.

Private profile data may be returned only through explicitly scoped self endpoints and DTOs.
Initiator/recipient like answers are relationship data. They may be stored for the Like contract but must not be logged in audit metadata.

P0 projection rules:

- Owner onboarding/check-in endpoints may return that owner's exact values under `no-store`; pair endpoints may return only relative completion and qualitative signals.
- One-sided weekly input publishes no pair signal. Pair DTOs contain no averages, divergence, reconstructable counts, passport, readiness/fatigue value, or global compatibility score.
- Activity result DTOs contain only qualitative status/readiness-to-display facts; exact feedback, effects, and source evidence stay internal.
- Cycle history comes only from immutable canonical snapshots. Missing legacy snapshots are omitted rather than recalculated.
- The legacy pair diagnostics endpoint is retired for P0; direct navigation and API access cannot recover passport, A/B deltas, answer-derived signals, global score, readiness, or fatigue.
- The owner-private safety flag stores no reason/free text and only vetoes activity eligibility. The partner receives neither the flag nor a safety-specific error/recommendation reason.

## Logging

Never log:

- `access_token`
- `refresh_token`
- `authorization`
- `cookie`
- `password`
- `secret`
- raw body
- free text answers
- full check-in/questionnaire payloads

Audit/event metadata must be sanitized before persistence.
OAuth auth failure events should record only compact reason/status metadata, never authorization codes, redirect URIs, tokens, or secrets.
P0 activity/check-in audits use event-specific allowlists and do not persist exact answers, scores, averages, effect deltas, notes, or invite tokens. Safety audit stores only pair id, boolean state, and retention class.

## Agent rule

Any Codex task touching auth, users, pair, like, activity, answers, logs, or DTO must explicitly mention security impact in the final report.

## References

- Detailed security history: `docs/07-security-privacy.md`.
- Audit and retention: `docs/05-analytics-events.md`.
- Backend security checklist: `docs/engineering/checklists/audit-rate-limit-entitlements-checklist.md`.
