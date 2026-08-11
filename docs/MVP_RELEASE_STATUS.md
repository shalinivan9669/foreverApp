# MVP release status

Status: public-free NEW_ONLY implementation is at final-review stage; final exact-tree/static/browser/review gates must match the execution ledger before release. Updated 2026-08-11. Production/real-Discord deployment is not claimed.

| Capability | Status | Implementation | Recorded evidence | Remaining gate |
| --- | --- | --- | --- | --- |
| Factor Engine and registry | DONE | Typed values, registry v6, algorithm v4, immutable snapshot v3, all ten strategies, replay/disclosure/recommendation | Factor selfcheck and persistence/cutover work; fresh migration/preflight passed | Production target dry-run |
| Legacy six-axis/match removal | DONE | Vector/diagnostics model/services/routes/UI and public `/api/match/**` routes removed; no fallback | Current-tree legacy-cutover and participant-disclosure selfchecks passed; NEW_ONLY migration paths | Production target dry-run |
| Discord auth/session | PARTIAL | Central subject, request guards, persistent session version and expiring account-write leases, logout/deletion revocation | Security/release selfchecks and deterministic deletion/writer races | Two real Discord sessions, production secrets |
| Onboarding/questionnaires/profile | DONE | Semantic onboarding; immutable owner questionnaire; Pair-fenced unique questionnaire sessions/answers; semantic profile cards | Questionnaire integrity selfcheck plus deterministic replica-set concurrency/migration integration | Target duplicate preflight/additive indexes; content/usability review |
| Invite and Pair | DONE | Hash-only token, transaction/CAS, unique membership claim | Race/retry and two-user synthetic evidence | Real-account run |
| Weekly/Pair Summary | DONE | Untouched explicit UI, Factor materialization, insufficient/qualitative projection | Weekly checks; three-cycle E2E | Real-session/manual UI run |
| Recommendation/activity | DONE | Factor-bound one-decision/one-replacement loop, separate feedback evidence | Activity checks, three-cycle E2E, strict two-run load | Final browser/review gate |
| Free core | DONE | Entitlement/paywall removed from all core routes/UI | Three full cycles without entitlement; legacy-cutover assertions | Production monitor for zero payment errors |
| PairEvent | DONE | Current-registry targets; unsafe legacy migration retirement | PairEvent selfcheck/integration | Target dry-run |
| History/notifications | DONE | Bounded derived/cursor feeds and neutral DTOs | Selfchecks, E2E and indexed load | Production growth monitoring |
| PartnerSignal | DONE | Explicit confirmed source-bound send and 30-day TTL | PartnerSignal integration | Reviewed production migration if legacy rows exist |
| Safety/help | DONE locally | Owner-private eligibility veto and versioned private Russian help catalog (`help-ru-v1`) | Current-tree security, participant-disclosure and frontend catalog selfchecks passed | Expert/legal review and jurisdiction-specific publication approval |
| End/reconnect | DONE | Terminal cleanup, old-id denial, new Pair context | Pair-context lifecycle integration and index fixture | Real-session race/manual copy review |
| Export/delete/session | DONE | Bounded export, request/cancel/confirm execution and durable revocation | Privacy lifecycle/deletion/Factor-export integrations | Production retention/terms/backup approval |
| Migrations/indexes | DONE locally | Guarded dry-run/apply scripts and complete registry | Fresh: registry v6, 28 + 97 indexes, 72 blockers green; legacy Pair index fixture blocked then passed after explicit migration | Exact production restore/target run |
| Performance | DONE locally | Bounded queries, indexes, per-Pair post-auth single-flight | Two strict runs met dashboard/history/recommendation targets; zero errors/conflicts/duplicates | Production SLO/capacity evidence |
| Frontend/mobile | PARTIAL | Active screens and shared states updated; legacy/paywall UI removed | Current-tree frontend MVP selfcheck passed | Supported-host browser at 320/360/390/430 and real Discord |

## Key local evidence

- Three-cycle two-user path completed weeks `2026-W33`, `2026-W34`, `2026-W35` without entitlement: six submissions, three cycles/summaries/recommendations/canonical activities, separate feedback, history and 23 neutral notifications; no paywall/payment response or privacy assertion failure.
- Factor runtime bug involving Mongoose subdocument version spreading was fixed by explicit semantic copies; targeted Factor/activity checks and the three-cycle flow then passed.
- Privacy lifecycle integration passed owner export plus deletion request/cancel. Destructive deletion integration covers session revocation and cleanup; Factor export uses owner/full versus pair-summary disclosure boundaries.
- Participant-disclosure selfcheck passed after privacy response hardening; pair-facing projections remain qualitative and non-reconstructable.
- Exact guarded replica-set reliability/reconciliation run passed failure, retry, lease and recovery scenarios.
- Exact-tree `lint`, `check:types`, full `check:self`, `check:agents`, production `build` and `git diff --check` passed after the final security/lifecycle fixes; `npm audit --omit=dev` reported zero vulnerabilities with the unchanged dependency graph.
- Fresh migration/preflight evidence: registry v6, 28 Factor indexes plus 97 remaining declared indexes, `missing=0`, `extra=0`, 72 blocking invariants green. A legacy Pair unique-index fixture failed closed and passed only after explicit removal.
- Final strict load p95 run 1/run 2: dashboard `491.56/380.19 ms`, recommendation `675.44/669.37 ms`, history `263.99/271.01 ms`; zero errors/conflicts/duplicate effects.
- Production-browser fallback/onboarding states passed at 320/360/390/430 px with no horizontal overflow, no unlabeled controls and no console warnings/errors; authenticated Discord and physical-device safe-area validation remain external gates.

## Open status

- Known P0/core-loop code blockers: **0** based on current local implementation evidence.
- Local release verification: **complete for the executable local gates** recorded in the execution ledger; authenticated/physical-device and production gates remain external.
- Production launch: **external gates open** — real Discord sessions, target restore/migration/indexes, secrets/topology/alerts/on-call, sensitive/localized help and retention/legal approval, deployment authorization.
- Billing/provider/pricing is intentionally **not a gate** for this free MVP.
