# Activities As-Is Inventory (2026-02-08)

## 1) Entities

| Name | Purpose | Key fields | Invariants | Relations | Evidence |
|---|---|---|---|---|---|
| `ActivityTemplate` | Канонический шаблон активности | `_id`, `intent`, `archetype`, `axis[]`, `difficulty`, `intensity`, `checkIns[]`, `effect[]`, `preconditions`, `cooldownDays` | `difficulty` строго `1..5`, `intensity` `1..3`, `axis` и `archetype` enum-ограничены | Источник для генерации `PairActivity` в offer-пайплайне | `src/models/ActivityTemplate.ts:29`, `src/models/ActivityTemplate.ts:109`, `src/models/ActivityTemplate.ts:122`, `src/models/ActivityTemplate.ts:125` |
| `PairActivity` | Runtime-инстанс активности пары | `pairId`, `members`, `status`, `offeredAt`, `acceptedAt?`, `checkIns[]`, `answers[]`, `successScore?`, `stateMeta?`, `createdBy` | `offeredAt` обязателен; `status` ограничен enum (`suggested/offered/.../expired/cancelled`); индекс по `pairId+status+dueAt` | Ссылается на `Pair`; содержит ссылки на участников (`members` как `User` ObjectId) | `src/models/PairActivity.ts:11`, `src/models/PairActivity.ts:109`, `src/models/PairActivity.ts:122`, `src/models/PairActivity.ts:145` |
| `RelationshipActivity` (legacy) | Legacy read-only активность совместимости | `userId`, `partnerId`, `type`, `payload`, `status(pending/completed)` | Отмечена как legacy совместимость; индекс для чтения legacy-ленты | Маппится в DTO-вид `PairActivity`-совместимого формата через compat-service | `src/models/RelationshipActivity.ts:9`, `src/models/RelationshipActivity.ts:34`, `src/models/RelationshipActivity.ts:39`, `src/domain/services/relationshipActivityLegacy.service.ts:32` |
| `Pair` (контекст offer/filters) | Пара и контекст подбора | `members`, `status`, `passport.riskZones[]`, `fatigue`, `readiness` | `members` строго 2 элемента; `status` enum `active/paused/ended` | Используется offer-пайплайном для top-risk и difficulty/fatigue логики | `src/models/Pair.ts:15`, `src/models/Pair.ts:54`, `src/models/Pair.ts:57`, `src/domain/services/activityOffer.service.ts:261` |
| `ActivityOfferDTO` | Канонический DTO предложения | `id`, `templateId?`, `title`, `axis`, `difficulty`, `stepsPreview?`, `reward`, `expiresAt?`, `source` | Формируется из `PairActivity` + `stateMeta`; `reward` берется из `fatigueDeltaOnComplete/readinessDeltaOnComplete` (fallback `0`) | Возвращается из `/api/pairs/[id]/suggest`, `/api/pairs/[id]/activities/suggest`, `/api/activities/next` | `src/lib/dto/activity.dto.ts:91`, `src/lib/dto/activity.dto.ts:239`, `src/domain/services/activityOffer.service.ts:361`, `src/domain/services/activityOffer.service.ts:404` |
| `PairActivityDTO` (включая legacy flag) | DTO чтения активностей в UI | `id`, `pairId`, `status`, `checkIns`, `legacy?`, `legacySource?` | Может содержать `legacy: true` для legacy-записей | Возвращается `GET /api/pairs/[id]/activities` (merge канонических + legacy) | `src/lib/dto/activity.dto.ts:21`, `src/lib/dto/activity.dto.ts:64`, `src/lib/dto/activity.dto.ts:290`, `src/app/api/pairs/[id]/activities/route.ts:97` |

## 2) State machine

### Статусы
- `PairActivity.status`: `suggested`, `offered`, `accepted`, `in_progress`, `awaiting_checkin`, `completed_success`, `completed_partial`, `failed`, `expired`, `cancelled`.
- Evidence: `src/models/PairActivity.ts:47`, `src/models/PairActivity.ts:125`.

### Переходы (фактически реализованные)

