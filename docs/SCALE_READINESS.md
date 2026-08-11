# Scale readiness

Status: local modular-monolith baseline for the NEW_ONLY public-free MVP. Measurements below are local synthetic evidence, not production capacity proof.

## Targets

| Critical path | Provisional local target | Correctness target |
| --- | ---: | --- |
| Pair dashboard / Pair Summary | p95 < 500 ms | no raw joins/cross-pair reads |
| Pair history | p95 < 500 ms | bounded cursor projection |
| Recommendation mutation | p95 < 1,500 ms | one canonical decision/activity |
| Other transactional mutations | observe; investigate sustained p95 > 1,500 ms | no lost/duplicate committed effects |
| All paths | unexpected 5xx < 1% | zero privacy failures and duplicate canonical artifacts |

These are pre-pilot engineering gates. Production SLOs require real traffic, topology and product ownership.

## Correctness/performance foundation

- Stateless application correctness relies on Mongo transactions, CAS, unique canonical identities and Mongo-backed idempotency/rate limits.
- Registry/evidence/snapshot/recommendation inputs are version/hash pinned; duplicate retries converge instead of recomputing a second artifact.
- Pair reads use projections/lean reads and bounded queries. History and notifications are cursor-paginated with hard limits.
- Expired-cycle reconciliation is a bounded indexed queue and isolates a poison row.
- Recommendation uses a per-Pair single-flight acquired only after membership authorization. This removes redundant same-Pair concurrent computation without serializing cross-Pair traffic or leaking resource existence.
- Runtime index creation is disabled; preflight/migration explicitly owns index application.
- No Redis, queue, microservice, vector database or AI is required for this load profile.

## Final comparable load runs

Date: 2026-08-11. Environment: guarded run-scoped `_test` database on a local one-node MongoDB replica set, hot Pair fixture and concurrent duplicate/race requests. The stricter recommendation workload alternated both authorized members, validating per-Pair canonical single-flight plus owner-specific projection coalescing after membership guards. These final runs include weekly, Factor-read, activity and notification Pair lifecycle transaction fences.

| Scenario | Run 1 p95 | Run 2 p95 | Required gate |
| --- | ---: | ---: | --- |
| Dashboard | 491.56 ms | 380.19 ms | PASS (< 500 both) |
| Recommendation cold canonical race | 675.44 ms | 669.37 ms | PASS (< 1,500 both) |
| History | 263.99 ms | 271.01 ms | PASS (< 500 both) |
| Weekly concurrent mutation | 1,035.93 ms | 1,034.94 ms | observed; no separate mandatory threshold |
| Activity completion race | 418.41 ms | 593.87 ms | PASS under transactional-mutation alert threshold |

Both runs produced zero errors, conflicts and duplicate notification/cycle/snapshot/activity effects. A preceding exact-tree run exposed redundant follower notification healing at recommendation p95 `1,531.15 ms`; followers now reuse the already-completed canonical notification reconciliation while preserving separate owner projections, after which both cold-create runs passed.

Separately, the exact guarded `npm run selfcheck:reliability-reconciliation` replica-set run passed its failure, retry, lease, reconciliation and recovery scenarios.

Expected query plans were selected:

| Query | Index | Documents examined / returned |
| --- | --- | ---: |
| Pair activity history | `pair_activity_history_by_pair_status_offered` | 33 / 21 |
| Weekly cycle history | `weekly_cycle_history_by_pair_start` | 33 / 32 |
| Snapshot join | MongoDB `_id_` | 1 / 1 |

Do not add a redundant snapshot join index. The history ratios reflect the deliberately hot fixture and bounded candidate window; validate production ratios as data distribution changes.

## Migration/index evidence

- On a truly fresh `_test` database, guarded Factor migration seeded registry v6 and applied 28 Factor indexes. The general additive preflight applied the remaining 97 declared indexes, including the account lifecycle/write-lease index.
- Final preflight reported `missing=0`, `extra=0` and all 72 blocking invariant checks green.
- Fresh Pair context dry-run reported no legacy unique key and one canonical `pair_contexts_by_member_key` lookup.
- A separate legacy-index fixture was correctly blocked by `legacy-pair-key-unique-index`; the explicit Pair-context migration removed it, after which preflight passed.

This proves the scripts on disposable local fixtures, not target-production data cleanliness, backup validity or index-build impact.

## Capacity assumptions and unknowns

Initial design assumes one to three stateless app instances, one transaction-capable replica set, weekly rather than high-frequency pair writes, and bounded owner/pair histories. Unknown until pilot/production:

- p50/p95/p99 under real network/Discord latency;
- throughput/saturation and connection-pool pressure;
- replica failover behavior and transaction retry cost;
- storage/index/TTL growth;
- backup RPO/RTO and restore duration;
- alert delivery and incident response;
- regional/cross-region behavior.

## Thresholds for new infrastructure

Tune indexes, query order, projections, single-flight and pool configuration first. Consider a queue only when measured synchronous recomputation cannot meet SLO and already has an idempotent job boundary. Consider a cache only after read pressure and invalidation keys are measured. Split a service only when deployment/failure/scaling ownership is independently justified.

No infrastructure optimization may remove membership/disclosure guards, version checks, canonical uniqueness or reconciliation.

## Production observability

Required dashboards:

- readiness, Mongo topology/replication, pool, slow operations and storage/index/TTL growth;
- count/latency/error by low-cardinality route group;
- idempotency in-progress/failed/lease takeover/hash conflict;
- cycle finalization/reconciliation and recommendation single-flight wait duration;
- duplicate canonical identity alarms;
- backup age/restore drill outcome;
- privacy/security incident channel.

Provisional alerts: critical read p95 > 500 ms for 15 minutes; critical mutation p95 > 1,500 ms for 15 minutes; 5xx > 1% for 5 minutes; generic work older than twice its lease; any duplicate canonical artifact or disclosure/cross-pair failure immediately.

Metric labels must never contain user/pair ids, answers, notes, signal/summary text, Factor values/hashes or SafetyGate state.
