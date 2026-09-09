# Security and privacy

## Measurement sources — 2026-09-09

Measurement routes use existing session/resource guards. Owner SELF projections require actor=subject and exclude SYSTEM_ONLY and OBSERVER_REPORT. Pair use is separately revocable per test and checked against current permission revision on each shared calculation. Shared DTOs pass through central disclosure and contain no peer answers, scalar/mastery values or evidence metadata. Matching still requires MatchingUseGrant plus matchingPolicy. Owner access does not grant either consumer access. Former pair-scoped evidence is excluded from the current owner profile and new pair. Measurement sources appear only in the owner's export and are deleted by existing account execution. No session/auth or environment mechanism changes.

Status: active security boundary after the NEW_ONLY cutover and Factor Matching integration. Reviewed 2026-09-05 after the Discord Activity OAuth stabilization.

## Product expansion boundaries, 2026-09-05

- The stable public pairing code identifies an invitation recipient; it is not a session credential. Both invitation participants explicitly confirm before a Pair exists. The authenticated session remains the actor across new entry, conversation, development, workspace and economy routes.
- Conversation answers are independent and private until both participants acknowledge the disclosure notice and submit. Completed development answers and personal notes remain owner-only even for a joint practice; the partner sees completion status, not text.
- Pair context is canonicalized after resource authorization. Transactional writes fence the current active Pair lifecycle; paused pairs permit designated reads only, and ended pairs cannot read these new active workspaces. Replayed idempotency results are subject to current access checks.
- Development and shared-life mutation caches hold receipts, not private content. Clients fetch a freshly authorized view after a mutation. Shared workspace deletion cleanup covers both participants' old route caches, including mixed-case Pair paths. Export contains own results and currently accessible shared data, with bounded export limits exposed.
- Wallet rewards, purchases and collection transfers are atomic, with deterministic source identity and immutable ledger entries. A shared collection does not disclose the partner's private wallet. Household budget currencies remain separate from earned coins.
- Demo content does not produce clinical or causal claims or feed Factor evidence. Intimate preferences retain explicit skip/private behavior. Optional coarse location has a manual-city fallback; exact Discord iframe permissions still require a live check.

See [entry](ENTRY_AND_PAIRING_UPDATE.md), [matching](MATCHING_PRODUCT_UPDATE.md), [workspace](PRODUCT_WORKSPACE_UPDATE.md) and [economy](ECONOMY_UPDATE.md) for precise contracts and limits. Account-deletion failure recovery, new breakup archives and future cross-platform account linking were not implemented in this expansion.

## Authentication and session revocation

- Identity comes from the signed session cookie or signed in-memory bearer fallback accepted by `requireSession`.
- Discord OAuth code exchange validates the configured redirect marker, mirrors the Embedded SDK flow by omitting `redirect_uri` from the token request, uses the verified Discord identity server-side and returns `no-store`.
- Embedded bearer tokens stay in memory and are sent only to internal API paths; tokens/cookies are never persisted by the client or logged.
- Every issued session carries a server-side `SessionSubject` version. Logout and account-deletion confirmation rotate it, so previously signed cookies/bearers fail even before JWT expiry.
- Production cookies are `Secure`, `HttpOnly` and use the embedded-compatible SameSite policy.

## Request boundary

- Cookie-authenticated mutations and OAuth exchange pass centralized origin validation. Direct same-origin requests and the exact configured `https://<clientId>.discordsays.com` Activity origin are accepted; sibling/wildcard Activity origins and explicit cross-site requests fail closed.
- JSON mutations require a JSON media type and are bounded before parsing (shared 64 KiB; sandbox webhook 32 KiB).
- Zod rejects extra/invalid fields on strict mutation bodies.
- Private envelopes are `private, no-store` and vary on Cookie/Authorization.
- Document CSP uses a per-request nonce and Discord-compatible `frame-ancestors`. API JSON is not rendered through document CSP.
- `TRUSTED_PROXY_MODE=x-forwarded-for` is valid only behind an ingress that overwrites/validates the header. Otherwise anonymous IP identity is unavailable rather than shared globally.

## Authorization and subject integrity

