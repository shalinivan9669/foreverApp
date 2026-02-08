# PROB-014: Missing Rate Limiting And Abuse Controls

## Problem
API не имеет централизованного rate limiting и анти-абьюз ограничений.

## Evidence
- Нет project-level middleware или rate-limit модуля в `src/`:
  - `TODO(path): src/middleware.ts`
  - `TODO(path): src/lib/rate-limit/*`
- Потенциально уязвимые к спаму/брутфорсу маршруты:
  - `src/app/api/exchange-code/route.ts`
  - `src/app/api/match/like/route.ts`
  - `src/app/api/match/respond/route.ts`
  - `src/app/api/match/confirm/route.ts`
  - `src/app/api/logs/route.ts`
  - `src/app/api/pairs/[id]/suggest/route.ts`

## Impact
- Риск abuse сценариев: спам лайков, массовое создание pair/activity, flood логов.
- Дополнительная нагрузка на Mongo (`Like`, `PairActivity`, `Log`).
- Нет предсказуемой деградации под высоким трафиком.

## Target state
- Централизованный rate limit по ключам:
  - `sessionUserId` (если есть)
  - `IP` fallback.
- Отдельные лимиты по route-группам (auth, writes, reads).
- Единый ответ `429` + `Retry-After`.

## Plan
- Итерация 1:
  - Добавить `src/lib/security/rateLimit.ts`.
  - Добавить policy-конфиг `src/lib/security/rateLimitPolicies.ts`.
- Итерация 2:
  - Подключить лимиты на P0 write endpoints.
- Итерация 3:
  - Обновить `docs/07-security-privacy.md` лимитами и operational knobs.

## Acceptance criteria
- P0 write endpoints ограничены по частоте.
- При превышении лимита API возвращает `429` и `Retry-After`.
- Логи содержат метрики срабатывания лимитов (без утечки PII).

## Links
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`

## Status
- Owner: TBD
- Priority: P0
- ETA:
- Date created: 2026-02-07

## Done / Outcome
Date: 2026-02-08

- Added centralized Mongo fixed-window rate limiter:
  - `src/models/RateLimitBucket.ts` (TTL bucket storage)
  - `src/lib/abuse/rateLimit.ts` (`enforceRateLimit`, policy registry, 429 response contract)
- Applied policy-based throttling to key endpoints:
  - `/api/exchange-code`: `10/min` + `30/hour` per IP
  - `/api/match/*` mutating: `30/min` per session user (IP fallback)
  - `/api/logs`: `60/min` per session user (IP fallback)
  - `/api/users` POST: `5/min` per IP
  - `/api/pairs/create` POST: `5/min` per IP
- Added abuse audit signal on limit hit:
  - `ABUSE_RATE_LIMIT_HIT` event via `emitEvent`

Acceptance criteria status:
- PASS: P0 write/auth endpoints now have centralized frequency guards.
- PASS: overflow returns `429 RATE_LIMITED` with `error.details.retryAfterMs` and `Retry-After` header.
- PASS: rate-limit hits are auditable without sensitive payload leakage.