| Action | From | To | Кто может | Endpoint/Service | Evidence |
|---|---|---|---|---|---|
| `ACCEPT` | `offered` | `accepted` | Любой участник пары (`A`/`B`) | `POST /api/activities/[id]/accept` -> `activitiesService.acceptActivity` -> `activityTransition` | `src/app/api/activities/[id]/accept/route.ts:33`, `src/domain/services/activities.service.ts:57`, `src/domain/state/activityMachine.ts:82` |
| `ACCEPT` (noop) | `accepted` | `accepted` | Любой участник пары | Та же цепочка | `src/domain/state/activityMachine.ts:73`, `src/domain/state/activityMachine.ts:79` |
| `CANCEL` | `offered/accepted/in_progress/awaiting_checkin` | `cancelled` | Любой участник пары | `POST /api/activities/[id]/cancel` | `src/domain/state/activityMachine.ts:105`, `src/domain/services/activities.service.ts:110` |
| `CANCEL` (noop) | `cancelled` | `cancelled` | Любой участник пары | `POST /api/activities/[id]/cancel` | `src/domain/state/activityMachine.ts:95` |
| `CHECKIN` | `accepted/in_progress/awaiting_checkin` | `awaiting_checkin` | Любой участник пары; роль пишется в `answers.by` | `POST /api/activities/[id]/checkin` | `src/domain/state/activityMachine.ts:123`, `src/domain/state/activityMachine.ts:132`, `src/domain/services/activities.service.ts:177` |
| `COMPLETE` | `accepted/in_progress/awaiting_checkin` | `completed_success` \| `completed_partial` \| `failed` | Любой участник пары | `POST /api/activities/[id]/complete` | `src/domain/state/activityMachine.ts:151`, `src/domain/state/activityMachine.ts:159`, `src/domain/services/activities.service.ts:221` |

### Кто может выполнять переходы
- Доступ к activity-мутациям идет через `requireSession` + `requireActivityMember`.
- `requireActivityMember` проверяет membership через пару и возвращает роль `A|B`.
- Role не ограничивает тип действия (нет отдельного allow-list per role); роль используется для `answers.by` и в деталях ошибок.
- Evidence: `src/app/api/activities/[id]/accept/route.ts:18`, `src/domain/services/activities.service.ts:32`, `src/lib/auth/resourceGuards.ts:47`, `src/domain/state/activityMachine.ts:60`, `src/domain/state/activityMachine.ts:135`.

### Ошибки
- `401`: `AUTH_REQUIRED` / `AUTH_INVALID_SESSION` из `requireSession`.
- `403`: `ACCESS_DENIED` при отсутствии membership.
- `404`: `NOT_FOUND` (invalid ObjectId или отсутствующий activity/pair).
- `409`: `STATE_CONFLICT` при запрещенном переходе.
- Дополнительно для idempotent-маршрутов: `422` (`IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID`), `409` (`IDEMPOTENCY_IN_PROGRESS` / `IDEMPOTENCY_KEY_REUSE_CONFLICT`).
- Evidence: `src/lib/auth/guards.ts:16`, `src/lib/auth/resourceGuards.ts:41`, `src/lib/auth/resourceGuards.ts:54`, `src/domain/state/activityMachine.ts:54`, `src/lib/idempotency/key.ts:39`, `src/lib/idempotency/withIdempotency.ts:59`.

### Idempotency
- Backend idempotency включена для:
  - `/api/activities/[id]/accept`
  - `/api/activities/[id]/cancel`
  - `/api/activities/[id]/checkin`
  - `/api/activities/[id]/complete`
- Ключ обязателен и должен быть UUID; replay хранится в `idempotency_records` (TTL 48h).
- Evidence: `src/app/api/activities/[id]/accept/route.ts:27`, `src/app/api/activities/[id]/cancel/route.ts:27`, `src/app/api/activities/[id]/checkin/route.ts:43`, `src/app/api/activities/[id]/complete/route.ts:28`, `src/models/IdempotencyRecord.ts:35`.

## 3) Offers/Suggestions pipeline

### Источники генерации

