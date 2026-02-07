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

