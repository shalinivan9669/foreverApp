# API Contracts

## API envelope

Success:

```ts
{ ok: true, data: T, meta?: Record<string, unknown> }
```

Error:

```ts
{ ok: false, error: { code: string, message: string, details?: unknown } }
```

HTTP status must remain semantic. The envelope does not replace `400`, `401`, `403`, `404`, `409`, `429`, or `500`.

## Route handler rules

- Validate body/query/params with shared validation helpers from `src/lib/api/validate.ts`.
- Use `jsonOk` / `jsonError` from `src/lib/api/response.ts`.
- Use `requireSession` for private endpoints.
- Use resource guards for pair/activity/like ownership.
- Return DTO only.
- Keep handlers thin.
- Map domain errors at the route boundary.
- Do not return raw Mongoose documents.

## Mutation rules

- Use idempotency for retryable mutations.
- Use state machines for state transitions.
- For multi-document state changes, prefer a transaction or safe ordering.
- Do not perform irreversible side effects before final state validation.
- Do not accept client-provided `userId`, `fromId`, or `actorId` as authoritative when session exists.

## Active endpoint notes

- `GET /api/users/[id]` is a public read endpoint and returns only public user DTO fields.
- By-id user writes are self-only. The authenticated subject comes from `requireSession`; a mismatched `params.id` returns `403 ACCESS_DENIED`.
- Self writes should use `/api/users/me` and `/api/users/me/onboarding`.
- `GET /api/users/me` includes private DTO fields and a derived `profileStatus`: `auth_created`, `onboarding_started`, or `complete`.
- `POST /api/exchange-code` validates client `redirect_uri` against `DISCORD_REDIRECT_URI`, falling back to `NEXT_PUBLIC_DISCORD_REDIRECT_URI`. Mismatch returns `400 INVALID_REDIRECT_URI`.
- `POST /api/match/like` accepts `agreements` and `answers` because they are persisted on the Like as the initiator response snapshot fields.
- Like `matchScore` is computed from existing vector distance scoring. If either side has no usable vectors yet, create-like returns score `0` instead of a placeholder.
- `POST /api/match/confirm` transitions the Like from `mutual_ready` to `paired` with an atomic `findOneAndUpdate` scoped by like id, initiator id, and status before Pair upsert/activation.
- Questionnaire answer writes (`/api/answers/bulk`, `/api/questionnaires/[id]`, `/api/pairs/[id]/questionnaires/[qid]/answer`) require integer `ui >= 1`; domain scoring additionally rejects values above the target question `map.length`.
- `/api/answers/bulk` rejects submissions where provided question ids do not match known questions instead of returning a successful zero-match vector audit.
- Pair questionnaire answers apply vector scoring only for newly answered questions and complete the pair session after both pair members have answered every question in the questionnaire.

## References

- Detailed historical API inventory: `docs/04-api-contracts.md`.
- Backend checklist: `docs/engineering/checklists/api-endpoint-checklist.md`.
- DTO checklist: `docs/engineering/checklists/dto-contract-checklist.md`.
