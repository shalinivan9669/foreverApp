# Security

## Auth subject

- The authenticated subject comes from session cookie / `requireSession`.
- Client-provided `userId`, `fromId`, and `actorId` are not authoritative.
- By-id write endpoints must be self-only or admin-only.
- Public endpoints must make their public scope explicit.
- `GET /api/users/[id]` is public read only; by-id `PUT` and onboarding `PATCH` must reject actor/target mismatches with `ACCESS_DENIED`.
- `/api/exchange-code` must not trust client `redirect_uri`. It is accepted only when it exactly matches `DISCORD_REDIRECT_URI` or the existing `NEXT_PUBLIC_DISCORD_REDIRECT_URI` fallback.

## Resource authorization

- Pair resources require pair membership.
- Activity resources require activity/pair membership.
- Like resources require like participant role.
- Public user DTO must never expose private profile fields.
- Use centralized guards in `src/lib/auth/resourceGuards.ts`.

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

## Agent rule

Any Codex task touching auth, users, pair, like, activity, answers, logs, or DTO must explicitly mention security impact in the final report.

## References

- Detailed security history: `docs/07-security-privacy.md`.
- Audit and retention: `docs/05-analytics-events.md`.
- Backend security checklist: `docs/engineering/checklists/audit-rate-limit-entitlements-checklist.md`.
