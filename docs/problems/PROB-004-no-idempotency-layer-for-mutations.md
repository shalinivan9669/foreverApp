# PROB-004: No Idempotency Layer For Mutations

## Problem
Повторные POST-запросы на мутациях не управляются единым идемпотентным ключом.

## Evidence
- ADR фиксирует отсутствие идемпотентного слоя: `docs/ADR/ADR-004-idempotency-mutations.md`.
- Мутации статусов без `Idempotency-Key`:
  - `src/app/api/activities/[id]/accept/route.ts`
  - `src/app/api/activities/[id]/cancel/route.ts`
  - `src/app/api/activities/[id]/checkin/route.ts`
  - `src/app/api/activities/[id]/complete/route.ts`
  - `src/app/api/match/accept/route.ts`
  - `src/app/api/match/reject/route.ts`
  - `src/app/api/match/confirm/route.ts`
  - `src/app/api/pairs/create/route.ts`
- В `PairQuestionnaireAnswer` и `Like` есть частичные anti-race паттерны, но нет cross-route стандарта.

## Impact
- Дубли действий при ретраях сети и повторных кликах.
- Конфликтные переходы состояний (`awaiting_initiator`, `mutual_ready`, `paired`, activity statuses).
- Повышенная сложность разборов инцидентов и reconciliation.

## Target state
- Для всех side-effect мутаций обязателен `Idempotency-Key` (header) или `clientMutationId`.
- Результат первого успешного выполнения кэшируется и возвращается повторно.
- Идемпотентность реализована централизованно, а не в каждом route.ts.

## Plan
- Итерация 1:
  - Добавить коллекцию/модель `src/models/IdempotencyKey.ts`.
  - Добавить helper `src/lib/http/idempotency.ts`.
- Итерация 2:
  - Подключить helper на `match/*`, `activities/[id]/*`, `pairs/create`, `pairs/[id]/questionnaires/[qid]/answer`.
- Итерация 3:
  - Документировать контракт в `docs/04-api-contracts.md`.
  - Обновить ADR-004 статус внедрения.

## Acceptance criteria
- Повтор одного и того же mutation-запроса с тем же ключом не создает новых side effects.
- Для конфликтующих повторов возвращается тот же статус/тот же payload.
- P0 мутации покрыты интеграционными тестами идемпотентности: `TODO(path): tests/api/idempotency/*`.

## Links
- `docs/03-state-machines.md`
- `docs/04-api-contracts.md`
- `docs/ADR/ADR-004-idempotency-mutations.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome

