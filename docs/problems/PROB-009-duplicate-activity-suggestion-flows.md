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
Date: 2026-02-08

- Unified suggestion generation in one canonical service:
  - `src/domain/services/activityOffer.service.ts`
  - `suggestActivities(...)` is the single offer pipeline.
- Routed all suggestion entrypoints through canonical pipeline:
  - `/api/pairs/[id]/suggest`
  - `/api/pairs/[id]/activities/suggest`
  - `/api/activities/next` (now uses `suggestActivities(..., count: 1)`)
  - `match.confirm` initial seeding also delegates to the same service.
- Standardized response DTO for offers:
  - `ActivityOfferDTO` with fields:
    - `id`, `templateId`, `title`, `axis`, `difficulty`, `stepsPreview`, `reward`, `expiresAt`, `source`
- Added suggestion generation audit event:
  - `SUGGESTIONS_GENERATED`.
- Added quota gate before suggestion generation:
  - `activities.suggestions.per_day`.

PASS/FAIL:
- PASS: no duplicated template sampling logic remains outside `activityOfferService`.
- PASS: `/pairs/[id]/suggest` and `/pairs/[id]/activities/suggest` return one DTO schema.
- PASS: `activities/next` uses same pipeline semantics (single-offer mode).
- PASS: suggestion flow now has entitlement/quota enforcement before generation.
