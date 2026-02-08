# ADR Index

Purpose: keep architecture decisions discoverable and linked to runtime modules.

## Registry
| ADR-ID | Title | Date | Decision | Impacted modules |
|---|---|---|---|---|
| [ADR-001](./ADR-001-mongo-mongoose.md) | MongoDB + Mongoose For MVP | 2026-02-04 | Keep MongoDB + Mongoose as current persistence stack. | `src/lib/mongodb.ts`, `src/models/*` |
| [ADR-002](./ADR-002-activity-template-pair-activity.md) | ActivityTemplate + PairActivity As Single Activity System | 2026-02-04 | Canonical activity model is `ActivityTemplate + PairActivity`; `RelationshipActivity` is legacy. | `src/models/ActivityTemplate.ts`, `src/models/PairActivity.ts`, `src/domain/services/activityOffer.service.ts` |
| [ADR-003](./ADR-003-event-log-monolith.md) | Event Log Inside Monolith | 2026-02-08 | Keep audit/event logging in monolith Mongo with typed `emitEvent`. | `src/models/EventLog.ts`, `src/lib/audit/emitEvent.ts`, `src/lib/audit/eventTypes.ts` |
| [ADR-004](./ADR-004-idempotency-mutations.md) | Idempotency For Mutations | 2026-02-04 | Critical mutations require idempotency key handling and replay-safe storage. | `src/lib/idempotency/*`, `src/models/IdempotencyRecord.ts`, `src/app/api/*` (mutations) |
| [ADR-005](./ADR-005-entitlements-billing.md) | Billing Abstraction Via Entitlements | 2026-02-04 | Billing provider is abstracted behind entitlements/quota guards. | `src/lib/entitlements/*`, `src/models/Subscription.ts`, `src/models/EntitlementQuotaUsage.ts` |
| [ADR-006](./ADR-006-channels-as-adapters.md) | Channels As Adapters (Discord/TG/Web) | 2026-02-04 | Channels are adapters over one shared domain and API contract. | `src/app/page.tsx`, `src/app/api/exchange-code/route.ts`, `src/client/api/*` |
| [ADR-007](./ADR-007-relationship-activity-legacy.md) | Deprecate RelationshipActivity In Favor Of PairActivity | 2026-02-04 | New features target `PairActivity`; legacy flow remains read-only compatibility. | `src/models/RelationshipActivity.ts`, `src/domain/services/relationshipActivityLegacy.service.ts`, `src/app/api/pairs/[id]/activities/route.ts` |

## How to add ADR
1. Copy `docs/engineering/templates/ADR-template.md`.
2. Name file as `ADR-XXX-kebab-case.md`.
3. Fill sections: `Context`, `Decision`, `Consequences`, `Evidence`.
4. Add concrete runtime references (`path:line` when possible).
5. Add row to this table.
6. Link related PROB files if decision closes technical debt.
7. Append note to `docs/CHANGELOG.md`.

Template: `docs/engineering/templates/ADR-template.md`
