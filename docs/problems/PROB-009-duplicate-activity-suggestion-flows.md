# PROB-009: Duplicate Activity Suggestion Flows

## Problem
Логика предложения активностей пары задублирована в нескольких API-маршрутах.

## Evidence
- Почти одинаковые реализации:
  - `src/app/api/pairs/[id]/suggest/route.ts`
  - `src/app/api/pairs/[id]/activities/suggest/route.ts`
- Частично пересекающийся сценарий генерации `offered` активности:
  - `src/app/api/activities/next/route.ts`
  - `src/app/api/pairs/[id]/activities/from-template/route.ts`
- Везде затрагиваются одни и те же сущности `Pair`, `Pair.passport.riskZones`, `ActivityTemplate`, `PairActivity`.

## Impact
- Разъезд правил подбора `difficulty`, dedup и fallback.
- Повторные багфиксы в нескольких маршрутах.
- Непредсказуемое поведение UI в `couple-activity` при переключении endpoint.

## Target state
- Единый suggestion engine:
  - вход: `pairId`, контекст fatigue/readiness, strategy
  - выход: список `PairActivity` в статусе `offered`.
- Один публичный endpoint для suggest, остальное как internal alias до удаления.

## Plan
- Итерация 1:
  - Выделить `src/domain/activities/suggestForPair.ts`.
- Итерация 2:
  - Перевести `pairs/[id]/suggest` и `pairs/[id]/activities/suggest` на общий сервис.
- Итерация 3:
  - Удалить дублирующий endpoint (или оставить 301/compat-обертку).
  - Обновить `docs/04-api-contracts.md`.

## Acceptance criteria
- Подбор suggestion происходит через одну функцию/сервис.
- `pairs/[id]/suggest` и `pairs/[id]/activities/suggest` возвращают идентичный результат при одинаковом входе.
- Документация содержит только один canonical endpoint.

## Links
- `docs/01-product-loop.md`
- `docs/03-state-machines.md`
- `docs/04-api-contracts.md`
- `docs/ADR/ADR-002-activity-template-pair-activity.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome

