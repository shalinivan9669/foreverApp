# API Contracts

## Product expansion — 2026-09-05

The accepted product expansion adds owner entry/cohort/public pairing identity, two explicit PairInvite confirmations, three-block/three-question matching, independent Connection rounds, development runs, shared-life workspace and earned-only economy. These current contracts take precedence over earlier two-question/three-step descriptions below:

- [Entry and PairInvite contracts](ENTRY_AND_PAIRING_UPDATE.md): `GET|PUT /api/users/me/entry`, recipient claim, creator `POST /api/pair-invites/:id/confirm`.
- [Matching contracts](MATCHING_PRODUCT_UPDATE.md): recipient response creates Connection; concrete statement reactions, `/withdraw`, pause/resume/close and independent conversation rounds.
- [Development and shared-life contracts](PRODUCT_WORKSPACE_UPDATE.md): `/api/development/**`, `GET|POST /api/pairs/:id/shared-life`. Mutations cache receipt identifiers only; current private/shared state is read separately through guarded GET. Development detail/completion resolves the run's exact published revision and response options. A missing publication returns `409 CONTENT_VERSION_UNAVAILABLE`; a newer latest revision no longer invalidates an existing run. Access denial takes precedence. Overview `recent` now includes up to 30 unfinished plus up to 30 completed accessible runs, with unchanged DTO fields.
- [Economy contracts](ECONOMY_UPDATE.md): `/api/economy/**`, personal wallet/inventory and separate Pair collection. Prices/rewards/random outcomes are server-controlled; no reward-claim HTTP endpoint or real payments.

All new private APIs derive the actor from the session. Replay authorization precedes cached results where applicable. Owner export adds `productWorkspace`, `economy` and own Matching conversation answers; peer-private reflection answers are excluded.

`GET /api/development/runs?cursor=` adds a separate unfinished-run list without changing overview: `{ runs: DevelopmentRunDTO[], nextCursor: string | null }`, fixed maximum 30 rows, `ACTIVE`/`PARTIAL` only, descending `createdAt` and `_id`. Omit query for the first page; only the opaque versioned cursor is accepted for continuation. Authentication precedes query validation. Every page rechecks session ownership, current active/paused Pair resource access and paid-content access before limiting results. Invalid cursor returns `400 VALIDATION_ERROR`; a changed actor/Pair/access scope returns `409 RUN_LIST_CHANGED` and requires restarting the list. The cursor is a position, never an access grant. DTOs omit completion answers/private notes and responses use the standard private, no-store envelope. See [workspace behavior](PRODUCT_WORKSPACE_UPDATE.md).

Status: current public/participant boundary after the Factor NEW_ONLY/free-core cutover and Factor Matching integration. Reviewed 2026-09-05 after the Discord Activity OAuth stabilization.

## Envelope and caching

Success:

```ts
{ ok: true, data: T, meta?: Record<string, unknown> }
```

Error:

```ts
{ ok: false, error: { code: string, message: string, details?: unknown } }
```

Use semantic HTTP statuses (`400`, `401`, `403`, `404`, `409`, `413`, `415`, `422`, `429`, `500`, `503`). Unexpected infrastructure failures return generic `500 INTERNAL` without stack/database/index/topology details. Private responses are `private, no-store` and vary on credentials.

No core endpoint returns `402`, `PAYMENT_REQUIRED` or `ENTITLEMENT_REQUIRED`. Rate-limit/idempotency errors remain possible because abuse/retry safety is independent of billing.

## Handler and mutation rules

- Authenticate with `requireSession`; the session subject is authoritative.
- Validate params/query/body with shared Zod helpers. JSON mutations require JSON media type, same-origin policy for cookie auth and the shared 64 KiB streaming limit unless a stricter route limit applies.
- Authorize the concrete Pair/activity/invite/resource before reading or mutating its state.
- Keep route handlers thin; map domain errors at the boundary.
- Retryable writes require transport idempotency or an explicitly documented intrinsic deterministic identity.
- Multi-document invariants use transactions/CAS/unique indexes.
- Return DTOs only; never serialize a Mongoose document.
- Do not accept client `userId`, `fromId`, `actorId`, member role, score, confidence or Factor result as authoritative.

## Auth and user

