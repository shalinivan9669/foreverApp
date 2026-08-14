# ForeverApp / «Вместе»: semantic Factor domain model

Status: active, implemented contract. Updated 2026-08-13.

Privacy, safety, versioning, storage and scaling rules continue in [TARGET_DOMAIN_OPERATIONS.md](./TARGET_DOMAIN_OPERATIONS.md).

## 1. Canonical pipeline

```text
DOMAIN → DIMENSION → FACTOR → MEASUREMENT
                              ↓
source record → immutable EVIDENCE
                              ↓
                 immutable FACTOR SNAPSHOT
                              ↓
       personal / pair / matching projection
                              ↓
        pair evaluation → recommendation → action result
```

The system does not model a person as six numbers. `DomainDefinition` is only an extensible grouping; calculation semantics live on `FactorDefinition`. Adding a domain/factor does not require a central scoring switch.

## 2. Published registry

`src/domain/model/definitions/**` is the single definition source. A `FactorRegistryRelease` contains:

- domains and dimensions;
- factors and their semantic rules;
- measurements and instruments;
- action definitions;
- registry, algorithm, snapshot and display versions;
- lifecycle status, deterministic canonical representation and SHA-256 hash.

The current published MVP registry is `foreverApp.factorEngine.mvp`, version 3. It contains 4 domains, 6 dimensions, 8 factors, 15 measurements, 3 instruments and 3 actions. Those counts describe current content, not engine limits. A seed with the same key/version must have the same canonical hash; a published-version mismatch fails closed.

Current domains are `communication`, `wellbeing`, `sharedLife` and `lifePlans`. Domain keys are data, not a hardcoded engine union.

## 3. Factor definitions and types

Every `FactorDefinition` declares key, domain/dimension, display semantics, type, value schema, aggregation, development policy, pair strategies, privacy class, allowed relationship contexts and definition version.

Supported semantic types:

```text
TRAIT | STATE | SKILL | PREFERENCE_AXIS | VALUE | NEED | EXPECTATION
ROLE_PREFERENCE | ROLE_CAPABILITY | CONSTRAINT | OUTCOME
```

The published MVP uses a subset: `STATE`, `SKILL`, `PREFERENCE_AXIS`, `ROLE_CAPABILITY` and `CONSTRAINT`. This preserves the rules that preference/need/trait are not weaknesses, only trainable skills receive growth semantics, state becomes stale, and constraints are not averaged.

## 4. Typed values and unavailable states

Available values are a discriminated union:

```text
SCALAR | BOOLEAN | CATEGORY | RANGE | MASTERY | SET | TEXT
```

`CATEGORY` represents closed categorical/ordinal choices when defined by an allowlist; `SET` represents bounded multi-select; a semantic constraint is a `CONSTRAINT` factor with a typed closed value. No Factor persistence uses an arbitrary untyped value bag.

Unavailable values are equally explicit:

```text
MISSING | INVALID | UNKNOWN | INSUFFICIENT_DATA
```

They carry reason codes and are never converted to `0`, `0.5`, a midpoint or neutral evidence. Value, confidence, coverage, freshness and consistency remain separate fields.

## 5. Evidence

`EvidenceEvent` is immutable and records:

- actor, individual/pair subject and observation scope;
- factor/measurement/instrument and source type/reference/revision/hash;
- submitted typed value and, only for `ACCEPTED`, a normalized typed value;
- reliability and timestamps;
- relationship context and purpose;
- privacy class, capture mode, consent/policy version and retention class;
- registry/definition/measurement/instrument/algorithm versions;
- deterministic input hash and accepted/rejected status.

Supported sources are `QUESTIONNAIRE`, `CHECK_IN`, `TASK`, `TASK_RESULT`, `REFLECTION`, `EXPLICIT_PROFILE`, `PAIR_ACTIVITY`, `FEEDBACK` and `OBSERVED_OUTCOME`.

Invalid evidence can be persisted as `REJECTED` for provenance with a rejection code, but never with `normalizedValue`. It is excluded from aggregation, does not raise confidence and cannot create an available snapshot. Private notes remain in their owner source record and are not copied to generic evidence.

Observation scope is an architectural boundary: an observation by A about B is observer/pair evidence. It never mutates B's personal profile.

## 6. Aggregation and snapshots

Definitions choose `LATEST`, `WEIGHTED_MEAN`, `RECENCY_WEIGHTED`, `MAJORITY` or `NON_AGGREGATING`. Aggregation yields a status/value plus independent confidence, coverage, freshness and consistency.

Three immutable snapshot types are persisted:

- `IndividualFactorSnapshot` — one subject and optional Pair context;
- `PairFactorSnapshot` — evidence whose subject is the dyad;
- `PairFactorEvaluationSnapshot` — structured A/B/pair evaluation.

Snapshots include revisions, evidence identities, definition/registry/algorithm/snapshot versions, input/output hashes and calculation time. New evidence produces a new revision; existing snapshots are not updated in place. Replaying identical version-pinned inputs must reproduce the output hash. Version or subject mismatch raises a typed fail-closed error.

## 7. Pair strategies

The engine implements all ten deterministic strategies:

```text
SIMILARITY | BOUNDED_GAP | TARGET_RANGE | COMPLEMENT
BOUNDED_COMPLEMENT | MINIMUM_BOTH | ROLE_COVERAGE
DIRECTIONAL_EXPECTATION | CUSTOM_MATRIX | HARD_CONSTRAINT
```

