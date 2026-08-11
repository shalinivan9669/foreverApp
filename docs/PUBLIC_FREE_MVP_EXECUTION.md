# Public Free MVP execution ledger

Status: active ledger for the `BROAD_REFACTOR` approved 2026-08-11. Do not mark a gate complete without evidence from the current tree.

Priority: attached master prompt → attached Factor specification → active docs → current code → historical notes.

## Phase 0 — audit

- [x] Read both supplied files and mandatory repository context.
- [x] Record baseline checks and legacy gaps.
- [x] Classify NEW_ONLY/free-core cutover and distribute focused audits.

## Phase 1 — semantic Factor Engine

- [x] Typed values and explicit `MISSING`/`INVALID`/`UNKNOWN`/`INSUFFICIENT_DATA`.
- [x] Versioned registry/hash/validation/idempotent seed.
- [x] Immutable evidence with provenance/capture/consent/retention.
- [x] Immutable individual, pair and evaluation snapshots plus deterministic replay.
- [x] All ten typed pair strategies and confidence/insufficient behavior.
- [x] Central disclosure and deterministic action recommendation.

## Phase 2 — NEW_ONLY consumers

- [x] Onboarding and weekly materialize semantic evidence/snapshots.
- [x] Questionnaire sources are immutable/owner-private; unmapped content fails closed.
- [x] Pair Summary reads Factor evaluations only.
- [x] Recommendation/action and activity feedback use Factor bindings/evidence only.
- [x] Profile returns semantic cards and no axis/passport score.
- [x] PairEvent uses registry/action targets and guarded legacy retirement.
- [x] Legacy vectors/diagnostics/services/models/routes/UI/fallback removed.
- [x] Guarded raw-source replay migration; aggregate legacy scores are never converted.

## Phase 3 — free product

- [x] Core invite/Pair/weekly/recommendation/activity mutations no longer gate on entitlement; public legacy match mutations are removed.
- [x] Paywall/price/trial/purchase UI removed from active flow.
- [x] Three complete cycles passed with no entitlement.
- [x] Billing/webhook/admin infrastructure remains disabled and isolated.

## Phase 4 — lifecycle, privacy and help

- [x] Invite cancel/reissue/expiry/accept and Pair pause/resume/end/reconnect.
- [x] Old Pair id denies new access; new connection creates a new context.
- [x] PartnerSignal explicit draft/confirm/send, source uniqueness, TTL and text-free audit.
- [x] SafetyGate is owner-private and revoked at Pair end.
- [x] Bounded history/notifications and Pair end cleanup.
- [x] Bounded export, deletion request/cancel/execute and durable session revocation.
- [x] Private, versioned Russian help catalog (`help-ru-v1`) with no partner notification, automatic diagnosis or hidden contact.
- [ ] Expert/legal review and jurisdiction-specific resource publication approval (external/content work remains).

## Phase 5 — frontend

- [x] Legacy radar/passport/diagnostics/paywall/placeholder surfaces removed.
- [x] Core entry/onboarding/invite/weekly/summary/recommendation/activity/profile/settings/privacy/help/lifecycle screens connected.
- [x] Local production-browser fallback/onboarding report for 320/360/390/430: no horizontal overflow, all visible controls labeled, retry control responds, no console errors.
- [ ] Authenticated Discord browser plus physical-device keyboard/focus/safe-area validation (external).
- [ ] Two independent real Discord sessions (external).

## Phase 6 — verification evidence

- [x] Factor, value, strategy, registry, immutability, replay, version and disclosure selfchecks.
- [x] Three-cycle free Mongo E2E: W33/W34/W35, six submissions, three summaries/recommendations/activities, separate feedback/history, 23 notifications.
- [x] Legacy cutover/startup-without-legacy check.
- [x] Privacy lifecycle integration and destructive deletion/session-revocation coverage.
- [x] Fresh Factor migration/index/preflight: registry v6, 28 Factor + 97 remaining indexes, no drift, 72 blockers green.
- [x] Legacy Pair unique-index fixture failed closed, migrated explicitly, then passed.
- [x] Two strict load runs: required dashboard/history/recommendation p95 green, zero errors/conflicts/duplicates.
- [x] Participant-disclosure selfcheck passed after privacy response hardening.
- [x] Guarded replica-set reliability/reconciliation run passed.
- [x] Final current-tree `lint`, `check:types`, `check:self`, `check:agents`, `build`, `git diff --check` and unchanged-tree `npm audit --omit=dev` recorded together.
- [x] Critical deletion, weekly/activity/Factor lifecycle replica-set races passed after final fixes.
- [x] Local production-browser responsive/fallback smoke recorded; authenticated/physical-device coverage remains external.

## Phase 7 — docs and reviews

- [x] Active README/product/domain/architecture/API/security/testing/release/scale/status docs synchronized.
- [x] ADR-008 records NEW_ONLY/free-core decision; historical docs are clearly marked.
- [x] Independent architecture review.
- [x] Independent privacy/security review.
- [x] Independent release/performance review.
- [x] Confirmed findings fixed and impacted/full gates repeated.

## Decisions

- No permanent dual-read, feature flag or legacy fallback.
- Missing/unavailable data is never neutral evidence.
- Domain is grouping; Factor owns semantics/strategy/privacy.
- Personal, observer and Pair evidence are distinct subjects.
- Pair participant disclosure is qualitative/non-reconstructable.
- Core is free for every cycle; abuse controls remain, monetization does not.
- Reconnect is a new Pair context; deletion is explicit/destructive and revokes sessions.
- Rollback must stay NEW_ONLY-compatible.

## Defects and results

- Baseline found six-axis fields/services/UI, invalid-to-midpoint behavior, cycle entitlement, untouched slider defaults, incomplete lifecycle/deletion/settings/help and vector-mutating feedback.
- Factor core and all ten strategies passed focused selfchecks.
- Activity Factor runtime registry mismatch caused by spreading Mongoose subdocuments was fixed with explicit copies; targeted checks and E2E passed afterward.
- Questionnaire content without reviewed measurement binding remains intentionally `UNMAPPED`; it creates no invented Factor.
- Per-Pair recommendation single-flight was moved after membership guard and brought both strict load runs below required p95 targets without privacy weakening.
- Versioned `help-ru-v1` catalog is implemented and runtime-validated; expert/legal review and jurisdiction-specific publication approval remain external content gates.

## Final Definition of Done

Implementation and local database/performance evidence are complete. Final local release status remains open only for the exact-tree static/build/browser checks and three independent reviews above; production status additionally requires the explicitly external gates in `MVP_RELEASE_STATUS.md` and `RELEASE_RUNBOOK.md`.
