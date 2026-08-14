# ForeverApp / «Вместе»: Factor operations and privacy boundaries

Status: active operational contract. Updated 2026-08-13.

## 1. Capture and purpose

Every evidence event carries one capture mode:

- `PRIVATE` — owner computation/read only; excluded from pair calculation;
- `PAIR_MODEL_ONLY` — may influence a coarse derived pair result; raw value is not partner-visible;
- `SHARED` — disclosure is allowed only in an explicit product surface/action;
- `SYSTEM_ONLY` — internal eligibility/safety use only.

Capture mode, privacy class, purpose, relationship context, policy version, consent revision and retention class must agree. Invalid combinations are rejected. A new consent revision does not retroactively broaden an older source.

## 2. Central disclosure

`src/domain/model/privacy/disclosure.ts` is the Factor disclosure policy. It distinguishes self, pair-member, matching-engine and public audiences. Pair evaluation output is summary-only; public output is withheld.

Participant surfaces — weekly, dashboard, profile, recommendation, activities, history, notifications, PartnerSignal, help, errors and audit/analytics — must not disclose a peer's:

- raw answer or note;
- exact value, delta or internal fit;
- numeric confidence, coverage or evidence count/identities;
- SafetyGate state/reason;
- sensitive topic/reason that permits reconstruction.

One-sided pair input emits no pair signal. Repeated edits/retries cannot be used as a binary-search oracle: canonical source identity, immutable snapshots, coarse qualitative projection and disclosure guards keep peer input non-reconstructable.

Owner profile/export may include the owner's own permitted records. Pair evaluation entries in export still pass the central summary-only disclosure and omit peer snapshots/values/links/hashes.

## 2A. Factor Matching purpose and disclosure

- `MatchingUseGrant` is explicit, owner/factor/revision scoped permission for the matching engine to use an eligible current snapshot. It is not permission to disclose that value to a candidate or Pair partner; missing/revoked grants fail closed.
- `PartnerPreferenceProfile` is owner-private. A candidate never receives its targets, importance, flexibility, constraint modes or hard-conflict reason.
- `CandidateDiscoveryProjection` contains only the coarse fields needed for mutual eligibility. `MatchingFeedSession` pins a maximum of 200 candidate ids and versions; its raw token is returned only as an opaque cursor component and stored only as a hash.
- `CandidatePresentationGrant` is opaque, hashed, expiring and revision/version bound. Candidate detail and Like creation require it, but authorization still derives actor/requester from the authenticated session. A client candidate id, grant or cursor can never supply `actorId`.
- Candidate DTOs disclose only public card fields plus qualitative fit label/confidence/explanations. Numeric fit/rank/contribution, raw Factor values, peer preferences, evidence/provenance and internal constraint reasons remain matching-engine-only.
- Active blocks and existing Pair membership are checked before social transition/candidate use. Pair creation from matching requires two distinct session-derived confirmations and one transactional membership claim per participant.

## 3. Safety and help

`SafetyGate` is owner-private and pair-scoped. It only narrows activity eligibility to neutral low-load fallbacks. It never changes Pair Summary, ranking weight, diagnosis or partner-visible explanation. Ending the Pair revokes it.

The private help page renders the typed, versioned `HELP_RESOURCE_CATALOG` (`help-ru-v1`): weekly privacy, PartnerSignal, lifecycle, SafetyGate and crisis limitations. Catalog validation rejects malformed version/ids/copy. Opening help never messages the partner or claims automatic diagnosis. The current Russian guidance remains generic; jurisdiction-specific resources require expert/legal review before production publication and must not be presented as an emergency service.

## 4. PartnerSignal

PartnerSignal is an explicit message, not inferred evidence or automatic disclosure:

1. the user edits a private daily-check-in draft;
2. the exact text is previewed in the UI;
3. an explicit send action confirms it;
4. one source check-in can create one canonical signal;
5. same-content retries replay; changed-content reuse conflicts;
6. the signal expires after 30 days;
7. audit stores delivery/retention metadata, not message text.

Receiver identity comes from active/paused Pair membership. The partner sees only the confirmed message, never the sender's daily body/journal or inferred state.

## 5. Pair lifecycle and context isolation

- Pair creation is invitation-only; a user has at most one active/paused membership claim.
- Pause is reversible and does not change historical evidence.
- End is terminal and transactional: membership claims are released, open cycles expire, active activities cancel, recommendations/events expire, SafetyGate is revoked, and pair-scoped PartnerSignals/notifications are removed.
- Ended Pair ids fail membership/resource guards for new reads and writes.
- Reconnect uses a new invite and a new Pair id/context. Old pair-scoped private evidence/projections are not copied into it.

