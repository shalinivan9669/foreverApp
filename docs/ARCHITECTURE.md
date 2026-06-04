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
- Match confirmation uses safe ordering: state machine check, atomic Like transition to `paired`, then Pair upsert/activation, competing Like expiry, user relationship status update, and suggestion seeding.
- Match confirmation is not wrapped in a MongoDB transaction yet. The remaining risk is a later side-effect failure after the Like has been paired; the critical invariant is that Pair activation cannot happen before the Like transition succeeds.
- Match score creation uses the existing vector distance score. If either side has no usable vectors yet, create-like returns `0` rather than a placeholder constant.

## Detailed references

- Domain entities: `docs/02-domain-model.md`.
- State transitions: `docs/03-state-machines.md`.
- Backend implementation path: `docs/engineering/backend-playbook.md`.
- Frontend implementation path: `docs/engineering/frontend-playbook.md`.