Each strategy has a typed config, validation, relationship context, minimum confidence, reason codes, actionability and explicit insufficient-data behavior. Symmetric calculations canonicalize member order; directional expectation retains both directions.

`ROLE_COVERAGE` evaluates coverage, preference satisfaction and load imbalance so «one person does everything» cannot be labeled a good complement. `HARD_CONSTRAINT` returns `CONSTRAINT_CONFLICT` with decision/discussion actionability; for an existing pair this blocks an unsuitable action, not the relationship itself.

Pair evaluation statuses are:

```text
ALIGNED | COMPLEMENTARY | WORKABLE_DIFFERENCE | TENSION
CONSTRAINT_CONFLICT | INSUFFICIENT_DATA
```

An internal fit may rank actions/candidates but is never a participant compatibility percentage.

## 8. Personal model, Pair model and projections

The personal model is the latest allowed projection over individual snapshots grouped by semantic factors. It is not a mutable `VectorProfile`. Owner profile DTOs show semantic cards and qualitative confidence/freshness bands; they do not expose raw graph provenance or numeric compatibility.

The Pair is an independent subject. Its situation model can use:

- personal snapshots for A and B;
- pair evidence/snapshots;
- current relationship context;
- activity outcomes and current states.

It is never computed by averaging users. Pair Summary shows at most four qualitative signals and one next step. It contains no raw answer, note, exact value/delta, confidence number, evidence count, overall score, diagnosis or SafetyGate reason. One-sided input remains insufficient.

## 9. Recommendation and activity loop

`ActionDefinition` declares target factors, contexts, minimum skill when applicable, expected outcomes, contraindications, difficulty, duration, cooldown, feedback schema and publication/action versions.

The pure recommendation layer combines available Factor snapshots, pair evaluations, context and blocked actions. Stateful services additionally enforce current cycle, history/cooldown, one active decision, one replacement, SafetyGate and idempotency. The persisted decision/provenance pins input versions and hashes.

Activity feedback is separate for each member. It creates `TASK_RESULT`/`PAIR_ACTIVITY` evidence and new immutable snapshots. Reported change is evidence, not proof that the activity caused an outcome.

## 9A. Factor Matching model

Matching is a separate projection over the same semantic Factors, not a return to a mutable vector profile:

- `MatchingProfile` owns the public card, activation/discovery settings and pointers to actual/preference/card revisions. It is standalone from `User`, the owner semantic profile and any Pair.
- Matching actual input is built from current, unpaired `IndividualFactorSnapshot` rows only when the latest `MatchingUseGrant` for that owner/factor is active. A grant revision and consent revision are pinned into the projection.
- `PartnerPreferenceProfile` is a separate immutable revision containing typed targets, importance, flexibility and constraint mode. Allowed targets are scalar range, categorical set, constraint set and role target; hard constraints require an eligible definition and non-negotiable preference.
- `CandidateDiscoveryProjection` is a coarse, indexed eligibility projection. It intentionally carries no full Factor profile or desired-profile graph.
- `MatchingFeedSession` pins a bounded ordered candidate set to requester/profile/preference/registry/algorithm versions. `CandidatePresentationGrant` binds one requester/candidate/evaluation and both sides' profile/card/preference revisions behind an opaque hashed token and expiry.
- `MatchingEvaluationSnapshot` is the immutable internal evaluation record. It may persist numeric fit/ranking inputs for deterministic ordering and auditability, but these values are never a compatibility score or participant output.
- Candidate projection is strictly qualitative: `PROMISING | WORKABLE | LOW_INFORMATION`, a `LOW | MEDIUM | HIGH` confidence band and up to three reviewed explanations. Raw Factor values, peer preferences, contribution/rank numbers and internal hard-conflict reasons remain undisclosed.
- `Like` owns `SENT → VIEWED → RESPONDED → MATCHED` plus declined/expired/blocked terminal outcomes. `MatchingConnection` owns the two-person social link and `MATCHED | TALKING | DATING | COUPLE_CONFIRMED` stage; `MatchingBlock` is directional; `MatchingSocialEffect` makes side effects canonical.
- `MatchingConnection` is not a Pair. One participant's `REQUEST` counts only as that participant's confirmation; a distinct participant must `CONFIRM`. Only then may the transaction create one Pair and generalized `PairMembershipClaim` rows with source `MATCHING_CONNECTION`.

## 10. NEW_ONLY migration policy

The production Factor runtime has no feature flag, Factor-data dual-read or fallback to six-axis artifacts. The guarded migration:

1. validates/seeds the published registry;
2. validates Factor indexes and rejects duplicate canonical identities;
3. replays only valid raw onboarding and weekly source records;
4. records unreplayable reason counts instead of inventing values;
5. never maps aggregate axis/vector scores into atomic factors;
6. is dry-run by default and idempotent when applied in `NEW_ONLY` mode.

PairEvent has its own NEW_ONLY migration: safe semantic events receive registry/action target binding; diagnostic, raw-weekly or invalid legacy events are scrubbed or retired, never converted into Factor evidence.

The matching additive migration canonicalizes legacy social rows without reading `matchScore` into Factor intelligence. During the rollback window the original Like state may be retained in `legacyStatus` so an approved rollback artifact can be dual-readable; this compatibility field does not authorize numeric scoring or a legacy Factor fallback.