## 6. Export, deletion and session revocation

Owner export is bounded by section and includes owner data plus already-authorized shared summaries. It excludes partner raw records, peer individual snapshots, private peer notes, safety reasons, secrets and internal pair hashes.

Deletion is a two-step confirmation lifecycle:

```text
PENDING_CONFIRMATION → EXECUTING → EXECUTED
                    ↘ CANCELLED
EXECUTING → FAILED → retry
```

Execution first revokes all existing session versions, ends any active Pair, then transactionally deletes the account, owner-private records and affected pair-scoped artifacts under the current `PRIVACY_MINIMAL_IMMEDIATE_DELETION` policy. The retained PrivacyRequest is pseudonymized to a one-way subject hash and contains only lifecycle evidence. A deleted cookie/session cannot be replayed.

This is destructive. Production rollout still requires a verified backup/restore process and jurisdiction-specific retention/legal approval; code behavior must not be weakened ad hoc.

## 7. Versioning and replay

Registry, definition, measurement, instrument, algorithm, snapshot and display versions are pinned where applicable. Published definitions and historical snapshots are immutable.

- Same key/version with different canonical registry/hash fails closed.
- A snapshot uses only compatible evidence/versions.
- Same inputs and versions reproduce the same input/output hash.
- A definition update creates a new registry release and later projection; it never silently rewrites history.
- Inference output is not fed back as independent evidence.

## 8. Persistence and concurrency

- Mongoose runtime uses `autoIndex: false`; release scripts own production index application.
- Canonical identities use unique indexes for registry releases, evidence source/idempotency, snapshot inputs/revisions, cycles, decisions, activities, notifications and membership claims.
- Matching adds unique/canonical identities for owner profiles/preferences/grants, feed and presentation token hashes, evaluation inputs, active directional Likes, active connections, directional blocks and social effects; feed/grant/evaluation expiries use TTL indexes.
- Evidence persistence validates a complete immutable document before its atomic insert-only upsert. `REJECTED` evidence stores provenance, the submitted value and rejection code without a normalized value; exact retries replay and changed reuse conflicts.
- Multi-document lifecycle changes use Mongo transactions where atomicity is required.
- Retryable mutations use transport idempotency or intrinsic deterministic identity plus request hashes.
- Queries are projected, lean and bounded; list APIs use cursor pagination and hard limits.
- Reconciliation repairs interrupted derived effects without creating a second canonical artifact.

## 8A. Matching additive rollout and rollback

The matching migration supports exactly `DRY_RUN`, `APPLY_ADDITIVE` and `VERIFY`. It refuses unknown source states, conflicting deterministic connections, duplicate canonical identities and unique-index blockers; apply requires explicit confirmation, creates canonical projections/social mappings/declared indexes, and unsets obsolete embedded `matching_profiles.actual` only after canonical snapshots/grants are available. It never drops extra indexes or uses a legacy numeric score as Factor input.

Production runtime remains `autoIndex: false`. Index/data preflight owns the rollout; application startup must not create matching indexes opportunistically. The current matching release harness is guarded to a dedicated database ending in `_test`; it is verification evidence, not authority to bypass the guard or mutate production.

`APPLY_ADDITIVE` may preserve an original Like status in `legacyStatus`. Keep the rollback artifact dual-readable for canonical status plus `legacyStatus` until the rollback window closes, and do not remove the compatibility field during the same rollout. This is social-schema compatibility only: legacy numeric match scores and vector artifacts stay unreadable by Factor Matching and absent from participant DTOs.

## 9. Logging, audit and observability

Never log tokens, cookies, authorization headers, raw request bodies, answers, notes, PartnerSignal text, full snapshots or deletion identifiers. Audit and product analytics are separate allowlisted envelopes. Metrics use route group, duration, outcome and low-cardinality reason codes; labels never contain user/pair ids or content.

## 10. Scale and AI boundary

The public MVP remains a deterministic modular monolith. Add indexes, query bounds, single-flight, CAS and reconciliation before adding infrastructure. Redis, queues, microservices, vector databases and LLMs are not required by the measured local profile.

Future AI may rephrase an already-approved explanation or summarize explicitly consented/redacted owner data. It may not infer SafetyGate/constraints as truth, mutate a profile without evidence, consume an entire relationship history by default, diagnose people, or send text to a partner without preview/confirmation.