- Client `userId`, `fromId`, `actorId`, Pair role and membership claims are never authoritative.
- User-by-id writes are self-only; public user DTOs contain no private profile data.
- Pair resources require active/paused membership appropriate to the operation. Activity, invite, matching, notification, SafetyGate and deletion resources have item-level owner/member guards. The current `/api/match/**` namespace contains only Factor Matching; legacy scoring behavior is absent.
- Invite acceptance uses a transaction and unique membership claim to prevent a second active Pair.
- Ended Pair ids cannot authorize new pair reads/writes. Reconnect creates a new context.
- Membership is checked before optional infrastructure/state lookup, preventing resource and future-billing probing.

## Factor/evidence integrity

- The registry is version/hash pinned; published-version mutation or mismatched evidence/snapshot versions fail closed.
- Evidence and Factor snapshots are immutable and have canonical unique identities/input hashes.
- Missing/invalid/unknown/insufficient data never becomes a neutral numeric value.
- A's observer report cannot update B's individual snapshots.
- Invalid evidence is stored only as provenance-bearing `REJECTED` input with a rejection code and no normalized value; it is excluded from aggregation and confidence.
- Raw profile/vector/passport fields cannot be written through user APIs; no direct snapshot mutation API exists.

## Factor Matching authorization and disclosure

- `MatchingProfile`, `PartnerPreferenceProfile` and `MatchingUseGrant` writes are owner-only. Matching profile activation cannot bypass required-data readiness, and an active Pair membership disables candidate matching.
- A use grant authorizes the matching engine to use one eligible owner Factor revision; it never authorizes candidate disclosure. Missing/revoked grants, stale snapshots or registry/version mismatch fail closed.
- `MatchingFeedSession` and `CandidatePresentationGrant` store token hashes, expire by TTL and bind the authenticated requester to current profile/preference/card/evaluation/registry/algorithm revisions. The raw cursor/grant is a scoped capability, not an identity credential.
- Candidate detail requires the grant header; Like creation revalidates the grant from its strict body. In both cases session subject remains actor, path/body candidate cannot change roles, and stale/mismatched grants return generic failure.
- Discovery projections contain only coarse mutual-eligibility fields. Candidate output contains public card plus qualitative fit; it never exposes numeric rank/fit/contribution, raw Factor values, peer preferences, evidence, hashes or internal hard-constraint reasons.
- Like, response, decision, block and connection transitions authorize the concrete session participant and current role/state inside idempotent/CAS/transaction boundaries. Active block and Pair-membership checks fail closed.
- `REQUEST` and `CONFIRM` must be performed by two distinct authenticated connection participants. A unilateral/replayed confirmation cannot form a Pair; the successful transaction creates one Pair and one source-tagged membership claim per user.
- Matching audit/social effects record allowlisted event/revision/resource metadata only. Social `EventLog` rows use a deterministic identity and commit with the matching transaction; card/preference audit retries use the same idempotent identity. Candidate grants/cursors, answers, cards, preferences, Factor internals and block-sensitive explanations are excluded from logs and analytics.

## Participant disclosure

Central policy distinguishes owner, pair member, matching engine and public audiences. Pair-facing DTOs do not expose:

- peer raw answers, notes, journal or questionnaire rows;
- exact peer/Pair values, deltas, averages or internal fit;
- numeric confidence, coverage or evidence count/identities;
- Factor hashes/provenance, raw activity feedback or `stateMeta`;
- SafetyGate state, owner or reason;
- overall compatibility, six-axis passport/radar or diagnosis.

One-sided weekly input produces no pair signal. Pair Summary is capped at four qualitative signals. History reads previously published immutable projections rather than recomputing private inputs. Notification copy is allowlisted and neutral. Removed diagnostics/insights routes cannot bypass the projection.

Direct Partner Factor disclosure is summary-only for consented `NORMAL`/`PRIVATE` definitions and never contains `FactorValue`. `SENSITIVE` and `MATCHING_ONLY` definitions fail closed for the partner even when a generic partner-disclosure consent is present.

Owner-only profile/export may expose the owner's own allowed information. Exported pair evaluations still pass summary-only disclosure and omit peer snapshot/value/provenance. Global negative-disclosure tests must cover all participant routes and replay envelopes.

## SafetyGate and help

