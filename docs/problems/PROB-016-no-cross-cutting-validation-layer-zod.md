# PROB-016: No Cross-Cutting Validation Layer (Zod/Schema Contracts)

## Problem
Валидация запросов реализована вручную в каждом route.ts и не унифицирована.

## Evidence
- Ручные проверки body/query:
  - `src/app/api/match/respond/route.ts` (`if (!userId) ...`, `agreements length`, `answers length`)
  - `src/app/api/match/like/route.ts`
  - `src/app/api/questionnaires/[id]/route.ts`
  - `src/app/api/answers/bulk/route.ts`
  - `src/app/api/pairs/create/route.ts`
- `docs/04-api-contracts.md` фиксирует разнородные входные форматы.
- Нет общего слоя `contracts`/schema parser в `src/`.

## Impact
- Дублирование проверок и форматирования ошибок.
- Разный runtime-поведенческий контракт на похожих endpoint.
- Ошибки валидации труднее отслеживать и типизировать.

## Target state
- Общий контрактный слой на schema parser (например, zod):
  - input schema
  - normalized parse result
  - единый формат validation error.
- Схемы reused между handler/service/tests.

## Plan
- Итерация 1:
  - Создать `src/contracts/*` и `src/lib/http/validate.ts`.
- Итерация 2:
  - Перевести P0/P1 write endpoints (`match/*`, `pairs/*`, `questionnaires/*`, `users/*`).
- Итерация 3:
  - Добавить генерацию типов/контрактов для docs (или ручную таблицу в `docs/04-api-contracts.md`).

## Acceptance criteria
- В write endpoints нет ad-hoc `if (!field)` валидации без schema parser.
- Validation errors возвращаются в одном формате.
- Контракт входа типизирован и переиспользуется в тестах.

## Links
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome

- Introduced shared validation module:
  - `src/lib/api/validate.ts` (`parseJson`, `parseQuery`, `parseParams`)
- Added unified validation error contract:
  - `400` + `{ ok: false, error: { code: 'VALIDATION_ERROR', message, details } }`
- Rolled validation helpers out to all API handlers:
  - body JSON parsing moved to `parseJson(...)`
  - query parsing moved to `parseQuery(...)`
  - route params parsing moved to `parseParams(...)`
- Added explicit `zod` dependency in project manifest.

### PASS/FAIL
- PASS: no route relies on ad-hoc `if (!field)` checks as the only validation layer.
- PASS: validation failures are normalized through one response format and one error code.
- PASS: parsing/validation concerns are now cross-cutting and reusable.
