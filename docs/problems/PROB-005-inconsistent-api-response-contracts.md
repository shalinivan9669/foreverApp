# PROB-005: Inconsistent API Response Contracts

## Problem
Форматы ответов API не унифицированы и зависят от конкретного route.ts.

## Evidence
- Это зафиксировано в `docs/04-api-contracts.md` (разнородные `{ ok }`, `{ error }`, массивы, DTO).
- Примеры:
  - `{ ok: true }`: `src/app/api/activities/[id]/accept/route.ts`
  - `{ error: '...' }`: `src/app/api/match/feed/route.ts`
  - массив DTO: `src/app/api/match/feed/route.ts`, `src/app/api/pairs/[id]/activities/route.ts`
  - сырые документы: `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`
  - mixed payload: `src/app/api/pairs/[id]/summary/route.ts`

## Impact
- Клиент пишет разные парсеры ошибок/данных для каждого эндпоинта.
- Невозможно централизованно логировать и анализировать ошибки по коду/типу.
- Сложнее добавлять новые каналы (Discord/TG/Web adapters) с единым контрактом.

## Target state
- Единый envelope:
  - success: `{ ok: true, data, meta? }`
  - error: `{ ok: false, error: { code, message, details? } }`
- Стандартизованные HTTP статусы и error codes.

## Plan
- Итерация 1:
  - Добавить `src/lib/http/response.ts` (`ok`, `fail`).
  - Добавить `src/lib/http/error-codes.ts`.
- Итерация 2:
  - Перевести P0/P1 endpoints (`match/*`, `pairs/*`, `questionnaires/*`, `users/me/profile-summary`).
- Итерация 3:
  - Обновить `docs/04-api-contracts.md` с единым форматом и таблицей error codes.

## Acceptance criteria
- Все публичные `/api/*` возвращают envelope с `ok`.
- Ошибки не возвращаются как свободный `string` без `code`.
- Клиент (`src/app/*`) использует единый parser ошибок.

## Links
- `docs/04-api-contracts.md`
- `docs/ADR/ADR-006-channels-as-adapters.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome

- Introduced a single response envelope for all `src/app/api/**/route.ts` handlers:
  - Success: `{ ok: true, data, meta? }`
  - Error: `{ ok: false, error: { code, message, details? } }`
- Added centralized response helpers:
  - `src/lib/api/response.ts` (`jsonOk`, `jsonError`)
- Updated auth and resource error helpers to use the same envelope:
  - `src/lib/auth/errors.ts`
- Completed rollout across all API routes: no raw `NextResponse.json(...)` remains in handlers.

### PASS/FAIL
- PASS: every `/api/*` handler now returns `ok: true|false` envelope.
- PASS: free-form string-only error payloads replaced with `{ code, message, details? }`.
- PASS: HTTP status semantics preserved for `400/401/403/404/409/500`.

## Prevention rule
- `docs/engineering/checklists/api-endpoint-checklist.md`
- `docs/engineering/checklists/dto-contract-checklist.md`

## Evidence (post-fix)
- `src/lib/api/response.ts`
- `src/lib/auth/errors.ts`
- `src/app/api/match/feed/route.ts`
- `src/app/api/pairs/[id]/summary/route.ts`
