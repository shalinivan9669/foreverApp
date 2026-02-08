**Как Сейчас (Обзор)**
1. В репозитории не найдено упоминаний `billing/entitlement/stripe/subscription/premium/payment` (по результатам поиска). Доказательства: `docs/_evidence/search-no-billing.txt:1-3`.
2. Есть OAuth-обмен через `/api/exchange-code` с возвратом `access_token`. Доказательства: `src/app/api/exchange-code/route.ts:3-27`.
3. В `profile-summary` возвращаются `featureFlags` и `PERSONAL_ACTIVITIES`. Доказательства: `src/app/api/users/me/profile-summary/route.ts:125-154`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Поиск по billing/entitlement без совпадений | config | `docs/_evidence/search-no-billing.txt:1-3` | `result: NO_MATCHES` |
| OAuth exchange-code | api | `src/app/api/exchange-code/route.ts:3-27` | `const { code, redirect_uri } = (await req.json()) as {` |
| Возврат featureFlags в profile-summary | api | `src/app/api/users/me/profile-summary/route.ts:125-154` | `featureFlags: user.featureFlags ?? {},` |

**Куда Идём (Entitlements/Billing Abstraction)**
- Ввести сущность `Entitlement` (userId/pairId, planId, status, startedAt, expiresAt, source, metadata).
- BillingProvider interface включает: `createCheckoutSession(ctx)`, `cancelSubscription(ctx)`, `getEntitlements(ctx)`, `handleWebhook(ctx)`.
- MVP-планы: `free`, `couple_premium`, `solo_premium`.
- MVP-каналы оплаты: in-app purchase, Stripe, redeem codes (на старте можно только redeem codes).
- API-маршруты: `POST /api/billing/checkout`, `POST /api/billing/webhook`, `GET /api/entitlements?userId=...`.
- Маппинг на модель User/Pair: `featureFlags` заполняется через entitlements.

## Update 2026-02-08 (Runtime Entitlements Contract)

### Runtime primitives
- `resolveEntitlements(currentUserId, pairId?) -> EntitlementsSnapshot`
- `assertEntitlement(req, snapshot, featureKey)`
- `assertQuota(req, snapshot, quotaKey)`

### Plans and statuses
- Plans: `FREE`, `SOLO`, `COUPLE`
- Subscription statuses: `active`, `trial`, `grace`, `expired`
- Default behavior: if no effective subscription is found, runtime falls back to `FREE`

### Storage
- `subscriptions` collection (`src/models/Subscription.ts`)
  - `userId`, `plan`, `status`, `periodEnd?`, `meta`, timestamps
- `entitlement_quota_usage` collection (`src/models/EntitlementQuotaUsage.ts`)
  - per-user fixed window counters for quota checks

### Current feature keys
- `match.mutations`
- `pairs.create`
- `activities.suggestions`
- `questionnaires.premium`
- `lootboxes.access`

### Current quota keys
- `match.mutations.per_day`
- `pairs.create.per_month`
- `activities.suggestions.per_day`

### Error contract
- Feature denied by plan:
  - HTTP `402`
  - `error.code = 'ENTITLEMENT_REQUIRED'`
  - details: `{ feature, plan, requiredPlan }`
- Quota exceeded:
  - HTTP `403`
  - `error.code = 'QUOTA_EXCEEDED'`
  - details: `{ quota, plan, limit, used, resetAt }`

### Dev/admin grant (no external billing in this sprint)
- Endpoint: `POST /api/entitlements/grant`
- Enabled in non-production by default
- In production requires header `x-entitlements-admin-key` matching `ENTITLEMENTS_ADMIN_KEY`
- Body: `{ userId, plan, days?, status? }`

### Runtime integration (implemented)
- `/api/match/like`
- `/api/match/respond`
- `/api/match/accept`
- `/api/match/reject`
- `/api/match/confirm`
- `/api/pairs/create`
- `/api/pairs/[id]/suggest`
- `/api/pairs/[id]/activities/suggest`
- `/api/activities/next`
- `/api/users/me/profile-summary` (featureFlags/plan status now entitlement-derived)
