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

- `GET /api/users/[id]` requires session auth and returns only public user DTO fields.
- By-id user writes are self-only. The authenticated subject comes from `requireSession`; a mismatched `params.id` returns `403 ACCESS_DENIED`.
- Self writes should use `/api/users/me` and `/api/users/me/onboarding`.
- User profile writes (`/api/users`, `/api/users/me`, `/api/users/[id]`) do not accept `vectors` or `embeddings`; vector changes must go through scoring services and `VectorSnapshot` persistence.
- `GET /api/users/me` includes private DTO fields and a derived `profileStatus`: `auth_created`, `onboarding_started`, or `complete`.
- User profile `location`, when provided, must be a strict GeoJSON `Point` with longitude/latitude bounds.
- `POST /api/exchange-code` validates client `redirect_uri` against `DISCORD_REDIRECT_URI`, falling back to `NEXT_PUBLIC_DISCORD_REDIRECT_URI`. Mismatch returns `400 INVALID_REDIRECT_URI`. It upserts the basic user profile from the verified Discord profile server-side, then returns the Discord `access_token` for SDK authentication, a signed in-memory `session_token` fallback for embedded mobile clients, and a minimal `{ id, username, avatar }` user profile so the browser does not need a second direct Discord API call or immediate protected `/api/users` write.
- `POST /api/entitlements/grant` requires `x-entitlements-admin-key` when `ENTITLEMENTS_ADMIN_KEY` is configured. Without a configured key, it is available only from localhost in non-production.
- Closed-beta content endpoints (`GET /api/activity-templates`, `GET /api/questionnaires`, `GET /api/questionnaires/[id]`, `GET /api/questions`) require session auth even when they return only catalog/scoring content.
- `POST /api/match/like` accepts `agreements` and `answers` because they are persisted on the Like as the initiator response snapshot fields.
- Like `matchScore` is computed from existing vector distance scoring. If either side has no usable vectors yet, create-like returns score `0` instead of a placeholder.
- `POST /api/match/confirm` is retained only as a legacy authenticated boundary and returns `409 PAIR_INVITE_REQUIRED`; it does not transition the Like or create/activate a Pair. P0 pair formation is exclusively invite-based.
- Questionnaire answer writes (`/api/answers/bulk`, `/api/questionnaires/[id]`, `/api/pairs/[id]/questionnaires/[qid]/answer`) require integer `ui >= 1`; domain scoring additionally rejects values above the target question `map.length`.
- `/api/answers/bulk` rejects submissions where provided question ids do not match known questions instead of returning a successful zero-match vector audit.
- Pair questionnaire answers apply vector scoring only for newly answered questions and complete the pair session after both pair members have answered every question in the questionnaire.
- `GET /api/pairs/[id]/summary` requires session auth and `requirePairMember`. It returns the pair DTO plus public `members`, relative `peer`, `currentActivity`, `suggestedCount`, `hasCurrentWeeklyCheckIn`, and a next step derived from the canonical qualitative weekly-cycle snapshot. The P0 projection returns no passport, compatibility score, risk zones, readiness/fatigue metrics, Like payload, raw Pair/User/WeeklyCheckIn document, or weekly answer.
- `GET /api/pairs/[id]/diagnostics` is a retired authenticated/member-only P0 boundary and returns `410 PAIR_DIAGNOSTICS_RETIRED` with `private, no-store`. It no longer calculates or returns passport fields, A/B deltas, answer signals, global compatibility, generated insight ids, readiness, or fatigue; clients must use the qualitative Pair Summary.
- `GET /api/pairs/[id]/events?include=active|all` requires session auth and `requirePairMember`. It lazily refreshes PairEvent records for current relationship milestones, limited calendar events, weekly/activity/diagnostic signals, then returns `{ events: PairEventDTO[] }`. Default `active` excludes declined, expired, and completed events; `all` includes history. It returns DTOs only and never exposes raw Mongoose documents or private weekly notes.
- `POST /api/pairs/[id]/events/[eventId]/accept` requires session auth, pair membership, and an idempotency key. It accepts `upcoming`, `offered`, and non-expired `snoozed` events for an active pair. In the P0 projection acceptance is status-only: it returns `activities: []`, clears/cancels any legacy event-generated offers, and cannot bypass the canonical `RecommendationDecision` flow.
- `POST /api/pairs/[id]/events/[eventId]/decline` and `POST /api/pairs/[id]/events/[eventId]/snooze` require session auth, pair membership, and an idempotency key. Decline is allowed only for `upcoming`, `offered`, and non-expired `snoozed` events; it is rejected for `accepted`, `completed`, `expired`, and `declined`. Snooze accepts `{ days?: 1|3|7 }`, defaults to three days, is allowed only for `upcoming` and `offered`, and rejects accepted/completed/expired/declined events, already snoozed events, and snoozes that exceed the event window.
- `partner_birthday` is a reserved future `PairEventType`. The event refresh service must not create birthday events until a privacy-reviewed birthday/date-of-birth data model exists.
- `PairActivityDTO.eventSource` is an optional privacy-safe source marker. When present, it contains only `trigger: "pair_event"`; event ids, types, dates, raw `stateMeta`, and check-in/questionnaire evidence are not participant-facing.
- `POST /api/checkins/weekly` keeps solo check-ins separate from pair check-ins. When `pairId` is present, identity is `{ userId, pairId, weekKey }`, pair membership is required, paused pairs are allowed, and ended pairs return `409 STATE_CONFLICT`. The first submission for that identity is immutable in the P0 flow: retries and concurrent duplicates return the stored owner result without recomputing a new pair projection or applying vector effects twice.
- `GET /api/checkins/weekly/current?pairId=...` reads the authenticated user's check-in for that exact pair and week. Without `pairId`, it reads only the solo check-in.
- `GET /api/pairs/[id]/weekly-checkin/current` requires session auth and `requirePairMember`. It separates the owner check-in DTO from the pair DTO. The pair response contains only current-user/peer submitted status, `dataStatus` (`NOT_READY`, `PARTIAL`, `ENOUGH`, or `INSUFFICIENT`), neutral reason codes, and up to four qualitative signals after both participants submit. It never returns exact averages, divergence, counts, participant answer values, private notes, or raw WeeklyCheckIn documents; a one-sided submission publishes no pair signals.
- `GET /api/users/me/mvp-onboarding` and `PATCH /api/users/me/mvp-onboarding` are owner-only. They expose the current versioned definition plus the authenticated user's exact answer revisions for resume. Consent requires 18+, voluntary participation, and privacy acknowledgement; answers are closed/typed and use `PRIVATE`, `PAIR_MODEL_ONLY`, or `SHARED`. Mutations are intrinsically idempotent and use optimistic concurrency; responses are `no-store` and are not copied into idempotency records.
- Pair linking uses `/api/pair-invites`. `POST /api/pair-invites` issues a 32-byte one-time token once in a `no-store` owner response; only SHA-256 `tokenHash` is persisted. Owner status/cancel/reissue routes are authenticated and rate-limited. Create/reissue deliberately do not advertise transport idempotency because safely replaying their envelope would persist the raw one-time token. `POST /api/pair-invites/resolve` and `/accept` take the token in the JSON body, return generic unavailable states to non-owners, reject self-pair/second active pair, and derive the actor from session. Acceptance is transaction-backed, idempotent for the same accepter, and protected by unique per-user membership claims. Legacy `/api/pairs/create` and `/api/match/confirm` cannot form a pair and return `PAIR_INVITE_REQUIRED`.
- `GET /api/pairs/[id]/weekly-cycle/current` returns the server-defined UTC/ISO-week window, relative participant completion (`PENDING`, `SUBMITTED`, `SKIPPED`, `EXPIRED`), safe pair data status/signals, and immutable snapshot revision/version provenance. Lifecycle expiry is independent from result readiness: an expired cycle with two valid submissions retains `ENOUGH` and its previously published safe signals; incomplete expiry becomes `INSUFFICIENT`.
- `POST /api/pairs/[id]/weekly-cycle/current` skips only the authenticated member's current cycle. The strict body is empty, so no reason is collected or disclosed. Skip is cycle-key-idempotent and CAS-protected against an active submit lease; submit/skip races cannot create duplicate evidence or snapshots.
- `GET /api/pairs/[id]/recommendations` returns `{ current, history }` for a pair member. `POST` accepts `{ action: "offer" }` or `{ action: "accept" | "replace" | "skip", decisionId }` under idempotency. A decision has one primary offer, at most one replacement, neutral persisted reason codes, and CAS terminal transitions. Interrupted decision-to-activity writes self-heal from the terminal decision; DTOs contain no safety state, template id, exact metric, feedback value, or raw activity metadata.
- `GET /api/pairs/[id]/history?cursor=&limit=` is member-only, `private, no-store`, and cursor-paginated to 20 items. Cycle rows come only from `WeeklyCycle.latestSnapshotId` joined to its matching immutable `PairStateSnapshot`; cycles without a canonical snapshot are omitted instead of being recalculated from raw check-ins. Activity rows contain only date/title/status and a feedback-presence fact.
- `GET`/`PUT /api/users/me/safety-gate?pairId=...` is an owner-only, `no-store` control. The PUT body stores only `{ pairId, enabled }`; no explanation/free text exists. The pair-wide eligibility check is a system-only veto, never enters ranking or Pair Summary, and exposes no owner identity or reason to the peer. Audit metadata is allowlisted to pair id, boolean state, and retention class.
- `POST /api/pairs/[id]/suggest`, `POST /api/pairs/[id]/activities/suggest`, and `POST /api/activities/next` remain guarded compatibility routes with their existing response envelopes. They delegate to the canonical recommendation workflow and return zero or one decision-backed offer, never a parallel batch or orphan activity. `POST /api/pairs/[id]/activities/from-template` may create only its existing neutral allowlisted fallback and links it to a canonical decision before returning it. The primary UI uses `/api/pairs/[id]/recommendations`; legacy suggestion controls are not rendered.
- Compatibility suggestion plans are limited to `status`, a neutral `reasonCode`/`explanation`, and `decisionVersion`; they do not expose exact weekly metrics, diagnostics, axes, severity, recent feedback values, or internal source metadata. Automatic P0 selection excludes finance and sexuality templates and never creates a new offer while an activity is current.
- Activity suggestions may persist internal decision context in `PairActivity.stateMeta`, including version/provenance and concrete `assignedMemberIds` for legacy `soloA`/`soloB` template modes. That metadata is not returned by participant APIs.
- Activity DTOs expose effective completion questions and an optional privacy-safe `resultSummary`; they never expose raw per-partner activity answers. Existing activities without custom check-ins use the universal usefulness/comfort/tension/similar-format feedback set, and existing completed records without `resultSummary` remain readable.
- `POST /api/activities/[id]/checkin` validates every effective closed feedback question and replaces only the authenticated participant's prior answer for that question. Its response is the safe result projection: `dataStatus`, `bothSubmitted`, qualitative `status`, optional completion time, and `resultVersion`; it returns no exact score, count, average, per-member value, or internal effect.
- `POST /api/activities/[id]/complete` requires at least one feedback submission and returns `{ status, resultSummary }` with the same safe projection. One-sided results are preliminary `completed_partial`; a late second feedback can refine that result idempotently without applying the effect twice. Internal bounded effects and vector snapshots preserve `source: activity_completion`, activity id, result revision, and scoring version, but are absent from participant DTOs and audit metadata.
- Activity feedback remains available for an existing accepted/partial activity while a pair is paused, but ended pairs cannot submit or complete activity feedback. Late feedback is accepted only for `completed_partial`; final `completed_success` and `failed` results return `409 ACTIVITY_RESULT_FINALIZED`. Repeated complete calls return the stored result without another effect or completion audit.
- Recent feedback and cooldown may influence internal eligibility, but exact feedback signals are not returned. P0 automatic and direct-template routes reject finance/sexuality templates; the private safety gate further restricts selection to neutral low-effort system fallbacks without a partner-visible reason.
- Pair readiness/fatigue are recalculated from the available pair-scoped check-ins for the current week. A single response produces an explicit partial state; the previous Pair metric is never treated as the second response.
- Before deploying pair-scoped weekly writes to an existing database, run `node ./node_modules/tsx/dist/cli.mjs ./scripts/migrate-weekly-checkins-pair-scope.ts`. The idempotent script creates `{ userId, pairId, weekKey }` unique first, removes the legacy `{ userId, weekKey }` unique index, and restores non-unique lookup indexes without modifying documents.
- `GET /api/users/me/profile-summary` returns account-profile mode fields: `profileMode`, `relationshipContext`, `profileCompletion`, `pairedProfileState`, and `nextStep`. Paused pairs are treated as paired mode, `relationshipContext.currentPair` can be active or paused, and ended pairs are history only. Legacy `user.status` and `currentPair` are preserved for compatibility.
- `pairedProfileState` is `null` for solo users and contains DTO-safe paired-user read-model fields for active/paused pairs: current weekly check-in state, pair weekly status, current pair activity state, contribution score, and a non-medical `resourceMessage`.
- Profile `nextStep` uses paired context before falling back to generic profile steps: missing weekly check-in, activity feedback, current activity, weak passport, open pair, or paused-pair resume.
- `GET /api/users/me/profile-summary` also returns a relationship experience layer: `experienceSummary`, six `personalAxisCards`, private-preview `partnerHelpfulNotes`, and `needsAndBoundariesLite`. These fields are derived from existing completion, passport, onboarding, pair, and weekly check-in data; they do not add storage or sharing behavior.
- Experience copy must remain non-medical and non-accusatory: no diagnosis or therapy claims, toxic labels, blame wording, or statements that a partner is obligated to act. Client normalization provides safe low-data fallbacks when a deployment temporarily omits the new fields.
- `GET /api/users/me/today` is the daily personal read-model for `/profile`. It requires session auth, accepts optional `dateKey` (`YYYY-MM-DD`) and `timezoneOffsetMin`, and returns `PersonalTodayDTO` only. It may include the authenticated user's own private journal text and a sanitized incoming partner signal, but never exposes another user's daily answers, body context, private journal, or weekly note.
- `POST /api/users/me/daily-checkins` requires session auth, strict daily answer validation, private body visibility, and idempotency. It upserts the authenticated user's `PersonalDailyCheckIn` by `{ userId, dateKey }`, stores private journal/body context as self-only data, and may save a partner-signal draft; it never sends a partner signal by itself.
- `POST /api/users/me/daily-checkins/[id]/partner-signal` requires session auth and idempotency. The source check-in must belong to the authenticated user, the user must have an active or paused pair, and the receiver is derived from the pair membership. The response is `{ id, status: "sent", sentAt }`; the partner sees only the explicit signal text.
- `PATCH /api/users/me/relationship-lens` requires session auth and idempotency. It updates only the authenticated user's optional `profile.relationshipLens` settings, sets `source: "user_setting"` when `defaultLens` is provided, and returns the resolved lens DTO.

## References

- Detailed historical API inventory: `docs/04-api-contracts.md`.
- Backend checklist: `docs/engineering/checklists/api-endpoint-checklist.md`.
- DTO checklist: `docs/engineering/checklists/dto-contract-checklist.md`.
