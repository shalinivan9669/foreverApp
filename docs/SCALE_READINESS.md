# Scale readiness

Status: active modular-monolith scale baseline. This document separates assumptions, local measurements, and production unknowns. It does not justify Redis, queues, microservices, or AI by itself.

## Critical paths

| Path | Correctness boundary | Read/write shape | Current target |
| --- | --- | --- | --- |
| Discord exchange and session restore | signed session, no token disclosure | one user upsert plus audit | bounded external and DB timeouts |
| Invite create/accept | one active pair per user | token-hash lookup, transaction, unique membership claims | one canonical Pair under races |
| Dashboard / Pair Summary | membership and derived-disclosure guard | current cycle/snapshot/activity projection | bounded reads, no raw-answer joins |
| Weekly submit | one member revision and one canonical snapshot | transactional claim/check-in plus repairable effects | retry-safe after process/DB failure |
| Recommendation and activity | one decision/activity per pair/cycle | deterministic selection plus CAS transitions | stable result under duplicate requests |
| History and notifications | pair/member scope | cursor pagination and projections | no unbounded scans or sensitive payload |
| Entitlement webhook | signature and event uniqueness | event dedupe plus pair entitlement upsert | duplicate delivery is a no-op |

## Implemented reliability baseline

- Mongo-backed transport idempotency uses `in_progress`, `failed`, and `completed` states, a 30-second owner lease, attempt count, failure code, and conditional owner completion. A failed record or expired lease can be taken over only for the same request hash; a different hash remains a reuse conflict. Legacy `in_progress` records without a lease receive the same 30-second grace before takeover.
- Successful and semantic client-error envelopes remain replayable. A 5xx execution result moves the record to `failed` instead of permanently caching the failure. If completion persistence is uncertain, the caller receives `503 IDEMPOTENCY_IN_PROGRESS` and must retry with the same key and body.
- New weekly check-ins carry versioned finalization state. User/vector/pair/insight effects and the `effects_applied` marker commit in one MongoDB transaction under a 120-second lease; cycle materialization is synchronized before `completed`. A retry resumes from the persisted phase and does not reapply vector snapshots or user effects.
- Legacy weekly rows without the finalization marker are treated as already finalized and are not replayed. This prevents duplicate historical effects, but cannot reconstruct a pre-marker operation that failed between its old primary and secondary writes.
- Pair history applies cursor/sort/limit before activity feedback projection and limits canonical cycle candidates to batches of 32 before snapshot lookup. It can continue with another bounded batch when a referenced snapshot is missing, preserving pagination semantics without per-row lookups.

These are code and local synthetic-test properties, not proof of cross-region, provider, or production behavior. Weekly audit emission remains best-effort after durable completion rather than an exactly-once transactional effect.

## Working assumptions

These are engineering assumptions for the first synthetic smoke, not measured production demand:

- initial deployment: one to three stateless application instances;
- synthetic data set: 50 active pairs, 12 historical cycles per pair, and bounded notifications/audit events;
- burst: up to 50 concurrent dashboard reads and simultaneous two-member submissions for 10 pairs;
- expected steady write volume per pair/year: about 52 cycles, 104 member check-ins, up to 52 snapshots, 52 decisions, 52 activities, and bounded feedback/notification records;
- proposed pre-pilot SLO: p95 under 500 ms for cached-free read models, p95 under 1,500 ms for transactional mutations, under 1% unexpected 5xx, and no duplicate canonical artifacts;
- privacy failures, cross-pair reads, raw-answer disclosure, and lost/duplicated accepted mutations have a zero-error target.

The numerical SLO and smoke profile are provisional engineering gates; pilot traffic and product launch targets must replace them before capacity planning.

## Local measurements

| Measurement | Result | Environment / limit |
| --- | --- | --- |
| Release preflight on fresh and legacy databases | 47 data/content/index invariants passed across 31 indexed collections; fresh drift moved `missing=95, extra=0` to zero, while a legacy fixture was blocked until the old weekly unique index was explicitly removed and then moved `missing=92` to zero | Windows host, Node 24, Docker Desktop, one-node MongoDB 8 replica set; target-specific preflight and destructive-drop approval remain mandatory |
| Reliability reconciliation smoke | Passed generic-idempotency failure/takeover/hash cases and weekly primary-commit recovery. A 15-row expired-cycle fixture proved the hinted queue examines/returns at most 8 candidates, progresses past one poison row, marks legacy canonical rows, and leaves only the failed row pending | Local synthetic `foreverapp_rc`; one-node replica-set behavior, not production failover evidence |
| Two-user acceptance | Invite race/retry, two weekly submissions, one canonical recommendation, full two-role activity feedback, history/privacy assertions, and cleanup passed | Isolated `_test` database; 0 documents remained across 21 collections |
| Release load smoke | All eight scenarios completed with zero errors/conflicts and zero duplicate canonical keys/effects | Guarded run-scoped `_test` data; cleanup assertion passed |

### Final concurrent load-smoke profile

The final run used one deliberately hot pair, two users, 180 historical weekly cycles and canonical snapshots, 360 terminal activities, 160 seeded notifications plus four summary notifications, and 41 subscriptions. Global concurrency was 12, list pages were limited to 20, and completed historical cycles carried the reconciliation marker; legacy queue behavior is measured separately by the reliability regression.