| Endpoint | Contract |
| --- | --- |
| `POST /api/exchange-code` | Accepts only direct same-origin or the exact configured app-id `discordsays.com` Activity origin, validates `redirect_uri` against the configured marker, exchanges the Embedded SDK code server-side without adding `redirect_uri` to the Discord token request, upserts verified minimal identity, issues session cookie plus in-memory bearer fallback, and returns `no-store`. |
| `POST /api/auth/logout` | Revokes all current server-side session versions for the authenticated subject and clears the session cookie. Replay of an old signed token fails. |
| `GET /api/users/me` | Owner DTO with derived lifecycle/profile status. |
| `GET /api/users/[id]` | Authenticated public-user DTO only. By-id writes are self-only. |
| `GET /api/users/me/profile-summary` | Owner-only semantic Factor profile: user identity plus registry-versioned cards/status and qualitative confidence/freshness bands. No Factor value, evidence id, axis, passport or compatibility score. |
| `GET/PATCH /api/users/me/mvp-onboarding` | Resumable owner-only, versioned consent/closed answers. Exact owner values may be returned for resume; compatible bindings materialize Factor evidence/snapshots. |
| `GET /api/users/me/today` | Owner daily read model; may include own journal and sanitized incoming confirmed signal only. |
| `POST /api/users/me/daily-checkins` | Strict owner-private daily source, intrinsically idempotent. Saving a signal draft does not send it. |
| `POST /api/users/me/daily-checkins/[id]/partner-signal` | Explicit confirmed send. Source check-in must be owned by caller; receiver is derived from Pair. Same text replays, changed text conflicts; response is only `{ id, status, sentAt }`. |

Profile/user writes reject legacy vector/embedding/passport fields. There is no API for mutating a Factor snapshot directly.

## Factor Matching

All endpoints below require session auth and are free core. The session subject is the only actor/requester; supplied ids, candidate grants and cursors never override it. Every mutation requires the shared idempotency key and strict JSON body. Reads and writes are rate-limited, private and `no-store`.

| Endpoint | Contract |
| --- | --- |
| `GET /api/match/card` | Returns the owner's standalone matching card/settings plus revision/readiness/missing required topics. Owner exact input is permitted; no peer Factor data is returned. |
| `POST /api/match/card` | Idempotently creates/revises the owner's card (`requirements[3]`, `give[3]`, `questions[2]`), age/distance/active settings and strict reviewed actual inputs. Activation fails unless required Factor-backed data is ready. |
| `GET /api/match/card/[id]` | Returns one candidate public card and qualitative fit only when `X-Candidate-Grant` is valid for the session requester, path candidate, evaluation, pinned revisions/versions and expiry. |
| `GET /api/match/preferences` | Owner-only revisioned desired Factor targets plus use-grant state and current registry version. |
| `PUT /api/match/preferences` | CAS/idempotent update with `{ revision, preferences[] }`; validates factor eligibility, target type, importance, flexibility, constraint mode and `useAllowed`. Hard constraint is definition/policy restricted. |
| `GET /api/match/feed?cursor=&limit=` | Returns a bounded cursor page of `{ candidate, public card, qualitative fit, candidateGrant }` and `feedRevision`. A fresh read creates a hashed/expiring, max-200 `MatchingFeedSession`; stale actor/profile/preference/registry/algorithm cursors return conflict. |
| `GET /api/match/inbox?cursor=&limit=` | Bounded/cursor-paginated incoming/outgoing Like summaries plus actor-visible connections and allowed actions. |
| `GET /api/match/like/[id]` | Participant-only Like detail; role/state determine which card/questions/answers/actions are visible. Non-participants receive generic not-found behavior. |
| `POST /api/match/like` | Requires `{ candidateId, candidateGrant, agreements: [true,true,true], answers: [string,string] }`. Grant and session actor are revalidated; retry/race converges on one directional active Like. |
| `POST /api/match/respond` | Recipient-only `{ likeId, agreements: [true,true,true], answers: [string,string] }`; exact replay is a no-op and changed reuse conflicts. |
| `POST /api/match/accept`, `POST /api/match/reject` | Role/state-guarded `{ likeId }` decision. Acceptance after response creates/links one canonical `MatchingConnection`; it does not create a Pair. |
| `POST /api/match/block` | Directional `{ blockedUserId }`; closes eligible active Likes/unpaired connection work without disclosing the peer's state. |
| `DELETE /api/match/block/[id]` | Revokes the caller's directional block. It never resurrects old Likes or connections. |
| `GET /api/match/connections/[id]` | Participant-only qualitative connection/stage/confirmation/allowed-action DTO; no internal evaluation or peer private data. |
| `POST /api/match/confirm` | `{ connectionId, action: "REQUEST" | "CONFIRM" | "CANCEL" }`. `REQUEST` confirms only its actor; `CONFIRM` must come from the other authenticated participant. The second confirmation transactionally creates one Pair and source-tagged membership claims. |

