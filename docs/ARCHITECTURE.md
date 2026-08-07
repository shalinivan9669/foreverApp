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
- Match score creation uses the existing vector distance score. If either side has no usable vectors yet, create-like returns `0` rather than a placeholder constant.

## P0 pilot projection

- P0 pair creation is invite-only at the public boundary. `PairInvite` stores only a token hash; `PairMembershipClaim` provides the unique per-user active-membership claim used by the acceptance transaction. Legacy matching data/code remains for compatibility, but neither `/api/pairs/create` nor `/api/match/confirm` can activate a Pair.
- `MvpOnboardingSession` is a personal, versioned owner record. It is intentionally separate from the legacy dating wizard and from pair-scoped state.
- `WeeklyCycle` owns server-defined UTC lifecycle and relative participant completion. `PairStateSnapshot` is append-only evidence/version output; `latestSnapshotId` is only a guarded pointer to the immutable canonical snapshot, not a second computation source.
- `RecommendationDecision` owns offer/accept/replace/skip/expire state. It links one activity, permits one replacement, and reconciles an interrupted terminal decision-to-activity write. Legacy suggestion endpoints are adapters over this workflow and never expose non-canonical offered activities.
- `SafetyGate` is owner-private input to an eligibility veto only. It is not a Pair Summary dimension, score, diagnosis, or participant-visible reason.
- History reads published cycle results only through `WeeklyCycle.latestSnapshotId` and the matching immutable snapshot. It never runs current scoring code over old raw check-ins.
- These collections and indexes are additive. No destructive migration is required, but deployment must create the declared unique indexes. Invite acceptance, weekly-cycle submission/finalization, event acceptance cleanup, and activity accept/cancel/feedback completion require MongoDB transaction support.

## Detailed references

- Domain entities: `docs/02-domain-model.md`.
- State transitions: `docs/03-state-machines.md`.
- Backend implementation path: `docs/engineering/backend-playbook.md`.
- Frontend implementation path: `docs/engineering/frontend-playbook.md`.