| Source endpoint | Service entry | Особенности | Evidence |
|---|---|---|---|
| `POST /api/pairs/[id]/suggest` | `activityOfferService.suggestActivities` | `dedupeAgainstLastOffered: false`, `source: 'pairs.suggest'` | `src/app/api/pairs/[id]/suggest/route.ts:53` |
| `POST /api/pairs/[id]/activities/suggest` | `activityOfferService.suggestActivities` | `dedupeAgainstLastOffered: true`, `source: 'pairs.activities.suggest'` | `src/app/api/pairs/[id]/activities/suggest/route.ts:53` |
| `POST /api/activities/next` | `activityOfferService.createNextActivity` | Ищет активную пару юзера, затем `count:1`, `source:'activities.next'` | `src/app/api/activities/next/route.ts:39`, `src/domain/services/activityOffer.service.ts:371`, `src/domain/services/activityOffer.service.ts:384` |
| `POST /api/pairs/[id]/activities/from-template` | `activityOfferService.createFromTemplate` | Прямое создание `offered` по `templateId` | `src/app/api/pairs/[id]/activities/from-template/route.ts:35`, `src/domain/services/activityOffer.service.ts:412` |
| `POST /api/match/confirm` (seed) | `matchService.confirmLike` -> `seedSuggestionsForPair` -> `activityOfferService.suggestActivities` | Seed выполняется только если нет `offered` у пары | `src/domain/services/match.service.ts:136`, `src/domain/services/match.service.ts:140`, `src/domain/services/match.service.ts:572` |

### Фильтры/ранжирование и генерация
- Guard: сначала membership пары (`requirePairMember`).
- Top-risk ось: берется максимальная `severity` из `pair.passport.riskZones`.
- Difficulty: вычисляется из `topRiskSeverity` с поправкой на `pair.fatigue.score`.
- Candidate templates:
  - match по `axis` + `difficulty in [d, d-1, d+1]`
  - random sample (`$sample`)
  - fallback `find(...).sort(updatedAt:-1)`
  - optional dedupe по последнему `stateMeta.templateId` у `offered`.
- Создание `PairActivity`:
  - `status: 'offered'`, `offeredAt: now`, `dueAt: now + 3 days`
  - `stateMeta: { templateId, source, stepsPreview }`
  - `createdBy: 'system'` (suggest/next) или `'user'` (from-template).
- Возврат наружу: `toActivityOfferDTO(...)`.
- Evidence: `src/domain/services/activityOffer.service.ts:43`, `src/domain/services/activityOffer.service.ts:95`, `src/domain/services/activityOffer.service.ts:127`, `src/domain/services/activityOffer.service.ts:201`, `src/domain/services/activityOffer.service.ts:270`, `src/domain/services/activityOffer.service.ts:312`, `src/domain/services/activityOffer.service.ts:337`, `src/domain/services/activityOffer.service.ts:361`, `src/domain/services/activityOffer.service.ts:465`.

### Аудит пайплайна предложений
- На каждом прогоне suggest-пайплайна эмитится `SUGGESTIONS_GENERATED` с `pairId`, `count`, `source`.
- Evidence: `src/domain/services/activityOffer.service.ts:165`, `src/domain/services/activityOffer.service.ts:173`, `src/lib/audit/eventTypes.ts:201`.

## 4) API inventory

