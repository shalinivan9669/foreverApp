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

