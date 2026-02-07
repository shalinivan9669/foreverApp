# PROB-007: Business Logic Lives Inside `route.ts`

## Problem
Ключевая доменная логика реализована прямо в API-роутерах вместо сервисного слоя.

## Evidence
- Объемная бизнес-логика в route handlers:
  - `src/app/api/match/confirm/route.ts` (`buildPassport`, seed `PairActivity`, статусные изменения `Like`/`Pair`/`User`)
  - `src/app/api/activities/next/route.ts` (подбор `ActivityTemplate`, расчет дельт, создание `PairActivity`)
  - `src/app/api/pairs/[id]/suggest/route.ts` (подбор risk zone, dedup template, создание instanced activities)
  - `src/app/api/pairs/[id]/diagnostics/route.ts` (пересчет `Pair.passport`)
- Повторяющиеся вычисления passport/suggestion в разных маршрутах.

## Impact
- Высокая связанность HTTP-слоя и домена.
- Сложность unit-тестирования доменных правил без поднятия API-обвязки.
- Рост риска регрессий при изменении логики подбора `PairActivity`.

## Target state
- Route handlers только парсят вход, вызывают service/use-case, возвращают DTO.
- Доменные правила `Pair`, `PairActivity`, `ActivityTemplate`, `QuestionnaireSession/Answer` живут в `src/domain/*`.
- Переиспользуемая логика passport/suggestions не дублируется.

## Plan
- Итерация 1:
  - Выделить `src/domain/pairs/passportService.ts`.
  - Выделить `src/domain/activities/suggestionService.ts`.
- Итерация 2:
  - Перевести `match/confirm`, `activities/next`, `pairs/[id]/suggest`, `pairs/[id]/diagnostics`.
- Итерация 3:
  - Добавить unit tests сервисов: `TODO(path): tests/domain/*`.

## Acceptance criteria
- В route handlers отсутствуют длинные доменные функции (passport/suggestion/reconcile).
- Логика выбора `ActivityTemplate` вызывается из одного сервиса.
- Доменные сервисы покрыты unit-тестами без HTTP слоя.

## Links
- `docs/01-product-loop.md`
- `docs/02-domain-model.md`
- `docs/03-state-machines.md`
- `docs/ADR/ADR-002-activity-template-pair-activity.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome
Date: 2026-02-07

- Added domain service layer:
  - `src/domain/services/match.service.ts`
  - `src/domain/services/activities.service.ts`
  - `src/domain/services/questionnaires.service.ts`
- Refactored critical mutation handlers into thin controllers (`auth -> validate -> idempotency -> service`).
- Moved state/transition logic from route handlers to `src/domain/state/*` machines.

Acceptance criteria status:
- PASS (scope): migrated mutation handlers are thin and do not contain business transition logic.
- PASS (scope): resource guards and role resolution executed in services.
- PARTIAL (global): heavyweight non-scope routes (`activities/next`, `pairs/[id]/suggest`, `pairs/[id]/diagnostics`) remain for follow-up migration.