| Endpoint | Method | Request DTO (as-is) | Response DTO (as-is) | Guards/AuthZ | Idempotency (server) | Rate limit | Entitlements/Quota | Evidence |
|---|---|---|---|---|---|---|---|---|
| `/api/activities/next` | POST | query passthrough (body не требуется) | `jsonOk({ activityId, offer? })` | `requireSession`; в сервисе поиск active pair | Нет `withIdempotency` | Нет `enforceRateLimit` | `assertEntitlement('activities.suggestions')` + `assertQuota('activities.suggestions.per_day')` | `src/app/api/activities/next/route.ts:17`, `src/app/api/activities/next/route.ts:20`, `src/domain/services/activityOffer.service.ts:371`, `src/app/api/activities/next/route.ts:43` |
| `/api/activities/[id]/accept` | POST | path `{id}` | `jsonOk({})` | `requireSession` + `requireActivityMember` (через service) | Да (`withIdempotency`) | Нет | Нет | `src/app/api/activities/[id]/accept/route.ts:22`, `src/app/api/activities/[id]/accept/route.ts:27`, `src/domain/services/activities.service.ts:54` |
| `/api/activities/[id]/cancel` | POST | path `{id}` | `jsonOk({})` | `requireSession` + `requireActivityMember` | Да | Нет | Нет | `src/app/api/activities/[id]/cancel/route.ts:22`, `src/app/api/activities/[id]/cancel/route.ts:27`, `src/domain/services/activities.service.ts:108` |
| `/api/activities/[id]/checkin` | POST | path `{id}` + body `{ answers: [{checkInId, ui}] }` (min 1) | `jsonOk({ success:number })` | `requireSession` + `requireActivityMember` | Да | Нет | Нет | `src/app/api/activities/[id]/checkin/route.ts:18`, `src/app/api/activities/[id]/checkin/route.ts:43`, `src/domain/services/activities.service.ts:157` |
| `/api/activities/[id]/complete` | POST | path `{id}` | `jsonOk({ success:number, status })` | `requireSession` + `requireActivityMember` | Да | Нет | Нет | `src/app/api/activities/[id]/complete/route.ts:23`, `src/app/api/activities/[id]/complete/route.ts:28`, `src/domain/services/activities.service.ts:217` |
| `/api/pairs/[id]/activities` | GET | path `{id}` + query `s?` (`current/suggested/history` или raw status) | `jsonOk(PairActivityDTO[])`; merge canonical + legacy | `requireSession` + `requirePairMember` | Нет | Нет | Нет | `src/app/api/pairs/[id]/activities/route.ts:56`, `src/app/api/pairs/[id]/activities/route.ts:75`, `src/app/api/pairs/[id]/activities/route.ts:89`, `src/app/api/pairs/[id]/activities/route.ts:103` |
| `/api/pairs/[id]/suggest` | POST | path `{id}` | `jsonOk(ActivityOfferDTO[])` | `requireSession`; membership через service guard | Нет `withIdempotency` | Нет | Да (`activities.suggestions`, `activities.suggestions.per_day`) | `src/app/api/pairs/[id]/suggest/route.ts:24`, `src/app/api/pairs/[id]/suggest/route.ts:36`, `src/app/api/pairs/[id]/suggest/route.ts:53` |
| `/api/pairs/[id]/activities/suggest` | POST | path `{id}` | `jsonOk(ActivityOfferDTO[])` | `requireSession`; membership через service guard | Нет | Нет | Да (`activities.suggestions`, `activities.suggestions.per_day`) | `src/app/api/pairs/[id]/activities/suggest/route.ts:24`, `src/app/api/pairs/[id]/activities/suggest/route.ts:36`, `src/app/api/pairs/[id]/activities/suggest/route.ts:53` |
| `/api/pairs/[id]/activities/from-template` | POST | path `{id}` + body `{ templateId }` | `jsonOk({ id, offer? })` | `requireSession`; membership через service guard | Нет | Нет | Нет | `src/app/api/pairs/[id]/activities/from-template/route.ts:18`, `src/app/api/pairs/[id]/activities/from-template/route.ts:35`, `src/domain/services/activityOffer.service.ts:416` |

Дополнение по idempotency-контракту:
- Для маршрутов с `withIdempotency`: обязателен `Idempotency-Key` (UUID), иначе `422`.
- Evidence: `src/lib/idempotency/key.ts:35`, `src/lib/idempotency/key.ts:45`.

## 5) UI entrypoints

| UI entrypoint | Где пользователь видит/жмет | Data flow (hooks/api) | API calls | Evidence |
|---|---|---|---|---|
| Main menu tile | Плитка `АКТИВНОСТЬ ПАРЫ` | `Link href='/couple-activity'` | Навигация в страницу активностей | `src/components/main-menu/CoupleActivityTile.tsx:7`, `src/app/main-menu/page.tsx:21` |
| Couple activity page (load) | Страница `/couple-activity` | `usePair()` -> `pairId`; `useActivityOffers()` -> `refetch()` | `GET /api/pairs/{id}/activities?s=current|suggested|history` | `src/app/couple-activity/page.tsx:16`, `src/client/hooks/useActivityOffers.ts:80`, `src/client/api/activities.api.ts:23` |
| Suggested tab: “Предложить/Еще варианты” | Кнопки suggest | `suggestNext()` -> `activitiesApi.suggestPairActivities(pairId)` -> refetch | `POST /api/pairs/{id}/suggest` + 3 GET bucket-запроса | `src/features/activities/CoupleActivityView.tsx:119`, `src/client/hooks/useActivityOffers.ts:102`, `src/client/api/activities.api.ts:26` |
| Suggested card actions | “Принять” / “Отклонить” | `acceptActivity(id)` / `cancelActivity(id)` -> refetch | `POST /api/activities/{id}/accept|cancel` | `src/features/activities/CoupleActivityView.tsx:134`, `src/client/hooks/useActivityOffers.ts:129`, `src/client/hooks/useActivityOffers.ts:139` |
| Active card: “Завершить” | Кнопка открывает `CheckInModal` | `onOpenCheckIn` -> modal submit -> `checkInActivity(activityId,{answers})` | `POST /api/activities/{id}/checkin` | `src/features/activities/CoupleActivityView.tsx:99`, `src/app/couple-activity/page.tsx:55`, `src/client/hooks/useActivityOffers.ts:149` |
| Pair profile page | CTA “К активностям” + блок “Текущая активность” | `pairsApi.getSummary(pairId)` | `GET /api/pairs/{id}/summary` (+ переход в `/couple-activity`) | `src/features/pair/PairProfilePageClient.tsx:66`, `src/features/pair/PairProfilePageClient.tsx:150`, `src/client/api/pairs.api.ts:25` |
| Profile “Личная активность” | Блок в `/profile` | `usersApi.getProfileSummary()`; `activity.current/suggested` показываются как summary | `GET /api/users/me/profile-summary` (activities там сейчас заглушка) | `src/app/(auth)/profile/page.tsx:39`, `src/app/(auth)/profile/page.tsx:109`, `src/app/api/users/me/profile-summary/route.ts:181` |