SafetyGate stores only a pair-scoped owner boolean and retention metadata. It can only remove activity eligibility; it never changes Pair Summary/ranking or emits a partner notification/reason. Pair end revokes it.

Private help access does not notify the partner. Its typed, versioned `help-ru-v1` catalog is runtime-validated and explains privacy/control boundaries plus crisis limitations. The app does not claim to detect violence, provide emergency response, therapy or medical advice. Jurisdiction-specific crisis content still requires expert/legal review before production publication.

## PartnerSignal

- A daily-check-in signal is a private draft until the user explicitly confirms send.
- Receiver comes from active/paused Pair membership.
- Unique `sourceCheckInId` makes same-content retry idempotent and changed-content reuse a conflict.
- Transport idempotency fingerprints canonical trimmed text through a domain-separated digest; neither the raw signal nor length-only substitutes are stored in idempotency records. Owner-private daily strings use the same content-sensitive hashing boundary.
- TTL removes signals after 30 days.
- Audit contains only `EXPLICIT_CONFIRMED` and retention class; it never stores text.
- The receiver sees the confirmed text only, not the source journal/body context or an inferred state.

## Pair end, export and deletion

Pair end transactionally releases membership and closes open cycles, activities, decisions/events, SafetyGate, PartnerSignals and notifications. Reconnect starts a new Pair and does not carry old pair-scoped private projections.

Weekly cycle materialization, submission claims, skips and post-check-in synchronization write a `Pair.lifecycleRevision` fence in the same Mongo transaction as their cycle, snapshot, Factor and notification writes. An ended Pair can only reconcile an already-existing expired cycle through the internal historical path; that path cannot create an open cycle or participant notification.

Lazy activity-recommendation Factor materialization acquires an `active|paused` Pair `lifecycleRevision` write fence in its own transaction before reading or writing pair-scoped evidence, snapshots or evaluations. The same Mongo session is propagated through the complete Factor operation. If Pair end wins the race, the fence fails closed and the ended context receives no new immutable Factor revisions.

Deletion uses explicit two-step confirmation. Execution revokes sessions before destructive work, ends active Pair, deletes the account and owner/affected pair-scoped artifacts, including pairless owner/actor/observed-subject rows from `factor_evidence_events`, then retains only a pseudonymized request lifecycle record. A failure is recorded as `FAILED` for retry; it must not falsely report deletion. Export/deletion queries are owner-scoped and bounded.

This deletion policy affects shared Pair artifacts. Production use therefore still requires approved jurisdiction/retention terms, verified backup/restore and clear user copy; the runtime behavior is nevertheless implemented and tested locally.

## Abuse, replay and concurrency

- Auth, invite, weekly, recommendation/activity, notifications, privacy and sandbox webhook boundaries use Mongo-backed rate limits appropriate to the route.
- Retryable mutations use Mongo-backed idempotency leases/request hashes or intrinsic canonical identities.
- Same key/body replays; changed-body reuse conflicts. A failed/expired lease can be taken over only under documented rules.
- Transactions/CAS/unique indexes protect membership, cycle/snapshot, decision/activity, notification, signal and deletion identities.
- Per-Pair recommendation single-flight is acquired only after membership authorization, preventing cross-member disclosure while reducing duplicate work.

## Logging, audit and analytics

Never log or persist in shared audit/analytics:

- access/refresh/session tokens, cookies, authorization headers or secrets;
- raw request bodies;
- answers, notes, journals, PartnerSignal text or full questionnaire/check-in payloads;
- exact Factor values/confidence/evidence/hash or SafetyGate reason;
- raw duplicate keys containing user/pair identity.

Audit metadata is event-specific and sanitized. Product analytics is a separate allowlisted low-cardinality envelope. Operational metrics contain route group/outcome/duration, not content or participant identifiers.

## Isolated billing boundary

Sandbox billing/webhook/admin grant code remains disabled by default and HMAC/admin protected when enabled. It is not imported into public core eligibility. Core API access cannot reveal or depend on subscription state and never returns payment-required errors.

## Review rule

Any change touching auth, Pair/user/activity resources, evidence/disclosure, export/deletion, PartnerSignal, logs or DTOs must report its security impact and run the relevant targeted checks in [TESTING.md](./TESTING.md).
