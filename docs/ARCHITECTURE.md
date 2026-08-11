# Architecture

Status: current runtime architecture after the 2026-08-11 NEW_ONLY cutover.

## Layering

1. Pages and feature UI: `src/app/**/page.tsx`, `src/features/**`, `src/components/**`.
2. Client transport/orchestration and reviewed copy: `src/client/api/**`, `src/client/hooks/**`, `src/client/viewmodels/**`, `src/client/content/**`.
3. HTTP boundary: `src/app/api/**/route.ts`.
4. Request/auth/response boundary: `src/lib/api/**`, `src/lib/auth/**`, `src/lib/abuse/**`, `src/lib/idempotency/**`.
5. Stateful use cases: `src/domain/services/**` and transition guards in `src/domain/state/**`.
6. Pure semantic core: `src/domain/model/**`.
7. DTO/disclosure boundary: `src/lib/dto/**`, `src/domain/model/privacy/**`.
8. Persistence: `src/models/**`, `src/lib/mongodb.ts`.
9. Operations: sanitized audit, low-cardinality analytics/events, migrations and release scripts.

Dependency direction is inward: UI calls client APIs; route handlers authenticate/validate and call domain services; services use pure domain functions and models; DTOs map results to an audience-safe shape. Domain/model code never imports React/browser code, and participant APIs never return Mongoose documents.

## Semantic Factor Engine

The only computation path for the public couple loop is:

```text
published registry
→ validated source input
→ immutable EvidenceEvent
→ immutable Individual/Pair FactorSnapshot
→ immutable PairFactorEvaluationSnapshot
→ disclosure-safe Pair Summary/profile
→ deterministic RecommendationDecision
→ PairActivity feedback
→ new evidence/snapshots
```

`src/domain/model/**` owns:

- typed domain/dimension/factor/measurement/instrument/action definitions;
- deterministic canonical registry hash and validation;
- typed values plus explicit unavailable states;
- evidence provenance and capture policy;
- aggregation metrics (`confidence`, `coverage`, `freshness`, `consistency`);
- ten pair-strategy implementations;
- immutable snapshot construction and version-pinned replay;
- central Factor disclosure and action recommendation policy.

Persistence adapters are `DefinitionRegistryRelease`, `EvidenceEvent`, `IndividualFactorSnapshot`, `PairFactorSnapshot` and `PairFactorEvaluationSnapshot`. Unique identities make retry/concurrency converge on canonical artifacts. Published registry records and computed artifacts are append-only/immutable; current pointers are read optimizations, never a second calculation source.

## Core consumers

- Onboarding materializes only reviewed semantic measurements.
- Weekly check-in starts with untouched UI fields, stores owner-private source data, materializes Factor evidence, and publishes a qualitative pair projection only when disclosure conditions are met.
- Questionnaire submissions are immutable and owner-private. Unmapped content remains `UNMAPPED`; it does not fabricate Factor evidence.
- Pair Summary reads canonical weekly/Factor projections, never legacy diagnostics or raw partner input.
- Recommendations use Factor snapshots/evaluations, current state, history/cooldown, contraindications and the system-only SafetyGate.
- Activity feedback creates Factor evidence and immutable snapshots; it does not mutate a personality score.
- Owner profile reads semantic cards from latest individual snapshots. It contains no six-axis radar or compatibility percentage.
- PairEvent records bind to current Factor registry/action targets; unsafe legacy event types are retired by the guarded migration.
- Private help renders the typed/versioned `HELP_RESOURCE_CATALOG`; `help-ru-v1` is implementation evidence, while jurisdiction-specific publication approval stays an external content gate.

## Product and lifecycle aggregates

- `PairInvite` owns one-time hashed invite lifecycle.
- `PairMembershipClaim` enforces one active/paused Pair per user.
- `Pair` owns the relationship context (`pair-context-v1`) and `active → paused → ended` lifecycle. Ending releases membership claims and closes open pair-scoped work. Reconnect always creates a new Pair id/context.
- `WeeklyCycle` owns UTC cycle windows and relative participant completion. `PairStateSnapshot` is the bounded participant history projection; Factor snapshots are the semantic computation record.
- `RecommendationDecision` owns offer/replace/accept/skip/expiry and points to one canonical `PairActivity`.
- `PairActivity` owns start, separate feedback, partial/final completion and Factor provenance.
- `PartnerSignal` is an explicit user-confirmed message bound uniquely to one personal check-in and expires after 30 days.
- `PrivacyRequest` plus `SessionSubject` implement request/cancel/confirm execution and durable session revocation.

See [state machines](./03-state-machines.md) for transition details.

## Security and disclosure boundaries

- The authenticated session subject is authoritative; client `userId`, `fromId`, `actorId` or membership assertions are not.
- Pair/activity resources use centralized membership/ownership guards before state or future-infrastructure lookups.
- Cookie mutations enforce same-origin; JSON mutations enforce media type, size and Zod validation.
- `PRIVATE`, `PAIR_MODEL_ONLY`, `SHARED` and `SYSTEM_ONLY` are computation/capture policies, not automatic partner visibility.
- Owner, pair-member, public and export projections are separate. Partner APIs expose no raw answers/notes, exact values/deltas, internal fit, confidence number, evidence identity/count or SafetyGate state.
- Audit/analytics use allowlisted metadata and never contain secrets or intimate payloads.

## Free-core boundary

All onboarding, pair formation, weekly cycles, Pair Summary, recommendation decisions, activities, feedback, history, help, lifecycle and privacy operations are available without entitlement. Core routes do not return `402`, `PAYMENT_REQUIRED` or `ENTITLEMENT_REQUIRED`.

`src/lib/entitlements/**`, sandbox webhook/admin endpoints and billing models remain isolated future infrastructure. They must not be imported as eligibility gates by public core services or routes. Abuse rate limits and idempotency remain active and are unrelated to monetization.

## Legacy boundary

The following are absent from active runtime: `src/domain/vectors/**`, `vectorScoring.service.ts`, `pairDiagnostics.service.ts`, `VectorSnapshot`, `User.vectors`, Pair passport/readiness/fatigue fields, AxisRadar, diagnostics/insights routes, public legacy `/api/match/**` routes and numeric compatibility UI.

Legacy collections or field names may appear only in:

- guarded migrations/deletion cleanup;
- negative cutover selfchecks;
- explicitly historical documentation.

There is no dual-read or runtime fallback. Missing new evidence returns an explicit unavailable state.

## Scale boundary

The architecture remains a modular monolith. Correctness uses Mongo transactions, unique indexes, CAS, bounded leases, projections, lean reads and cursor pagination. No Redis, queue, microservice or AI dependency is required for the MVP. Measured local performance and thresholds are in [SCALE_READINESS.md](./SCALE_READINESS.md).

## Required review rules

- Keep `route.ts` thin; business logic belongs in a domain service/state machine.
- New factors belong in the versioned registry, not service-specific switches.
- New source data needs measurement binding, provenance, capture policy and disclosure tests.
- Model changes require index, DTO, export/deletion and migration review.
- Public contract changes require `API_CONTRACTS.md` updates.
- Never reintroduce legacy scores as a fallback or convert unavailable data to a midpoint.
