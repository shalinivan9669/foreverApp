# MVP release status

## Current local evidence, 2026-09-05

The owner-approved expansion is implemented in the working tree; see [PRODUCT_IMPLEMENTATION.md](PRODUCT_IMPLEMENTATION.md) for the exact feature and test matrix. Current lint, nonincremental types, production build, 46 selfcheck suites and changed-file agent checks pass. Eight bounded integration suites now pass against a temporary local MongoDB replica set, including entry, matching social flow/Pair transition, economy, shared life and event settings. The earlier statement below that no local transaction database is available is historical.

This evidence does not set `ATLAS_VALIDATED` or `DISCORD_VALIDATED` to passed. The complete older release integration matrix has not been rerun, a production target has not been checked, and no immutable deployment artifact has been assigned. `PUBLIC_READY=NO` remains until the relevant target and two-account checks are complete. The following tables retain the August release snapshot; use the linked current matrix for the expanded working tree.

Status: Factor Matching implementation and all locally available same-tree code gates pass, but `CODE_COMPLETE=NO` because the mandatory transaction/race/security integrations require an unavailable guarded replica-set/Atlas test database. Earlier public-free NEW_ONLY baseline evidence remains recorded below; it does not certify the current Factor Matching tree. Updated 2026-08-13. Production/real-Discord deployment is not claimed, and no immutable release artifact is assigned from the dirty working tree.

## Factor Matching release gates

| Gate | Current value | Required evidence |
| --- | --- | --- |
| `CODE_COMPLETE` | **NO** | `verify:matching:code`, lint, types, selfchecks, agents, build and diff passed, but required transaction-capable matching integrations were `NOT RUN` without `MATCHING_TEST_MONGODB_URI` |
| `ATLAS_VALIDATED` | **NOT RUN** | `verify:matching:release` against an approved replica-set/Atlas database supplied through guarded `MATCHING_TEST_MONGODB_URI`; no URI/evidence is present |
| `DISCORD_VALIDATED` | **NOT RUN** | End-to-end profile → feed → Like → connection → two-party Pair confirmation with two real Discord accounts/sessions |
| `PUBLIC_READY` | **NO** | All preceding gates plus production preflight/index/rollback/observability/go-no-go evidence |

| Capability | Status | Implementation | Recorded evidence | Remaining gate |
| --- | --- | --- | --- | --- |
| Factor Engine and registry | DONE | Typed values, registry v6, algorithm v4, immutable snapshot v3, all ten strategies, replay/disclosure/recommendation | Factor selfcheck and persistence/cutover work; fresh migration/preflight passed | Production target dry-run |
| Legacy six-axis/scoring removal | DONE baseline | Vector/diagnostics scoring and numeric compatibility UI remain absent; `/api/match/**` now hosts Factor Matching rather than a legacy fallback | Earlier legacy-cutover/disclosure evidence; current matching verification pending | Rerun on final matching tree |
| Factor Matching | PENDING VERIFICATION | Standalone MatchingProfile/preferences/use grants, bounded feed/presentation grants, qualitative evaluation, Like/connection/block and two-party Pair transition | Implementation present; no final same-tree code/Atlas/Discord evidence recorded here | Complete the four Factor Matching gates above |
| Discord auth/session | PARTIAL | Central subject, request guards, persistent session version and expiring account-write leases, logout/deletion revocation | Security/release selfchecks and deterministic deletion/writer races | Two real Discord sessions, production secrets |
| Onboarding/questionnaires/profile | DONE | Semantic onboarding; immutable owner questionnaire; Pair-fenced unique questionnaire sessions/answers; semantic profile cards | Questionnaire integrity selfcheck plus deterministic replica-set concurrency/migration integration; target-preflight output is aggregate-only and failure-code sanitized | Target duplicate preflight/additive indexes; content/usability review |
| Invite and Pair | DONE baseline; matching path pending | Hash-only invite plus generalized membership claim; matching path requires two distinct connection confirmations | Invite race/retry baseline; matching pair-transition verification pending | Matching Atlas suite and two-real-account run |
| Weekly/Pair Summary | DONE | Untouched explicit UI, Factor materialization, insufficient/qualitative projection | Weekly checks; three-cycle E2E | Real-session/manual UI run |
| Recommendation/activity | DONE | Factor-bound one-decision/one-replacement loop, separate feedback evidence | Activity checks, three-cycle E2E, strict two-run load | Final browser/review gate |
| Free core | DONE baseline; matching path pending | Entitlement/paywall absent from Pair core and Matching is designed as non-gated core | Three Pair cycles without entitlement; current matching boundary rerun pending | Matching code/Discord verification and production monitor |
| PairEvent | DONE | Current-registry targets; unsafe legacy migration retirement | PairEvent selfcheck/integration | Target dry-run |
| History/notifications | DONE | Bounded derived/cursor feeds and neutral DTOs | Selfchecks, E2E and indexed load | Production growth monitoring |
| PartnerSignal | DONE | Explicit confirmed source-bound send and 30-day TTL | PartnerSignal integration | Reviewed production migration if legacy rows exist |
| Safety/help | DONE locally | Owner-private eligibility veto and versioned private Russian help catalog (`help-ru-v1`) | Current-tree security, participant-disclosure and frontend catalog selfchecks passed; external-review packet prepared | Named expert/legal review for a specified jurisdiction and publication approval |
| End/reconnect | DONE | Terminal cleanup, old-id denial, new Pair context | Pair-context lifecycle integration and index fixture | Real-session race/manual copy review |
| Export/delete/session | DONE | Bounded export, request/cancel/confirm execution and durable revocation | Privacy lifecycle/deletion/Factor-export integrations | Production retention/terms/backup approval |
| Migrations/indexes | DONE baseline; matching pending | Existing guarded migrations plus matching `DRY_RUN`/`APPLY_ADDITIVE`/`VERIFY`; production runtime `autoIndex=false` | Existing Factor/index evidence only; matching release verification not run | Matching guarded test target, then separately approved production preflight/apply plan |
| Performance | DONE locally | Bounded queries, indexes, per-Pair post-auth single-flight | Two strict runs met dashboard/history/recommendation targets; zero errors/conflicts/duplicates | Production SLO/capacity evidence |
| Frontend/mobile | PARTIAL | Active screens and shared states updated; legacy/paywall UI removed | Frontend selfcheck plus isolated production-snapshot reconnect fallback at 320/360/390/430 passed without overflow/console errors and with keyboard focus/activation | Authenticated real-Discord run and physical-device safe-area check |