| Scenario | Samples / concurrency | Avg | p95 | Errors / conflicts |
| --- | ---: | ---: | ---: | ---: |
| Dashboard read | 24 / 12 | 409.89 ms | 459.70 ms | 0 / 0 |
| Simultaneous weekly submit | 2 / 2 | 318.87 ms | 337.15 ms | 0 / 0 |
| Repeated recommendation generation | 12 / 12 | 907.70 ms | 1069.34 ms | 0 / 0 |
| Activity completion race | 8 / 8 | 261.08 ms | 266.29 ms | 0 / 0 |
| Notification create/dedupe | 24 / 12 | 13.15 ms | 20.47 ms | 0 / 0 |
| Two-page history read | 36 / 12 | 173.44 ms | 222.07 ms | 0 / 0 |
| Two-page notification read | 36 / 12 | 58.88 ms | 69.51 ms | 0 / 0 |
| Entitlement read | 36 / 12 | 24.05 ms | 41.25 ms | 0 / 0 |

The concurrent recommendation run converged to one decision and one recommendation-backed activity; activity completion advanced pair progress once and produced no duplicate effects. Notification, cycle, snapshot, and subscription identities also remained unique. Query-plan evidence selected `pair_activity_history_by_pair_status_offered` with 37 documents examined/21 returned, `weekly_cycle_history_by_pair_start` with 33/32, and the built-in snapshot `_id_` index with 1/1.

The latest exact-tree repeat kept dashboard p95 below the provisional 500 ms read target and recommendation p95 below the provisional 1,500 ms mutation target. The immediately preceding equivalent run measured dashboard p95 at 515.29 ms, 15.29 ms above the read target. Correctness remained stable across both runs, so the variance stays recorded as a P2 tuning signal rather than production capacity evidence or justification for new infrastructure.

Production latency, availability, data growth, connection-pool pressure, and provider behavior remain unknown until a pilot environment is observed.

## Query and index baseline

- Pair membership: `members + status`; multikey read cost, low pair write frequency.
- Invite: unique token hash, one active invite per creator, creator/history and expiry lookups; additional indexes increase only invite lifecycle writes.
- Membership claim: unique `userId`; required for cross-instance pair uniqueness.
- Weekly cycle/check-in/snapshot: unique pair/cycle/member revisions plus chronological pair reads. History uses additive `weekly_cycle_history_by_pair_start` on `{ pairId, startsAt, cycleKey }`; the previous `{ pairId, startsAt }` prefix index is retained until a separate rollback-aware removal decision.
- Recommendation/activity: one offered decision per pair/cycle and chronological/status activity reads. History uses additive `pair_activity_history_by_pair_status_offered` on `{ pairId, status, offeredAt, _id }`.
- Canonical snapshot history joins by `latestSnapshotId`; the built-in unique `_id_` index is the precise lookup index, while `cycleId` and `pairId` are integrity checks on the single selected row. A redundant history-only snapshot index is not added.
- Rate limit/idempotency/audit: unique operational keys plus TTL; lease/takeover uses the existing unique `{ userId, route, key }` identity index, so no lease-expiry index is needed for request-scoped acquisition.
- Every list endpoint must use a hard limit and opaque cursor. Aggregation bounds must occur before expensive lookups where semantics permit.

`scripts/release-preflight.ts` checks data invariants before unique-index creation, covers every indexed production model, and reports missing/extra indexes without dropping any index. Runtime auto-index creation is disabled. An existing legacy weekly user/week unique index is a blocker, not a tolerated variant: it prevents valid solo-plus-pair writes in one week. Only the separately reviewed migration command may remove it, after which preflight must pass with the non-unique lookup.

## Current bottlenecks and safeguards

- No correctness-critical in-memory Map/Set is used; idempotency and rate limits are Mongo-backed.
- Nonce CSP opts document routes into dynamic rendering, so HTML is not a static CDN artifact. Measure SSR CPU/latency in pilot traffic; API routes and static chunks remain separately cacheable/served and the nonce does not introduce shared state.
- Mongo connection reuse is process-local pooling only; user/pair truth remains in MongoDB.
- Expired-cycle reconciliation, recommendation hydration, and history aggregation remain batch-bounded and avoid N+1 reads. The reconciliation queue uses the named `{ pairId, marker, endsAt, cycleKey }` index and a hard batch of eight; completed rows leave the queue permanently while failed rows remain retryable.
- Concurrent recommendation generation is covered at concurrency 12. Contenders preserve the valid current-cycle offer, converge on its unique decision, cancel orphan candidates, and perform a bounded canonical reread instead of returning a transient conflict.
- Recommendation quota accounting uses a bounded per-window accepted-claim set (FREE 6/day, SOLO 40/day, COUPLE unlimited) so aliases and concurrent retries increment once. Direct-template preparation and action notification delivery are retry-healed through canonical/dedupe identities rather than a queue.
- Lease expiry is a recovery boundary, not cancellation of an already running handler. Keep mutation work bounded below its lease, monitor takeover frequency, and extend/heartbeat only with a reviewed ownership design.
- Audit and product metrics are separate concerns. Neither may use user/pair/invite identifiers or answer content as metric labels.
- External delivery, exports, and recomputation need idempotent job seams before they become long-running work; a queue is not introduced until synchronous bounds are exceeded.

## Infrastructure decision thresholds

- Add Redis only after measured Mongo-backed rate-limit/cache contention materially consumes the read/mutation SLO, and only with a failure-mode plan that does not weaken security.
- Add a durable queue when a bounded operation repeatedly exceeds two seconds, requires retry beyond the request lifetime, or cannot be safely reconciled synchronously.
- Add object storage when generated owner exports exceed practical bounded database/HTTP payloads (provisional review threshold: 10 MB) and lifecycle/encryption policy is approved.
- Extract a service only when a module has independently measured scaling, deployment, or availability needs that cannot be met inside the modular monolith.
- AI/embeddings stay disabled. Before any AI decision, require purpose-specific consent, a redacted evaluation set, measured deterministic fallback quality, privacy review, safety review, provider retention terms, and a kill switch.
