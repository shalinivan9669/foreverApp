# ADR-008: Semantic Factor Engine NEW_ONLY and free core

Date: 2026-08-11
Status: accepted

## Context

The previous runtime represented a person or pair through six numeric axes and reused those values for profiles, diagnostics and recommendations. Missing/invalid data could be confused with a neutral midpoint, aggregate legacy scores had insufficient provenance, and a paid entitlement could block later core cycles. Those properties conflict with the public MVP requirement: an explainable, privacy-safe loop that remains free for every cycle.

## Decision

1. Production computation uses only the semantic pipeline:

   ```text
   versioned definitions → EvidenceEvent → immutable Factor snapshots
   → pair evaluations → privacy-safe projections → recommendation/action
   ```

2. `Domain` is an extensible grouping. `FactorDefinition` owns semantics, type, value schema, aggregation, development policy, context, privacy class and pair strategies.
3. `MISSING`, `INVALID`, `UNKNOWN` and `INSUFFICIENT_DATA` are first-class states and never become `0`, `0.5` or an inferred neutral answer.
4. Published registry releases, evidence and snapshots are immutable and version/hash pinned. Version mismatch fails closed; replay must reproduce the same output hash.
5. Personal evidence, observer perception, pair evidence and participant disclosure are distinct. An observation by A never mutates B's personal profile.
6. Pair-facing output is qualitative and non-reconstructable. Numeric compatibility, exact values/deltas/confidence/evidence counts, raw notes and SafetyGate state are not participant output.
7. Legacy six-axis scoring, diagnostics, vector snapshots and radar UI are removed from active runtime. Migration may replay valid raw onboarding/weekly sources; it must never manufacture atomic factors from aggregate legacy axes. Runtime has no legacy fallback.
8. Weekly, recommendation, activity and later cycles are free. No core route may require entitlement, checkout, subscription or return a payment-required error. Existing billing models/webhook/admin helpers remain isolated for possible future work.
9. Snapshot inputs are an explicit as-of view. Canonical evidence must satisfy both `observedAt <= cutoff` and `recordedAt <= cutoff`; late-recorded and future-observed rows cannot affect an earlier snapshot. DECAY reads also use the definition's `expiresAfterDays` as the lower observation bound.
10. Evidence reads are bounded by definition metadata: `expectedEvidence * 8`, clamped to 8..64 rows. The multiplier preserves headroom for repeated weekly/activity observations while the hard cap protects read latency and provenance validation. A selected malformed current row fails closed; readers do not fall back to an older valid row.
11. Current projections use server-side latest-per-factor selection. Pair evaluation queries filter the published strategy identity (context, type, strategy version and directionality) before selecting the newest revision, so a legacy strategy revision cannot shadow a current one.
12. DECAY projections used outside the weekly writer are rematerialized lazily at the consumer cutoff. Profile, Today and activity recommendation consumers therefore advance to the current daily window without requiring a new source submission.
13. A migration run captures one immutable `asOf` instant. Sources or artifacts beyond that cutoff are deferred, and a materialized marker is trusted only when artifact source references and timestamps exactly match the source row. Release preflight treats every undeclared index as a blocker before additive index application.
14. MongoDB operations sharing a `ClientSession` execute sequentially. Retryable write conflicts inside an outer transaction escape to the transaction retry boundary rather than being retried locally in a partially advanced transaction.

## Consequences

- The current MVP registry can grow by adding versioned definitions without changing the central engine. The engine implements all ten pair-strategy families even though the published MVP content uses only a subset.
- Historical snapshots retain their versions; definition changes create a new release and new projections.
- The cutoff/selection semantic change is published as registry version 6 and algorithm version 4; snapshot format remains version 3.
- Low-data users see explicit insufficient states, not fabricated semantic cards or scores.
- Reconnect creates a new Pair context. Pair-scoped private projections are never carried into it implicitly.
- Rollback to the legacy vector runtime is not supported. Rollback artifacts must understand the Factor collections and the NEW_ONLY public contracts.
- Billing code must be treated as dormant infrastructure, not as a release dependency or feature gate.

## Evidence

- Core: `src/domain/model/**`.
- Persistence/runtime: `src/models/EvidenceEvent.ts`, `src/models/IndividualFactorSnapshot.ts`, `src/models/PairFactorSnapshot.ts`, `src/models/PairFactorEvaluationSnapshot.ts`, `src/domain/services/factorEnginePersistence.service.ts`, `src/domain/services/factorEngineRuntime.service.ts`.
- Consumers: onboarding, weekly-cycle, recommendation, activity feedback, profile and PairEvent services.
- Cutover checks/migrations: `scripts/factor-engine.selfcheck.ts`, `scripts/legacy-cutover.selfcheck.ts`, `scripts/factor-engine-*.integration.ts`, `scripts/migrate-factor-engine.ts`, `scripts/migrate-pair-events-new-only.ts`.
- Free-loop evidence: `scripts/two-user-mvp.integration.ts`.

Related: ADR-005 remains historical/valid only for the isolated billing abstraction; this ADR supersedes it for core product eligibility.
