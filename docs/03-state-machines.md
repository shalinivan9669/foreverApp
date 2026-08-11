# Current state machines

Status: active reference. Updated 2026-08-11.

Domain transition guards live in `src/domain/state/**`; stateful orchestration and transactional cleanup live in `src/domain/services/**`. Forbidden transitions return a domain conflict instead of being repaired by the client.

## PairInvite

```text
[none] → ACTIVE
ACTIVE → ACCEPTED | CANCELLED | EXPIRED
ACTIVE --reissue→ CANCELLED + new ACTIVE invite
```

Accept by the same authenticated user is replay-safe; any other terminal/reused token returns a generic unavailable result. Only the token hash is persisted.

## Pair

```text
[none] --invite accept→ active
active --pause→ paused
paused --resume→ active
active|paused --end→ ended
```

Pause/resume are idempotent no-ops in their current state. `ended` is terminal. End runs pair-scoped cleanup and releases membership claims; reconnect creates a new Pair rather than reviving the old id.

## WeeklyCycle

Cycle lifecycle:

```text
OPEN --deadline/pair end→ EXPIRED
```

Each unordered member has an independent terminal completion:

```text
PENDING → SUBMITTED | SKIPPED | EXPIRED
```

Pair readiness is separate from lifecycle: `NOT_READY | PARTIAL | ENOUGH | INSUFFICIENT | EXPIRED`. One valid submit remains partial/insufficient and publishes no pair signal. Two valid submissions materialize one canonical semantic result. A submission lease/CAS serializes submit versus skip; retries cannot create duplicate evidence/snapshots.

## RecommendationDecision

```text
[none] → OFFERED(primary)
OFFERED → ACCEPTED | SKIPPED | REPLACED | EXPIRED
REPLACED → new OFFERED(replacement depth 1)
```

Only one replacement is allowed. One pair/cycle has at most one current offered decision. Acceptance links one activity; reconciliation repairs an interrupted pointer write.

## PairActivity

Canonical lifecycle-v3:

```text
offered → accepted → in_progress → awaiting_feedback
offered|accepted|in_progress|awaiting_feedback → cancelled
awaiting_feedback → completed_partial | completed_success | failed
completed_partial → completed_success | failed
```

Legacy-readable `suggested`/`awaiting_checkin` records may remain in persistence compatibility shapes, but new recommendation-backed activities use the current lifecycle and Factor action definition. First-member feedback yields a privacy-safe partial result; late peer feedback refines it once and materializes evidence idempotently.

## Pair questionnaire session

```text
[none] → in_progress
in_progress --start/retry/answer→ in_progress
in_progress --all members/all questions→ completed
```

Answers are private source records. Completion does not create legacy passport/vector mutations.

## PrivacyRequest

```text
[none] → PENDING_CONFIRMATION
PENDING_CONFIRMATION → CANCELLED | EXECUTING
EXECUTING → EXECUTED | FAILED
FAILED → EXECUTING
```

Only an explicit `DELETE_ACCOUNT` confirmation enters execution. Existing sessions are revoked before destructive work. Retry is allowed from `FAILED`; `EXECUTED` and `CANCELLED` are terminal.

## SafetyGate and PartnerSignal

SafetyGate is not a relationship score/state machine. It is an owner-private boolean eligibility veto scoped to one Pair; Pair end revokes it.

PartnerSignal is created only by an explicit confirmed send. A unique source-check-in binding makes resend idempotent; attempting different text for the same source conflicts. A TTL expires the stored signal after 30 days.

## Legacy matching

The old `/api/match/**` transition surface is removed from active runtime. `/api/pairs/create` remains only as a guarded compatibility seam and returns `PAIR_INVITE_REQUIRED`; invitation acceptance is the sole Pair-activation path. Retained legacy records never bypass Pair membership, Factor disclosure or the public core lifecycle.
