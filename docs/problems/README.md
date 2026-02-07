# Problems Registry

Назначение: фиксировать технические проблемы в формате жизненного цикла:

`Problem -> Target state -> Plan -> Done/Outcome`

Это не замена ADR:
- `docs/ADR/*` фиксируют архитектурные решения.
- `docs/problems/*` фиксируют конкретные разрывы и долги по внедрению решений.

## Правила
- Один файл = одна проблема.
- Имя файла: `PROB-XXX-kebab-case.md`.
- Статус хранится внутри файла (`Owner`, `Priority`, `ETA`, `Date created`).
- Раздел `Done / Outcome` заполняется только после закрытия.

## Стартовый набор
- `PROB-001-client-userid-trust-in-api.md`
- `PROB-002-fragmented-session-auth-adoption.md`
- `PROB-003-missing-resource-authorization-guards.md`
- `PROB-004-no-idempotency-layer-for-mutations.md`
- `PROB-005-inconsistent-api-response-contracts.md`
- `PROB-006-no-centralized-dto-layer.md`
- `PROB-007-business-logic-inside-route-handlers.md`
- `PROB-008-god-components-and-ui-api-coupling.md`
- `PROB-009-duplicate-activity-suggestion-flows.md`
- `PROB-010-legacy-relationship-activity-still-present.md`
- `PROB-011-state-machine-guards-not-centralized.md`
- `PROB-012-analytics-events-not-unified-and-auditable.md`
- `PROB-013-entitlements-abstraction-not-implemented.md`
- `PROB-014-missing-rate-limiting-and-abuse-controls.md`
- `PROB-015-log-privacy-and-retention-policy-missing.md`
- `PROB-016-no-cross-cutting-validation-layer-zod.md`
