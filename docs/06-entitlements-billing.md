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