## 6) Audit/analytics

### Какие события эмитятся по Activities-контексту

| Event | Где эмитится | Полезные поля для аналитики | Evidence |
|---|---|---|---|
| `SUGGESTIONS_GENERATED` | Offer pipeline (`activityOfferService`) | `pairId`, `count`, `source` (`pairs.suggest` / `pairs.activities.suggest` / `activities.next`) | `src/domain/services/activityOffer.service.ts:173`, `src/lib/audit/eventTypes.ts:201` |
| `ACTIVITY_ACCEPTED` | Lifecycle service | `activityId`, `status:'accepted'`, `context.pairId` | `src/domain/services/activities.service.ts:80`, `src/lib/audit/eventTypes.ts:87` |
| `ACTIVITY_CANCELED` | Lifecycle service | `activityId`, `status:'cancelled'` | `src/domain/services/activities.service.ts:129`, `src/lib/audit/eventTypes.ts:91` |
| `ACTIVITY_CHECKED_IN` | Lifecycle service | `activityId`, `answersCount`, `success`, `status:'awaiting_checkin'` | `src/domain/services/activities.service.ts:186`, `src/lib/audit/eventTypes.ts:95` |
| `ACTIVITY_COMPLETED` | Lifecycle service | `activityId`, `success`, `status` (`completed_success/partial/failed`) | `src/domain/services/activities.service.ts:256`, `src/lib/audit/eventTypes.ts:101` |
| `LEGACY_RELATIONSHIP_ACTIVITY_VIEWED` | Legacy compat read (`/pairs/[id]/activities`) | `pairId`, `count` | `src/domain/services/relationshipActivityLegacy.service.ts:100`, `src/lib/audit/eventTypes.ts:197` |
| `ENTITLEMENT_DENIED` | Entitlement/Quota guards (в т.ч. suggestion endpoints) | `reason`, `feature/quota`, `plan`, `limit`, `used`, `resetAt`, `route` | `src/lib/entitlements/guards.ts:86`, `src/lib/audit/eventTypes.ts:179` |

### Какие метрики можно строить (по текущим полям)
- Воронка activities: `SUGGESTIONS_GENERATED` -> `ACTIVITY_ACCEPTED` -> `ACTIVITY_CHECKED_IN` -> `ACTIVITY_COMPLETED`.
- Конверсия по источнику предложения: `source` из `SUGGESTIONS_GENERATED`.
- Качество выполнения: распределение `success` и статусов completion.
- Legacy-tail: объем legacy-чтений (`LEGACY_RELATIONSHIP_ACTIVITY_VIEWED.count`).
- Платежные/доступовые отказы на suggest-flow: `ENTITLEMENT_DENIED` по `reason=feature|quota`.
- Evidence: `src/lib/audit/eventTypes.ts:201`, `src/lib/audit/eventTypes.ts:95`, `src/lib/audit/eventTypes.ts:101`, `src/lib/audit/eventTypes.ts:179`.

### Blind spots (факты)
- Нет отдельного события создания активности через `/api/pairs/[id]/activities/from-template`.
  - Evidence: в `createFromTemplate` нет `emitEvent`, `src/domain/services/activityOffer.service.ts:412`.
- Нет события просмотра canonical activities-ленты (есть только legacy-view event при наличии legacy).
  - Evidence: `src/app/api/pairs/[id]/activities/route.ts:103`, `src/domain/services/relationshipActivityLegacy.service.ts:98`.
