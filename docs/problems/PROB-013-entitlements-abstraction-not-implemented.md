# PROB-013: Entitlements Abstraction Not Implemented In Runtime

## Problem
Решение по entitlements/billing принято документально, но runtime-слой отсутствует.

## Evidence
- В docs/ADR зафиксировано отсутствие billing-кода:
  - `docs/06-entitlements-billing.md`
  - `docs/ADR/ADR-005-entitlements-billing.md`
  - `docs/_evidence/search-no-billing.txt`
- В runtime только зачаток `featureFlags` в profile-summary:
  - `src/app/api/users/me/profile-summary/route.ts`
  - `src/app/(auth)/profile/page.tsx`
- Нет моделей/сервисов `Entitlement`, `BillingProvider`, `/api/billing/*`, `/api/entitlements`.

## Impact
- `featureFlags` не имеют надежного источника истинности.
- Невозможно внедрить платные планы и контроль доступа на feature уровне.
- Риск ad-hoc решений по paywall в UI и route.ts.

## Target state
- Введена доменная абстракция:
  - `Entitlement` как источник доступа.
  - `BillingProvider` как адаптер канала оплаты.
- `featureFlags` вычисляются из entitlements, а не задаются вручную в `User`.

## Plan
- Итерация 1:
  - Добавить `src/models/Entitlement.ts`.
  - Добавить `src/domain/entitlements/service.ts`.
- Итерация 2:
  - Добавить API:
    - `POST /api/billing/checkout`
    - `POST /api/billing/webhook`
    - `GET /api/entitlements`
- Итерация 3:
  - Интегрировать вычисление `featureFlags` из entitlements в `users/me/profile-summary`.
  - Обновить `docs/06-entitlements-billing.md`.

## Acceptance criteria
- В коде есть единый способ проверить entitlement пользователя/пары.
- `featureFlags` в profile-summary формируются из entitlement-слоя.
- Документированные планы (`free`, `couple_premium`, `solo_premium`) отражены в runtime типах.

## Links
- `docs/06-entitlements-billing.md`
- `docs/ADR/ADR-005-entitlements-billing.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome
Date: 2026-02-08

- Implemented runtime entitlements layer:
  - `src/lib/entitlements/types.ts`
  - `src/lib/entitlements/catalog.ts`
  - `src/lib/entitlements/resolve.ts`
  - `src/lib/entitlements/guards.ts`
- Added storage:
  - `src/models/Subscription.ts` (plan/status/period/meta source of truth)
  - `src/models/EntitlementQuotaUsage.ts` (quota windows and usage)
- Added dev/admin grant endpoint:
  - `POST /api/entitlements/grant` (dev enabled, production only via admin header key)
- Applied runtime checks in key endpoints:
  - `/api/match/{like,respond,accept,reject,confirm}`
  - `/api/pairs/create`
  - `/api/pairs/[id]/suggest`
  - `/api/pairs/[id]/activities/suggest`
  - `/api/activities/next`
- Integrated profile summary with entitlement-derived feature flags:
  - `src/app/api/users/me/profile-summary/route.ts`

PASS/FAIL:
- PASS: `resolveEntitlements(currentUserId, pairId?)` returns `EntitlementsSnapshot`.
- PASS: `assertEntitlement` emits `ENTITLEMENT_DENIED` and throws `402 ENTITLEMENT_REQUIRED`.
- PASS: `assertQuota` enforces limits and throws `403 QUOTA_EXCEEDED`.
- PASS: free fallback works when no active subscription exists.
- PASS: dev grant path issues runtime-effective subscription records without external billing.
