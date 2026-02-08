# Problems Index

Purpose: track implementation gaps as a full lifecycle record.

Flow: `Problem -> Target state -> Plan -> Done / Outcome`

## Registry
| PROB-ID | Title | Status | Scope | Owner | Where fixed (files) | Docs updated |
|---|---|---|---|---|---|---|
| [PROB-001](./PROB-001-client-userid-trust-in-api.md) | Client `userId` Is Trusted By API | Done | Auth subject / self-scoped API | TBD | `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`, `src/app/api/users/me/route.ts` | `docs/04-api-contracts.md`, `docs/07-security-privacy.md` |
| [PROB-002](./PROB-002-fragmented-session-auth-adoption.md) | Session Auth Adopted Fragmentedly | Done | Session auth coverage | TBD | `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`, `src/app/api/**/route.ts` | `docs/04-api-contracts.md`, `docs/07-security-privacy.md`, `docs/data/questionnaire-flow.md` |
| [PROB-003](./PROB-003-missing-resource-authorization-guards.md) | Missing Resource-Level Authorization Guards | Done | Resource authz | TBD | `src/lib/auth/resourceGuards.ts`, `src/lib/auth/errors.ts`, `src/app/api/pairs/[id]/*` | `docs/02-domain-model.md`, `docs/03-state-machines.md`, `docs/04-api-contracts.md`, `docs/07-security-privacy.md` |
| [PROB-004](./PROB-004-no-idempotency-layer-for-mutations.md) | No Idempotency Layer For Mutations | Done | Mutation safety | TBD | `src/lib/idempotency/withIdempotency.ts`, `src/lib/idempotency/store.ts`, `src/models/IdempotencyRecord.ts` | `docs/03-state-machines.md`, `docs/04-api-contracts.md`, `docs/ADR/ADR-004-idempotency-mutations.md` |
| [PROB-005](./PROB-005-inconsistent-api-response-contracts.md) | Inconsistent API Response Contracts | Done | API envelope/errors | TBD | `src/lib/api/response.ts`, `src/lib/auth/errors.ts`, `src/app/api/**/route.ts` | `docs/04-api-contracts.md` |
| [PROB-006](./PROB-006-no-centralized-dto-layer.md) | No Centralized DTO Layer | Done | DTO mapping | TBD | `src/lib/dto/index.ts`, `src/lib/dto/*.ts`, `src/app/api/**/route.ts` | `docs/02-domain-model.md`, `docs/04-api-contracts.md`, `docs/07-security-privacy.md`, `docs/_evidence/prob-006-dto-manual-checklist-2026-02-07.md` |
| [PROB-007](./PROB-007-business-logic-inside-route-handlers.md) | Business Logic Lives Inside `route.ts` | Done | Domain services / thin controllers | TBD | `src/domain/services/*.ts`, `src/domain/state/*.ts`, `src/app/api/**/route.ts` | `docs/01-product-loop.md`, `docs/02-domain-model.md`, `docs/03-state-machines.md` |
| [PROB-008](./PROB-008-god-components-and-ui-api-coupling.md) | God Components And UI/API Coupling | Done | Frontend architecture | TBD | `src/client/api/*.ts`, `src/client/hooks/*.ts`, `src/features/*View.tsx` | `docs/04-api-contracts.md`, `docs/ui/questionnaire-cards.md` |
| [PROB-009](./PROB-009-duplicate-activity-suggestion-flows.md) | Duplicate Activity Suggestion Flows | Done | Activity suggestion pipeline | TBD | `src/domain/services/activityOffer.service.ts`, `src/domain/services/match.service.ts`, `src/app/api/pairs/[id]/suggest/route.ts` | `docs/01-product-loop.md`, `docs/03-state-machines.md`, `docs/04-api-contracts.md` |
| [PROB-010](./PROB-010-legacy-relationship-activity-still-present.md) | Legacy `RelationshipActivity` Still Present | Done | Legacy domain model | TBD | `src/domain/services/relationshipActivityLegacy.service.ts`, `src/app/api/pairs/[id]/activities/route.ts`, `src/models/RelationshipActivity.ts` | `docs/02-domain-model.md`, `docs/03-state-machines.md`, `docs/ADR/ADR-007-relationship-activity-legacy.md` |
| [PROB-011](./PROB-011-state-machine-guards-not-centralized.md) | State-Machine Guards Are Not Centralized | Done | Transition consistency | TBD | `src/domain/state/matchMachine.ts`, `src/domain/state/activityMachine.ts`, `src/domain/state/pairMachine.ts` | `docs/03-state-machines.md`, `docs/04-api-contracts.md` |
| [PROB-012](./PROB-012-analytics-events-not-unified-and-auditable.md) | Analytics Events Are Not Unified Or Auditable | Done | Audit/event runtime | TBD | `src/lib/audit/emitEvent.ts`, `src/lib/audit/eventTypes.ts`, `src/models/EventLog.ts` | `docs/05-analytics-events.md`, `docs/07-security-privacy.md`, `docs/ADR/ADR-003-event-log-monolith.md` |
| [PROB-013](./PROB-013-entitlements-abstraction-not-implemented.md) | Entitlements Abstraction Not Implemented In Runtime | Done | Billing/entitlements | TBD | `src/lib/entitlements/*.ts`, `src/models/Subscription.ts`, `src/models/EntitlementQuotaUsage.ts` | `docs/06-entitlements-billing.md`, `docs/04-api-contracts.md`, `docs/ADR/ADR-005-entitlements-billing.md` |
| [PROB-014](./PROB-014-missing-rate-limiting-and-abuse-controls.md) | Missing Rate Limiting And Abuse Controls | Done | Abuse protection | TBD | `src/lib/abuse/rateLimit.ts`, `src/models/RateLimitBucket.ts`, `src/app/api/match/*` | `docs/04-api-contracts.md`, `docs/07-security-privacy.md` |
| [PROB-015](./PROB-015-log-privacy-and-retention-policy-missing.md) | Log Privacy And Retention Policy Is Missing | Done | Privacy / retention | TBD | `src/models/EventLog.ts`, `src/lib/audit/emitEvent.ts`, `src/lib/audit/eventTypes.ts` | `docs/05-analytics-events.md`, `docs/07-security-privacy.md`, `docs/ADR/ADR-003-event-log-monolith.md` |
| [PROB-016](./PROB-016-no-cross-cutting-validation-layer-zod.md) | No Cross-Cutting Validation Layer | Done | Request validation | TBD | `src/lib/api/validate.ts`, `src/app/api/**/route.ts` | `docs/04-api-contracts.md`, `docs/07-security-privacy.md` |

## How to add a new PROB
1. Copy `docs/engineering/templates/PROB-template.md`.
2. Name file as `PROB-XXX-kebab-case.md`.
3. Fill required sections: `Problem`, `Evidence`, `Impact`, `Target state`, `Plan`, `Acceptance criteria`, `Status`.
4. Link related ADR/API/security docs in `Links`.
5. When closed, update `Done / Outcome`, add `Prevention rule`, and add post-fix `Evidence`.
6. Add or update the row in this index table.
7. Append change note to `docs/CHANGELOG.md`.

Template: `docs/engineering/templates/PROB-template.md`