- В EventLog нет `requestId` поля (есть `request.route/method/ip/ua`), поэтому нет прямой корреляции request-chain через отдельный ID.
  - Evidence: `src/models/EventLog.ts:50`.

## 7) Gaps list (As-Is, max 10)

1. UI не вызывает endpoint завершения активности: кнопка «Завершить» открывает check-in, после submit вызывается только `/checkin`, но не `/complete`.
- Evidence: `src/features/activities/CoupleActivityView.tsx:99`, `src/app/couple-activity/page.tsx:55`, `src/client/hooks/useActivityOffers.ts:159`.

2. Клиент выставляет `idempotency: true` для suggest/next/from-template, но backend для этих маршрутов не использует `withIdempotency`.
- Evidence: `src/client/api/activities.api.ts:26`, `src/client/api/activities.api.ts:31`, `src/client/api/activities.api.ts:46`, `src/client/api/activities.api.ts:42`, `src/app/api/pairs/[id]/suggest/route.ts:24`, `src/app/api/activities/next/route.ts:16`, `src/app/api/pairs/[id]/activities/from-template/route.ts:24`.

3. На activity-endpoints нет rate limiting (policy registry не включает их, и в маршрутах нет `enforceRateLimit`).
- Evidence: `src/lib/abuse/rateLimit.ts:19`, `src/app/api/activities/next/route.ts:1`, `src/app/api/pairs/[id]/suggest/route.ts:1`.

4. `/api/pairs/[id]/activities/from-template` обходит entitlement/quota-гейты, которые есть на suggest/next.
- Evidence: `src/app/api/pairs/[id]/activities/from-template/route.ts:1`, `src/app/api/pairs/[id]/suggest/route.ts:36`, `src/app/api/activities/next/route.ts:25`.

5. Часть статусов объявлена, но не выставляется мутациями (`suggested`, `in_progress`, `expired` для PairActivity).
- Evidence: `src/models/PairActivity.ts:47`, `src/domain/services/activityOffer.service.ts:336`, `src/domain/services/activities.service.ts:72`, `src/domain/services/match.service.ts:564`.

6. Inconsistency по статусу пары: suggest/from-template требуют только membership (даже для paused/ended), тогда как `/api/activities/next` ищет только `status:'active'`.
- Evidence: `src/lib/auth/resourceGuards.ts:28`, `src/domain/services/activityOffer.service.ts:259`, `src/domain/services/activityOffer.service.ts:371`.

7. Поля `ActivityTemplate.preconditions` и `cooldownDays` есть в модели, но в фильтрации/ранжировании candidate templates не участвуют.
- Evidence: `src/models/ActivityTemplate.ts:52`, `src/models/ActivityTemplate.ts:59`, `src/domain/services/activityOffer.service.ts:203`, `src/domain/services/activityOffer.service.ts:224`.

8. Контракт `/api/activity-templates` ограничивает `difficulty` до `max(3)`, хотя модель и offer-пайплайн работают с `1..5`.
- Evidence: `src/app/api/activity-templates/route.ts:17`, `src/models/ActivityTemplate.ts:36`, `src/domain/services/activityOffer.service.ts:130`.

9. Есть mismatch типов client API vs server response: `completeActivity` типизирован как `MutationAckDTO`, но backend возвращает `{ success, status }`; `createFromTemplate` клиентский response тип не включает `offer`.
- Evidence: `src/client/api/activities.api.ts:67`, `src/domain/services/activities.service.ts:217`, `src/client/api/types.ts:257`, `src/domain/services/activityOffer.service.ts:416`.

10. Нет audit-события создания activity через template-flow (`createdBy:'user'`), поэтому этот источник не выделен аналитически как отдельный event.
- Evidence: `src/domain/services/activityOffer.service.ts:434`, `src/domain/services/activityOffer.service.ts:465`, `src/lib/audit/eventTypes.ts:8`.

## Related docs (cross-check)
- `docs/02-domain-model.md:51` фиксирует canonical модель `ActivityTemplate + PairActivity` и legacy-статус `RelationshipActivity`.
- `docs/03-state-machines.md:56` фиксирует переход на centralized `activityMachine`.
- `docs/04-api-contracts.md:265` фиксирует унификацию `ActivityOfferDTO` и contract для suggest/next.
- `docs/problems/PROB-009-duplicate-activity-suggestion-flows.md:55` фиксирует consolidation suggestion pipeline.
- `docs/problems/PROB-010-legacy-relationship-activity-still-present.md:54` фиксирует runtime legacy-compat слой.

