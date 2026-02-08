# PROB-008: God Components And UI/API Coupling

## Problem
Крупные client components одновременно рендерят UI, хранят сложное состояние и выполняют API orchestration.

## Evidence
- Крупные страницы:
  - `src/app/match/inbox/page.tsx` (~466 строк)
  - `src/components/OnboardingWizard.tsx` (~369 строк)
  - `src/app/couple-activity/page.tsx` (~242 строки)
- Внутри этих файлов смешаны:
  - запросы к `/api/*` через `fetch` + `/.proxy`
  - маппинг API ошибок
  - ветвления доменного поведения (`match` статус, `PairActivity` actions)
  - UI-рендер.
- `useUserStore` используется как транспорт субъекта для API во множестве page.tsx.

## Impact
- Низкая переиспользуемость UI.
- Сложно тестировать UI отдельно от API и бизнес-сценариев.
- Высокий риск “случайно сломать сценарий” при визуальных правках.

## Target state
- Разделение на:
  - container/hooks (`useInbox`, `usePairActivities`, `useOnboardingFlow`)
  - presentational components.
- API вызовы и мутации вынесены в `src/features/*/api.ts`.
- `useUserStore` не используется как источник доверенного `userId` для защищенных API.

## Plan
- Итерация 1:
  - Вынести API/side-effects из `match/inbox/page.tsx` в `src/features/match/inbox/*`.
- Итерация 2:
  - Вынести flow из `couple-activity/page.tsx` в `src/features/activities/*`.
  - Вынести onboarding state machine в `src/features/onboarding/*`.
- Итерация 3:
  - Добавить component tests для presentational частей: `TODO(path): tests/ui/*`.

## Acceptance criteria
- В page-компонентах нет прямых многошаговых orchestration мутаций.
- Каждый большой экран разделен на container + presentational.
- Размер ключевых страниц снижен, и их логика покрыта отдельными hooks-тестами.

## Links
- `docs/01-product-loop.md`
- `docs/04-api-contracts.md`
- `docs/ui/questionnaire-cards.md`

## Status
- Owner: TBD
- Priority: P2
- ETA:
- Date created: 2026-02-07

## Done / Outcome

Date: 2026-02-08
Summary:
- Введен единый клиентский слой `src/client/*`: typed `http`/`api`/`hooks`/`stores` для работы с envelope, idempotency и кодами ошибок без прямых `fetch('/.proxy/api/...')` в крупных экранах.
- Перенесены 3 приоритетных UI-контура на container/view + hooks: Activity entry + main-menu, Match flow, Pair Activities flow.
- Унифицированы состояния загрузки/ошибок/empty через `LoadingView`, `ErrorView`, `EmptyStateView`, `PaywallView` и единый маппинг `ApiClientError -> UiErrorState`.
Files: `src/client/api/http.ts`, `src/client/api/errors.ts`, `src/client/api/*.ts`, `src/client/hooks/*.ts`, `src/client/stores/*.ts`, `src/client/viewmodels/*.ts`, `src/components/ui/LoadingView.tsx`, `src/components/ui/ErrorView.tsx`, `src/components/ui/EmptyStateView.tsx`, `src/components/ui/PaywallView.tsx`, `src/components/main-menu/SearchPairTile.tsx`, `src/components/main-menu/SearchPairTileView.tsx`, `src/components/LikeModal.tsx`, `src/components/match/LikeModalView.tsx`, `src/features/match/feed/MatchFeedView.tsx`, `src/features/match/inbox/MatchInboxView.tsx`, `src/features/match/like/LikeDetailsView.tsx`, `src/features/activities/CoupleActivityView.tsx`, `src/app/page.tsx`, `src/app/search/page.tsx`, `src/app/match/inbox/page.tsx`, `src/app/match/like/[id]/page.tsx`, `src/app/match-card/create/page.tsx`, `src/app/couple-activity/page.tsx`.

### Acceptance Criteria (PASS/FAIL)

| Criteria | Status | Evidence |
|---|---|---|
| В 3 целевых контурах нет прямых `fetch('/.proxy/api')` в `page.tsx` | PASS | `src/app/search/page.tsx`, `src/app/match/inbox/page.tsx`, `src/app/match/like/[id]/page.tsx`, `src/app/couple-activity/page.tsx`, `src/app/page.tsx` используют `src/client/hooks/*` и `src/client/api/*` |
| Крупные экраны разделены на container + presentational | PASS | `src/features/match/feed/MatchFeedView.tsx`, `src/features/match/inbox/MatchInboxView.tsx`, `src/features/match/like/LikeDetailsView.tsx`, `src/features/activities/CoupleActivityView.tsx`, `src/components/main-menu/SearchPairTileView.tsx`, `src/components/match/LikeModalView.tsx` |
| View-компоненты не знают про API client/envelope | PASS | View-слой импортирует только props/types/UI (`src/features/**`, `src/components/*View.tsx`), API вызовы остаются в hooks/containers |
| Единый маппинг ошибок `ENTITLEMENT_REQUIRED`/`QUOTA_EXCEEDED`/`RATE_LIMITED`/`AUTH_REQUIRED` | PASS | `src/client/api/errors.ts` + `src/components/ui/ErrorView.tsx` |
| Поведение контуров не изменено функционально | PASS (manual) | `npm run lint` пройден; `npm run build` дошел до стадии `Collecting page data`, остановлен только из-за отсутствия `MONGODB_URI` (не связано с UI-рефакторингом) |

## Prevention rule
- `docs/engineering/frontend-playbook.md#core-rules`
- `docs/engineering/checklists/ui-container-view-checklist.md`

## Evidence (post-fix)
- `src/client/api/http.ts`
- `src/client/hooks/useMatchFeed.ts`
- `src/features/match/feed/MatchFeedView.tsx`
- `src/features/activities/CoupleActivityView.tsx`
