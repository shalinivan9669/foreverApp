# PROB-003: Missing Resource-Level Authorization Guards

## Problem
Роуты часто проверяют только наличие `id` ресурса, но не право текущего пользователя на этот ресурс.

## Evidence
- Операции над `PairActivity` без проверки участника пары:
  - `src/app/api/activities/[id]/accept/route.ts`
  - `src/app/api/activities/[id]/cancel/route.ts`
  - `src/app/api/activities/[id]/checkin/route.ts`
  - `src/app/api/activities/[id]/complete/route.ts`
- Чтение/пересчет пары без проверки membership:
  - `src/app/api/pairs/[id]/summary/route.ts`
  - `src/app/api/pairs/[id]/diagnostics/route.ts`
  - `src/app/api/pairs/[id]/activities/route.ts`
- `PairQuestionnaireSession` start не проверяет, что вызывающий пользователь входит в `Pair.members`: `src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts`.

## Impact
- Любой авторизованный (или даже неавторизованный, где нет session guard) может выполнять действия над чужими ресурсами по угадываемому id.
- Риск утечки `Pair.passport`, `PairActivity.answers`, состояния лайков/пар.
- Неконсистентность доменной модели доступа.

## Target state
- Для `Pair` и `PairActivity` действует общий guard: `currentUser` должен входить в `pair.members`.
- Для `QuestionnaireSession/Answer` guard учитывает `session.pairId` и `by` (`A|B`) от membership.
- Каждый route явно разделяет `401` (нет сессии) и `403` (нет доступа).

## Plan
- Итерация 1:
  - Добавить `requirePairMember(pairId, userId)` и `requireActivityMember(activityId, userId)` в `src/lib/auth/resourceGuards.ts`.
- Итерация 2:
  - Подключить guards в `activities/[id]/*`, `pairs/[id]/*`, `pairs/[id]/questionnaires/[qid]/*`.
- Итерация 3:
  - Добавить интеграционные тесты доступа: `TODO(path): tests/api/authz/*`.

## Acceptance criteria
- Нельзя прочитать/изменить чужой `Pair`, `PairActivity`, `PairQuestionnaireSession` с валидной, но чужой сессией.
- Все защищенные роуты возвращают `403` при чужом ресурсе.
- В роутерах нет прямых `findById` без последующей authz-проверки для приватных сущностей.

## Links
- `docs/02-domain-model.md`
- `docs/03-state-machines.md`
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`

## Status
- Owner: TBD
- Priority: P0
- ETA:
- Date created: 2026-02-07

## Done / Outcome
- 2026-02-07 (Iteration 1-2 / centralized resource authz):
  - Добавлен единый слой resource-level guards: `src/lib/auth/resourceGuards.ts`:
    - `requirePairMember(pairId, currentUserId) -> { pair, by: 'A'|'B' }`
    - `requireActivityMember(activityId, currentUserId) -> { activity, pair, by }`
    - `requireLikeParticipant(likeId, currentUserId) -> { like, role: 'from'|'to' }`
  - Добавлен `jsonNotFound(...)` в `src/lib/auth/errors.ts` для унификации `404` ответов из guard-слоя.
  - Guard-слой подключен во все целевые маршруты:
    - Pair-scoped: `pairs/[id]/summary`, `diagnostics`, `activities`, `activities/suggest`, `activities/from-template`, `suggest`, `pause`, `resume`, `questionnaires/[qid]/start`, `questionnaires/[qid]/answer`.
    - Activity-scoped: `activities/[id]/accept`, `cancel`, `checkin`, `complete`.
    - Like-scoped: `match/like/[id]`, `match/respond`, `match/accept`, `match/reject`, `match/confirm`.
  - Для pair-questionnaire role `A|B` теперь вычисляется только сервером через `requirePairMember(...).data.by`; зависимость от клиентского `by` убрана.
  - Единая матрица ошибок для защищенных роутов:
    - `401` — только когда `requireSession` не проходит.
    - `403` — валидная сессия, но пользователь не имеет доступа к чужому ресурсу.
    - `404` — ресурс не существует.

Acceptance criteria:
- Нельзя прочитать/изменить чужой `Pair`, `PairActivity`, `PairQuestionnaireSession` с валидной, но чужой сессией: `PASS`.
- Все защищенные роуты возвращают `403` при чужом ресурсе: `PASS`.
- В роутерах нет прямых `findById` без authz-проверки для приватных сущностей из scope PROB-003: `PASS`.