Participant fit is limited to `PROMISING | WORKABLE | LOW_INFORMATION`, `LOW | MEDIUM | HIGH` confidence and at most three reviewed explanations. Numeric score/fit/ranking/contribution, raw Factor values, peer preferences, evidence/hashes and internal hard-constraint reasons are never returned.

## Pair invitation and lifecycle

| Endpoint | Contract |
| --- | --- |
| `POST /api/pair-invites` | Creates a 32-byte one-time token. Only SHA-256 hash is stored; raw token appears once in a `no-store` response. |
| `GET/POST /api/pair-invites/[id]...` | Owner status, cancel and reissue. Reissue invalidates the old invite and returns a new one-time token. |
| `POST /api/pair-invites/resolve` | Accepts token in JSON body and returns a generic bounded preview/unavailable state. |
| `POST /api/pair-invites/accept` | Transactional/session-derived acceptance. Rejects self-pair and second active membership; concurrent accepts converge on one Pair. |
| `GET /api/pairs/me`, `GET /api/pairs/status` | Current session user's active/paused context only. |
| `POST /api/pairs/[id]/pause`, `/resume` | Member-only lifecycle transitions. |
| `POST /api/pairs/[id]/end` | Requires idempotency and `{ confirmation: "END_PAIR" }`. Ends the context and closes/revokes active pair-scoped work; returns `endedAt`. |

`POST /api/pairs/create` is a guarded compatibility seam: it cannot activate a Pair and returns `409 PAIR_INVITE_REQUIRED`. Pair formation is allowed only through accepted invite or two-party-confirmed `MatchingConnection`; both write the same one-claim-per-user invariant with source provenance. A new connection after end uses a new invite or new matching connection and receives a new Pair id. Ended pair ids do not authorize new reads/writes.

## Weekly cycle and Pair Summary

| Endpoint | Contract |
| --- | --- |
| `POST /api/checkins/weekly` | Strict explicit answers for the authenticated member. Pair identity is `{ userId, pairId, weekKey }`; values are immutable for the accepted revision, note is owner-private, retries/concurrency converge. Valid input materializes Factor evidence/snapshots. |
| `GET /api/checkins/weekly/current?pairId=...` | Returns only the caller's exact owner check-in for that scope/week. |
| `GET /api/pairs/[id]/weekly-checkin/current` | Separates owner check-in from pair projection. Pair section contains relative completion, data status and at most four qualitative signals; no peer values/notes/metrics. |
| `GET /api/pairs/[id]/weekly-cycle/current` | Server-owned UTC/ISO cycle window, relative member statuses, semantic snapshot provenance and safe Pair Summary. Future cycles fail before materialization. |
| `POST /api/pairs/[id]/weekly-cycle/current` | Empty strict body; skips only the authenticated member. Submit/skip races are lease/CAS protected. |
| `GET /api/pairs/[id]/summary` | Member dashboard DTO: safe pair/member identity, current activity, bounded offer fact, owner completion and next step derived from the canonical weekly projection. |

Weekly form fields start untouched in the UI; the server still requires all mandatory typed fields. Explicit neutral is a submitted value, while untouched/missing is rejected or remains unavailable. One submit publishes no pair signal; two valid submits create one canonical summary. There is no cycle-number or entitlement gate.

The old `/api/pairs/[id]/diagnostics` and insights routes are removed. They are not compatibility sources and cannot return a passport or numeric score.

## Questionnaires

- `GET /api/questionnaires`, `GET /api/questionnaires/[id]`, `GET /api/questionnaires/cards` and activity-template catalogs require session auth and return only reviewed/published semantic content.
- Questionnaire DTOs expose semantic `domainKey`, `topicKey`, `optionCount` and content revision, never legacy axis/vector mappings.
- `POST /api/questionnaires/[id]` requires one complete explicit answer per known question and stores an immutable owner-private `PersonalQuestionnaireSubmission`. Exact-content retries converge. If content has no reviewed measurement binding, status remains `UNMAPPED` and no Factor evidence is invented.
- Pair questionnaire start/answer routes require an active Pair, store private source rows and return acknowledgements/session progress without partner raw answers or profile mutation. Their response shapes are unchanged. A transaction-level Pair lifecycle fence serializes start/answer against pause/end; at most one `in_progress` session exists per `{pairId, questionnaireId}`, and an answer is immutable and unique by `{sessionId, questionId, by}`. Pair end closes every remaining `in_progress` session with `status=closed`; terminal sessions reject new writes.
- `/api/questions` and `/api/answers/bulk` are removed.

## Recommendations, PairEvents and activities

| Endpoint | Contract |
| --- | --- |
| `GET /api/pairs/[id]/recommendations` | Returns safe current/history decisions for a member. |
| `POST /api/pairs/[id]/recommendations` | `{ action: "offer" }` or `{ action: "accept" | "replace" | "skip", decisionId }`; requires idempotency. One current decision per pair/cycle, one replacement, one accepted activity. |
| `/api/pairs/[id]/suggest`, `/activities/suggest`, `/api/activities/next`, `/activities/from-template` | Guarded free compatibility adapters over current Factor-bound activity policy. They cannot invoke legacy diagnostics or create an unbound activity. |
| `GET /api/pairs/[id]/events` | Member-only active/all PairEvent DTOs. Events must carry current Factor registry/action target binding and a safe source kind. |
| `POST /api/pairs/[id]/events/[eventId]/accept|decline|snooze` | Member/idempotency/state guarded. Accept may create only bounded, Factor-bound activity DTOs and does not read either member's private SafetyGate; raw source metadata stays internal. |
| `POST /api/activities/[id]/accept|start|cancel` | Activity-member, state-machine and idempotency guarded lifecycle mutations. |
| `POST /api/activities/[id]/checkin` | Validates the current closed feedback schema and replaces only caller's answer revision. Returns safe aggregate status, never peer answers. |
| `POST /api/activities/[id]/complete` | Requires feedback, returns qualitative result. One-sided feedback can be partial; late peer feedback refines once. Factor evidence/snapshots are internal. |

Recommendation/activity participant DTOs omit SafetyGate state, template/internal provenance, Factor values, confidence, evidence ids, internal rank, exact feedback and `stateMeta`. SafetyGate changes only its owner's offered-action visibility and acceptance eligibility, yielding an owner-local neutral fallback/error without changing shared state, Pair Summary, PairEvent, current activity or history.

## History and notifications

- Owner-approved addition, 2026-09-09: `GET /api/pairs/[id]/activities?activityId=<24-hex-id>` selects one exact activity before the existing bounded list scan. The response remains a DTO array with zero or one item; the optional `s` filter, when supplied, still intersects the selection. Session authentication, Pair membership, role/visibility/assignment and existing offered-activity disclosure checks all apply. Invalid selectors return `400`, unauthenticated requests `401`, inaccessible Pair contexts `404`; a missing, differently scoped or role-inaccessible activity yields an empty array. Responses remain `private, no-store`.
- Guarded activity reads include `feedbackSubmitted: boolean` for the current session actor only, derived from that actor's role-presence in stored feedback or completion. It is available before a result summary exists. Other activity DTO producers may omit the field when they have no viewer role; clients must not treat absence as confirmed lack of feedback. No feedback values, raw answers, peer roles, source counts or notes are added. The existing history-item `feedbackSubmitted` remains an aggregate presence flag and must not be interpreted as the viewer's completion.

- `GET /api/pairs/[id]/history?cursor=&limit=` is member-only, `no-store`, cursor-paginated and bounded. It reads published immutable derived artifacts; raw check-ins/notes and current-code recomputation of old history are forbidden.
- `GET /api/notifications?cursor=&limit=` is owner-only with maximum 50. `POST /api/notifications/[id]/read` is owner-scoped and idempotent. DTO shape is unchanged; `action.href` now addresses an owned Pair cycle, activity or recommendation. Pair/resource IDs may occur in these navigation URLs; dedupe IDs, Factor topics, answers and safety state remain omitted. Current Pair lifecycle and task completion determine the neutral message/action. Reading does not complete a task. New pair notices populate the existing optional `resourceId`; older notices without an address explicitly direct the user to check the current Pair step without guessing a historical record. URLs confer no access.

## Safety, export and deletion

| Endpoint | Contract |
| --- | --- |
| `GET/PUT /api/users/me/safety-gate?pairId=...` | Owner-only boolean control; no free text/reason. It narrows only that owner's offered-action visibility/acceptance; partner and shared reads remain byte-for-byte independent of the private state. |
| `GET /api/privacy/export` | Bounded owner export plus allowed shared summaries. Excludes partner raw sources/snapshots/notes, exact pair internals, secrets and SafetyGate reasons. |
| `GET/POST/DELETE /api/privacy/deletion-request` | Read, create or cancel the caller's `privacy-request-v2`; mutation is rate-limited and idempotent by current owner state. |
| `POST /api/privacy/deletion-request/execute` | Requires `{ confirmation: "DELETE_ACCOUNT" }`. Revokes sessions, ends active Pair, deletes account/owner and affected pair-scoped artifacts, pseudonymizes the retained request and clears cookie. Retry is allowed after `FAILED`. |

## Health and isolated billing

- `GET /api/health/live` reports only liveness; `GET /api/health/ready` performs bounded config/Mongo checks without environment detail.
- `POST /api/billing/webhooks/sandbox` and `POST /api/entitlements/grant` remain protected, disabled/isolated infrastructure. Their state never determines access to the public core flow.
- The current `/api/match/**` routes expose Factor Matching only. Retained legacy status/card data may be migration input, but legacy `matchScore`/vector data is never authorization, candidate intelligence, Pair-activation evidence or participant output.

## Measurement tests and owner interpretations — 2026-09-09

All routes use the current session as the subject and the standard envelope. Definitions and formulas: [measurement contract](FACTOR_MEASUREMENT_CONTRACT.md).

| Endpoint | Contract |
| --- | --- |
| `GET /api/measurements` | Six publications with own NEW/DRAFT/FINALIZED state, pinned content, own answers and permission revisions. |
| `GET /api/measurements/[key]` | Own canonical test; reconciles committed sources and current pair. READY only after success; PENDING preserves closed answers and offers retry. |
| `POST /api/measurements/[key]` | Strict actions: start, draft, finalize, permission, retry. Draft/finalize: expectedRevision, answers [{questionId,choice:1/2/3/null}], pairUse. Permission: expectedPermissionRevision, pairUse. Start/retry have no other fields. |
| `GET /api/pairs/[id]/factor-profile` | Active/paused member only: six shared interpretations, next actions and evaluation revisions. No raw values, answers, confidence, evidence counts or peer source identifiers. Ended/foreign contexts denied. |
| `GET /api/users/me/profile-summary` | Adds owner value presentation, meaningful scales, bounded own history, kind and next action. Compatible sources replay; unavailable versions are labelled. |
| `GET /api/questionnaires/[id]` | Adds ownSubmission for the caller only. Unmeasured submissions stay unmeasured and closed; answers display against matching content only. |
| `GET /api/privacy/export` | Workspace section includes own pinned measurement sources, answers and current pair permission. Account execution deletes these sources. |

Final identity is owner + stable test key, independent of week/version/pair. Exact retry returns stored result; changed final answers return TEST_ALREADY_COMPLETED (409). Stale draft/permission revisions return TEST_DRAFT_STALE/PERMISSION_STALE (409). Invalid/incomplete answers return VALIDATION_ERROR (400). Missing owner/test returns 404. CONTENT_VERSION_UNAVAILABLE (409) never opens a replacement attempt. No owner/actor identifier is accepted in the strict mutation schema.

Ordinary personal questionnaires and library reflections preserve the first stable completion. Pair questionnaire start returns ownAnswers plus in_progress/completed; reload resumes unsent questions or shows the closed own part. The session pins immutable questionnaireVersion; missing/incompatible legacy publications return CONTENT_VERSION_UNAVAILABLE and preserve sources. Recorded participant answers cannot be replayed into a new pair. Unmapped publications remain reflection without synthetic factors.

## References

- [Security](./SECURITY.md)
- [Factor model](./TARGET_DOMAIN_MODEL.md)
- [Historical API inventory](./04-api-contracts.md) — archaeology only
