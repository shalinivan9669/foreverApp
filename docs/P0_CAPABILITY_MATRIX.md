# P0 capability matrix

Status: implementation-ready for pilot verification. P0 is not release-complete until the manual two-new-account scenario and database-backed concurrency checks pass in the target environment.

## Implemented capability evidence

| Pack | Capability | Primary evidence | Status |
| --- | --- | --- | --- |
| 0A | Versioned vector provenance with backward-compatible snapshots | `src/domain/services/vectorScoring.service.ts`, `src/utils/activities.ts`, `scripts/vector-scoring.selfcheck.ts` | Implemented and self-checked |
| 0B | Pair-safe weekly projection; one-sided data publishes no signals | `src/domain/services/weeklyCheckIn.service.ts`, `src/app/api/pairs/[id]/weekly-checkin/current/route.ts`, `scripts/weekly-checkin.selfcheck.ts` | Implemented and self-checked |
| 1 | Invite-only pair formation with hashed one-time token and unique membership claim | `src/domain/services/pairInvite.service.ts`, `src/models/PairInvite.ts`, `src/models/PairMembershipClaim.ts`, `scripts/pair-invite.selfcheck.ts` | Implemented and self-checked |
| 2 | Versioned resumable personal onboarding with typed privacy policy | `src/domain/services/mvpOnboarding.service.ts`, `src/models/MvpOnboardingSession.ts`, `scripts/mvp-onboarding.selfcheck.ts` | Implemented and self-checked |
| 3 | Server-owned UTC weekly cycle, skip, CAS lifecycle, immutable snapshot | `src/domain/services/weeklyCycle.service.ts`, `src/models/WeeklyCycle.ts`, `src/models/PairStateSnapshot.ts`, `scripts/weekly-cycle.selfcheck.ts` | Implemented and self-checked |
| 4 | Primary recommendation, one replacement, accept/skip, activity reconciliation | `src/domain/services/recommendationDecision.service.ts`, `src/domain/services/recommendationWorkflow.service.ts`, `scripts/activity-flow.selfcheck.ts` | Implemented and self-checked |
| 5 | Current-cycle hub and snapshot-only light history | `src/app/main-menu/page.tsx`, `src/domain/services/pairHistory.service.ts`, `scripts/pair-history.selfcheck.ts` | Implemented and self-checked |
| 6 | Owner-private safety veto with neutral fallback and sanitized audit | `src/domain/services/safetyGate.service.ts`, `src/models/SafetyGate.ts`, `scripts/safety-gate.selfcheck.ts` | Implemented and self-checked |

## Cross-cutting invariants

- Participant identity comes from the authenticated session; pair resources require centralized membership guards.
- Pair-facing DTOs contain qualitative, non-reconstructable projections only. Raw answers, notes, exact peer values, metrics, effects, safety state, and token material remain private/internal.
- The legacy diagnostics endpoint/page is retired for P0 and cannot be used to bypass the safe Pair Summary.
- Weekly history reads only the immutable snapshot selected by `WeeklyCycle.latestSnapshotId`; old raw inputs are never recomputed with current logic.
- Invite acceptance, weekly submit/skip, recommendation terminal actions, and activity creation use transactions/idempotency/CAS/unique constraints appropriate to their race surface. Legacy suggestion APIs adopt or create one canonical decision and clean up a concurrent losing offer.
- P0 automatic and direct-template activity paths exclude finance/sexuality content. The private safety gate can only narrow eligibility to neutral low-effort fallbacks.

## Release gates still requiring target-environment evidence

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Two fresh Discord accounts | Complete every item in `docs/P0_TWO_USER_E2E.md`, recording sanitized pass/fail evidence | Pending manual pilot run |
| MongoDB transaction support | Invite acceptance, weekly-cycle writes, event cleanup, and activity accept/cancel/feedback succeed on the deployment replica set; rollback is observed on an injected failure | Pending environment run |
| Database-backed races | Concurrent invite acceptance, weekly submit/skip, duplicate submit, legacy/canonical recommendation requests, and repeated activity accept/complete create exactly one canonical result | Pending environment run |
| Index readiness | Declared unique indexes for invite/membership/cycle/decision collections exist before pilot traffic | Pending deployment verification |
| Final product/privacy review | Russian copy, neutral reason codes, consent text, and sensitive-content exclusions are approved for the pilot | Pending owner review |

Automated checks validate source-level contracts and deterministic service behavior; they do not replace these release gates.
