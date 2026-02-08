# PROB-011: State-Machine Guards Are Not Centralized

## Problem
Переходы статусов (`Pair`, `PairActivity`, `Like`, `PairQuestionnaireSession`) делаются локально в роутерах без общего transition-guard слоя.

## Evidence
- Прямые установки статуса в route.ts:
  - `src/app/api/activities/[id]/accept/route.ts` (`accepted`)
  - `src/app/api/activities/[id]/cancel/route.ts` (`cancelled`)
  - `src/app/api/activities/[id]/checkin/route.ts` (`awaiting_checkin`)
  - `src/app/api/activities/[id]/complete/route.ts` (`completed_*|failed`)
  - `src/app/api/pairs/[id]/pause/route.ts` / `resume/route.ts`
  - `src/app/api/match/accept/route.ts`, `reject/route.ts`, `respond/route.ts`, `confirm/route.ts`
- `docs/03-state-machines.md` описывает статусы, но проверка переходов реализована фрагментарно и не централизована.

## Impact
- Возможны невалидные переходы и расхождения между роутами.
- Трудно гарантировать инварианты (`mutual_ready -> paired`, `offered -> accepted -> ...`).
- Трудно строить надежную аудит-трассировку переходов.

## Target state
- Единые state-transition функции по сущностям:
  - `transitionLike`
  - `transitionPair`
  - `transitionPairActivity`
  - `transitionPairQuestionnaireSession`
- Все маршруты вызывают только эти transition services.

## Plan
- Итерация 1:
  - Добавить `src/domain/state-machines/*` с таблицами допустимых переходов.
- Итерация 2:
  - Перевести route handlers на transition services.
- Итерация 3:
  - Добавить unit tests переходов и контракт на `409 invalid_state`.

## Acceptance criteria
- В route handlers нет “сырых” `doc.status = ...` без вызова transition service.
- Невалидный переход стабильно возвращает `409` и код ошибки `INVALID_STATE`.
- `docs/03-state-machines.md` синхронизирован с фактическими таблицами переходов.

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
Date: 2026-02-07

- Added centralized transition machines:
  - `src/domain/state/matchMachine.ts`
  - `src/domain/state/activityMachine.ts`
  - `src/domain/state/questionnaireMachine.ts`
- Migrated critical mutation routes to use domain services + machines (`match/*`, `activities/[id]/*`, `answers/bulk`, `pairs/[id]/questionnaires/[qid]/*`).
- Enforced `STATE_CONFLICT` (`409`) for forbidden transitions in migrated flow.

Acceptance criteria status:
- PASS (scope): migrated routes no longer mutate status directly in `route.ts`.
- PASS (scope): invalid transition now returns `409` with `STATE_CONFLICT`.
- PASS: `docs/03-state-machines.md` updated with centralized transition rules.
- PARTIAL (global): non-scope routes still need migration to machine-based transitions.

Date: 2026-02-08

- Added centralized pair transition machine:
  - `src/domain/state/pairMachine.ts` (`CREATE`, `PAUSE`, `RESUME`)
- Added pair transition service orchestration:
  - `src/domain/services/pairs.service.ts`
- Migrated pair transition endpoints:
  - `/api/pairs/create` POST
  - `/api/pairs/[id]/pause` POST
  - `/api/pairs/[id]/resume` POST

Acceptance criteria status (updated):
- PASS (transition endpoints): transition-based mutation routes (`match`, `activity`, `pair`, `pair questionnaire`) now use centralized machine guards.
- PASS: forbidden transitions return stable `409 STATE_CONFLICT`.

## Prevention rule
- `docs/engineering/checklists/state-machine-checklist.md`
- `docs/engineering/checklists/idempotency-checklist.md`

## Evidence (post-fix)
- `src/domain/state/matchMachine.ts`
- `src/domain/state/activityMachine.ts`
- `src/domain/state/questionnaireMachine.ts`
- `src/domain/state/pairMachine.ts`