## Key local evidence

The items below are retained baseline evidence from before the Factor Matching master change unless a matching-specific command is named. They must not be read as final verification of the current dirty tree.

- Three-cycle two-user path completed weeks `2026-W33`, `2026-W34`, `2026-W35` without entitlement: six submissions, three cycles/summaries/recommendations/canonical activities, separate feedback, history and 23 neutral notifications; no paywall/payment response or privacy assertion failure.
- Factor runtime bug involving Mongoose subdocument version spreading was fixed by explicit semantic copies; targeted Factor/activity checks and the three-cycle flow then passed.
- Privacy lifecycle integration passed owner export plus deletion request/cancel. Destructive deletion integration covers session revocation and cleanup; Factor export uses owner/full versus pair-summary disclosure boundaries.
- Participant-disclosure selfcheck passed after privacy response hardening; pair-facing projections remain qualitative and non-reconstructable.
- Exact guarded replica-set reliability/reconciliation run passed failure, retry, lease and recovery scenarios.
- Exact-tree `lint`, `check:types`, full `check:self`, `check:agents`, production `build` and `git diff --check` passed after the final security/lifecycle fixes; `npm audit --omit=dev` reported zero vulnerabilities with the unchanged dependency graph.
- Fresh migration/preflight evidence: registry v6, 28 Factor indexes plus 97 remaining declared indexes, `missing=0`, `extra=0`, 72 blocking invariants green. A legacy Pair unique-index fixture failed closed and passed only after explicit removal.
- Final strict load p95 run 1/run 2: dashboard `491.56/380.19 ms`, recommendation `675.44/669.37 ms`, history `263.99/271.01 ms`; zero errors/conflicts/duplicate effects.
- An isolated byte-matched current-tree snapshot passed production build/start. Direct and `/.proxy` liveness returned `200`, unauthenticated user routes returned `401`, request-id/cache/security headers and per-response CSP nonces matched policy, and no raw diagnostic data was exposed. Readiness returned the expected generic `503` because the smoke used a deliberately unavailable local test DB; this is fail-closed evidence, not production readiness.
- The same snapshot's reconnect fallback passed at 320/360/390/430 px with no horizontal overflow or console warnings/errors; the labeled 44 px retry control accepted keyboard activation and retained visible `:focus-visible`. Authenticated Discord navigation and physical-device safe-area validation remain external gates.
- Pair-questionnaire preflight disclosure hardening passed targeted selfcheck, TypeScript and changed-file agent checks: command output contains aggregate duplicate counts/canonical index names only, and unknown Mongo failures emit a stable reason code without raw `dup key` values or ids.
- Seven target release entrypoints now share a fail-closed output contract (`counts`, allowlisted `reasonCounts`, `indexNames`). Missing-env and synthetic invalid/connection probes each emitted exactly one sanitized JSON line with no URI, database, raw Mongo text, stack or path.
- Post-fix current-working-tree `lint`, full selfcheck chain, agent checks, TypeScript, isolated production build, `git diff --check` and `npm audit --omit=dev` passed; audit reported zero vulnerabilities. This does not attest an immutable deploy artifact because the working tree is uncommitted and contains a preserved pre-existing lockfile change.

## Open status

- Known P0 blockers for the earlier Pair loop: **0** in the retained baseline; Factor Matching final verification is still pending, so no current-tree zero-blocker claim is made.
- Local release verification: **pending for the current Factor Matching tree**. The earlier NEW_ONLY gates remain useful baseline evidence but are stale after this broad change.
- Production launch: **external gates open** — real Discord sessions, target restore/migration/indexes, secrets/topology/alerts/on-call, sensitive/localized help and retention/legal approval, deployment authorization.
- Safety/help and retention handoff material is ready in `SAFETY_RETENTION_EXTERNAL_REVIEW.md`, but no jurisdiction, named reviewers, controller/privacy owner, approved retention schedule or backup/deletion-after-restore evidence was supplied; this is not approval.
- The isolated production-snapshot smoke closes only the locally available unauthenticated runtime/fallback checks. Its deliberate `ready=503` is not target readiness, and the temporary build is not the immutable artifact that would be deployed; exact target/artifact smoke remains a pilot/deploy gate.
- Billing/provider/pricing is intentionally **not a gate** for this free MVP.
