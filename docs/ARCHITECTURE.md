# Architecture

## Layers

1. UI pages/views: `src/app/**/page.tsx`, `src/features/**`, `src/components/**`.
2. Client API layer: `src/client/api/**`.
3. API route handlers: `src/app/api/**/route.ts`.
4. Validation/response/auth guards: `src/lib/api/**`, `src/lib/auth/**`.
5. Domain services: `src/domain/services/**`.
6. State machines: `src/domain/state/**`.
7. Models/database: `src/models/**`, `src/lib/mongodb.ts`.
8. Cross-cutting layers: DTO, audit, idempotency, entitlements, rate limiting.

## Dependency direction

- UI may call client API/hooks.
- Client API calls HTTP endpoints.
- Route handlers call validation, auth, domain services, and DTO mappers.
- Domain services may call models, state machines, audit, idempotency, and entitlements helpers.
- DTO maps model/domain data to API-safe output.
- Models must not import UI/client code.
- Domain must not import React/components.
- API routes must not return raw models.

## Common anti-patterns

- Business logic inside `route.ts`.
- Direct fetch inside UI when a client API exists.
- Raw Mongoose documents returned from API.
- Trusting `userId` from body/query/path as the access subject.
- Changing a model schema without DTO review.
- Huge report/log output from an agent.
- Broad refactor mixed with a bug fix.

## Current domain policies

- User lifecycle is exposed as derived private DTO state: `auth_created` before personal profile, `onboarding_started` after personal profile, and `complete` after onboarding data exists. This avoids fake defaults for Discord-created users.
- Legacy match confirmation is an authenticated compatibility boundary only. It returns `PAIR_INVITE_REQUIRED` before any Like transition, Pair upsert, user update, or suggestion seeding; invite acceptance is the sole P0 Pair activation path.
- Legacy match scoring may remain an internal compatibility input, but participant projections redact the exact value and the primary couple UX does not expose a universal compatibility percentage.

## P0 pilot projection

- P0 pair creation is invite-only at the public boundary. `PairInvite` stores only a token hash; `PairMembershipClaim` provides the unique per-user active-membership claim used by the acceptance transaction. Legacy matching data/code remains for compatibility, but neither `/api/pairs/create` nor `/api/match/confirm` can activate a Pair.
- `MvpOnboardingSession` is a personal, versioned owner record. It is intentionally separate from the legacy dating wizard and from pair-scoped state.
- `WeeklyCycle` owns server-defined UTC lifecycle and relative participant completion. `PairStateSnapshot` is append-only evidence/version output; `latestSnapshotId` is only a guarded pointer to the immutable canonical snapshot, not a second computation source. Finalization uses a durable effects marker. Expired-history repair uses an additive completion marker plus an indexed queue bounded to eight candidates per read; failures stay pending and cannot block the remaining batch.
- `RecommendationDecision` owns offer/accept/replace/skip/expire state. It can be offered only from a publishable canonical snapshot, persists immutable input/rule/content provenance, links one activity, permits one replacement, reserves its successor identity before terminal replacement, and reconciles interrupted replacement or direct-template activity-to-decision writes. Valid-current reads heal deduplicated action notifications. Legacy suggestion endpoints are adapters over this workflow and never expose non-canonical offered activities; hashed quota claims make aliases/concurrent retries count the same canonical primary or replacement attempt once.
- `PairActivity` uses a versioned state machine and feedback schema. New records progress through accepted, started/in-progress, awaiting feedback, partial completion, and final completion; late peer feedback refines only the privacy-safe pair result and does not disclose either participant's answers.
- `SafetyGate` is owner-private input to an eligibility veto only. It is not a Pair Summary dimension, score, diagnosis, or participant-visible reason.
- History reads published cycle results only through `WeeklyCycle.latestSnapshotId` and the matching immutable snapshot. It never runs current scoring code over old raw check-ins.
- `Notification` is an owner feed with neutral allowlisted copy and unique derived dedupe identity. Notification creation is a bounded domain effect of pair, cycle, recommendation, and activity transitions.
- `ActivityTemplate` and `Questionnaire` definitions have explicit `draft -> in_review -> published -> retired` publication state, version and review/publish/retire timestamps. Canonical participant/recommendation queries fail closed unless content is exactly published; official system/seed definitions are explicitly reviewed and published.
- Pair access for cycle two resolves from pair-owned `Subscription` state. `BillingWebhookEvent` is the idempotent sandbox/provider boundary; signed provider version/time ordering and a unique current pair/provider identity prevent stale cancellation resurrection. No real provider is embedded in domain services.
- `PrivacyRequest` is a reversible owner workflow. Destructive account/shared-artifact mutation is deliberately outside it until retention and auth-revocation policy are approved.
- Mongo-backed idempotency leases, Mongo-backed rate limits, bounded connection timeouts, request correlation ids, and low-cardinality operational events keep the application layer stateless and horizontally repeatable without adding Redis or a queue prematurely. Security audit, operational events, and product analytics are separate mechanisms; product events contain only a random event id, exact allowlisted event name, technical scope, flow version, and timestamp.
- Authenticated rate-limit identities are session-user scoped. Anonymous IP policies have no shared fallback identity: they are active only when trusted ingress supplies a validated address, so a missing proxy configuration cannot become a global application kill switch.
- Document responses use a request nonce CSP generated in `src/proxy.ts`; the root layout is dynamically rendered so Next.js attaches that nonce to every framework/bootstrap script. API responses do not pay this CSP rendering cost. The exact `/.proxy/api/* -> /api/*` rewrite remains the browser transport boundary.
- Runtime Mongoose index creation is disabled. Release preflight owns the complete registry of indexed models and blocks all unique-data conflicts plus the obsolete weekly `{ userId, weekKey }` uniqueness. That legacy index cannot coexist with the supported solo-plus-pair weekly model and must be removed only through the reviewed migration gate.
- Additive fields require no destructive data rewrite, and deployment must create the declared unique indexes. An upgrade database that still has the obsolete weekly user/week unique index additionally requires the separately approved index drop described in the runbook. Invite acceptance, weekly-cycle submission/finalization, event acceptance cleanup, and activity accept/cancel/feedback completion require MongoDB transaction support.

## Detailed references

- Domain entities: `docs/02-domain-model.md`.
- State transitions: `docs/03-state-machines.md`.
- Backend implementation path: `docs/engineering/backend-playbook.md`.
- Frontend implementation path: `docs/engineering/frontend-playbook.md`.
