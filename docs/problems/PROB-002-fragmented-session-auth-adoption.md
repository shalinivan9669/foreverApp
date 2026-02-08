# PROB-002: Session Auth Adopted Fragmentedly

## Problem
Сессионная аутентификация внедрена точечно, но не как единый стандарт для всех API.

## Evidence
- JWT/session создается в `src/app/api/exchange-code/route.ts`, проверяется в `src/lib/jwt.ts`.
- Роуты с session-проверкой:
  - `src/app/api/questionnaires/cards/route.ts`
  - `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts`
- Роуты без session-проверки при том же контуре данных:
  - `src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts`
  - `src/app/api/pairs/[id]/summary/route.ts`
  - `src/app/api/pairs/[id]/diagnostics/route.ts`
  - `src/app/api/activities/[id]/*`
- Повторение однотипной логики `getSessionUserId` в нескольких роутерах вместо общего auth-модуля.

## Impact
- Разные правила доступа в соседних сценариях.
- Повышенный риск обхода защиты через “слабый” маршрут.
- Технический долг: поддержку auth приходится чинить в каждом route.ts отдельно.

## Target state
- Единый auth entrypoint (`requireSession`) для всех приватных маршрутов.
- Явный список public маршрутов.
- Отсутствие дублирующих реализаций session-парсинга в route handlers.

## Plan
- Итерация 1:
  - Создать `src/lib/auth/session.ts` и `src/lib/auth/guards.ts`.
  - Перенести в них cookie/JWT парсинг и базовые проверки.
- Итерация 2:
  - Подключить guards во всех приватных `/api/*`.
  - Вынести общий `jsonUnauthorized`/`jsonForbidden` в `src/lib/http/errors.ts`.
- Итерация 3:
  - Обновить карту API в `docs/04-api-contracts.md` с полем `Auth/Access`.
  - Зафиксировать матрицу public/private в `docs/07-security-privacy.md`.

## Acceptance criteria
- Нет приватных роутов без `requireSession`.
- В проекте одна реализация извлечения `session userId`.
- Для каждого приватного роутера документировано `401/403` поведение.

## Links
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`
- `docs/data/questionnaire-flow.md`
- `docs/ADR/ADR-006-channels-as-adapters.md`

## Status
- Owner: TBD
- Priority: P0
- ETA:
- Date created: 2026-02-07

## Done / Outcome
- 2026-02-07 (Iteration 1 / MVP):
  - Добавлены единые auth-модули: `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`, `src/lib/auth/errors.ts`.
  - Приватные роуты `activities/*`, `pairs/*`, `match/*`, `users/*`, `answers/bulk`, `questionnaires/cards`, `questionnaires/[id] POST`, `logs` переведены на `requireSession`.
  - Удалены дубли локального session-парсинга в роутерах (`getSessionUserId`).

## Prevention rule
- `docs/engineering/backend-playbook.md#golden-path-for-a-new-api-endpoint`
- `docs/engineering/checklists/api-endpoint-checklist.md`

## Evidence (post-fix)
- `src/lib/auth/session.ts`
- `src/lib/auth/guards.ts`
- `src/app/api/questionnaires/cards/route.ts`
- `src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts`
